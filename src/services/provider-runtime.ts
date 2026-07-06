import { EventType, type Event, type Negotiation, type Order } from "@croo-network/sdk";
import { CrooLiveAdapter } from "../adapters/croo-live-adapter.js";
import { harnessConfigSchema, type HarnessConfig, type ReadinessReport } from "../models/harness.js";
import { runAgentReadinessAudit } from "./agent-readiness-audit.js";
import { runHarness } from "./harness-service.js";
import { sha256Hex } from "./hash.js";

export interface ProviderRuntimeOptions {
  configPath?: string;
  providerSdkKey: string;
  targetServiceId: string;
  auditorServiceId?: string;
  once?: boolean;
}

export interface ProviderRuntimeState {
  acceptedNegotiations: string[];
  deliveredOrders: string[];
  ignoredEvents: number;
}

export function buildHarnessConfigFromNegotiation(negotiation: Negotiation, fallback: HarnessConfig): HarnessConfig {
  const requirements = parseRequirements(negotiation.requirements);
  const requestPayload =
    requirements && typeof requirements === "object" && !Array.isArray(requirements)
      ? (requirements as Record<string, unknown>)
      : fallback.requestPayload;

  return harnessConfigSchema.parse({
    ...fallback,
    mode: "simulation",
    requestPayload
  });
}

export function buildProviderDeliverable(report: ReadinessReport, order: Order): Record<string, unknown> {
  return {
    service_name: report.serviceName,
    readiness_status: report.readinessStatus,
    receipt_hash: report.receiptHash,
    lifecycle_coverage: report.lifecycleCoverage,
    scenario_matrix: report.scenarioMatrix.map((scenario) => `${scenario.scenario}:${scenario.status}:${scenario.summary}`),
    remediation: report.remediation,
    order_id: order.orderId,
    negotiation_id: order.negotiationId,
    simulated: report.simulated,
    notes: report.notes
  };
}

export async function buildAuditDeliverableFromNegotiation(negotiation: Negotiation): Promise<Record<string, unknown>> {
  const requirements = parseRequirements(negotiation.requirements);
  try {
    const report = await runAgentReadinessAudit(requirements);
    return {
      grade: report.scores.grade,
      recommendation: report.recommendation,
      overall_score: report.scores.overall,
      fee_estimate:
        report.feeEstimate.estimatedTrueCostUsdc == null
          ? `paymaster_fee_estimate=${report.feeEstimate.observedPaymasterFeeUsdc} USDC`
          : `service_price=${report.feeEstimate.servicePriceUsdc} USDC; estimated_true_cost=${report.feeEstimate.estimatedTrueCostUsdc} USDC`,
      finding_summary:
        report.findings.length === 0
          ? "No blocking findings."
          : report.findings.map((finding) => `${finding.severity}:${finding.category}:${finding.message}`).join(" | "),
      // Dashboard field was registered as array in the CROO schema builder.
      receipt_hash: [report.receiptHash],
      target_agent: report.target.agentName ?? report.target.agentId ?? "unknown",
      target_service: report.target.serviceName ?? report.target.serviceId ?? "unknown"
    };
  } catch (error) {
    const findingSummary = formatAuditInputError(error);
    return {
      grade: "F",
      recommendation: "FIX_INPUT",
      overall_score: 0,
      fee_estimate: "Not evaluated because the audit request did not match the registered schema.",
      finding_summary: findingSummary,
      receipt_hash: [sha256Hex({ negotiationId: negotiation.negotiationId, requirements, findingSummary })],
      target_agent: "invalid request",
      target_service: "invalid request"
    };
  }
}

export async function deliverPaidOrderOnce(orderId: string, providerSdkKey: string, targetServiceId: string, fallback: HarnessConfig) {
  const adapter = new CrooLiveAdapter({
    providerSdkKey,
    targetServiceId,
    authorizedMaxUsdcSpend: 0
  });
  const client = adapter.createProviderClient();
  const order = await client.getOrder(orderId);
  if (order.serviceId !== targetServiceId) {
    throw new Error(`Order ${orderId} belongs to service ${order.serviceId}, expected ${targetServiceId}.`);
  }
  if (order.status !== "paid") {
    throw new Error(`Order ${orderId} must be paid before delivery, current status is ${order.status}.`);
  }

  const negotiation = await client.getNegotiation(order.negotiationId);
  const harnessConfig = buildHarnessConfigFromNegotiation(negotiation, fallback);
  const report = await runHarness(harnessConfig);
  const deliverable = buildProviderDeliverable(report, order);
  const receipt = await adapter.deliver(order.orderId, deliverable);
  return {
    orderId: order.orderId,
    negotiationId: order.negotiationId,
    readinessStatus: report.readinessStatus,
    receiptHash: report.receiptHash,
    deliveryHash: receipt.deliveryHash
  };
}

export async function startProviderRuntime(options: ProviderRuntimeOptions, fallback: HarnessConfig): Promise<ProviderRuntimeState> {
  const adapter = new CrooLiveAdapter({
    providerSdkKey: options.providerSdkKey,
    targetServiceId: options.targetServiceId,
    authorizedMaxUsdcSpend: 0
  });
  const client = adapter.createProviderClient();
  const stream = await client.connectWebSocket();
  const state: ProviderRuntimeState = {
    acceptedNegotiations: [],
    deliveredOrders: [],
    ignoredEvents: 0
  };

  stream.onAny((event) => {
    const id = event.order_id ?? event.negotiation_id ?? "unknown";
    console.log(`[croo-provider] event=${event.type} id=${id}`);
  });

  stream.on(EventType.NegotiationCreated, async (event: Event) => {
    try {
      if (!isSupportedService(event.service_id, options)) {
        state.ignoredEvents += 1;
        return;
      }

      const negotiationId = requireEventId(event.negotiation_id, "negotiation_id");
      const result = await client.acceptNegotiation(negotiationId);
      state.acceptedNegotiations.push(negotiationId);
      console.log(`[croo-provider] accepted negotiation=${negotiationId} order=${result.order.orderId}`);
    } catch (error) {
      console.error("[croo-provider] failed to accept negotiation", error);
    }
  });

  stream.on(EventType.OrderPaid, async (event: Event) => {
    try {
      if (!isSupportedService(event.service_id, options)) {
        state.ignoredEvents += 1;
        return;
      }

      const orderId = requireEventId(event.order_id, "order_id");
      const order = await client.getOrder(orderId);
      const negotiation = await client.getNegotiation(order.negotiationId);
      const deliverable =
        options.auditorServiceId && order.serviceId === options.auditorServiceId
          ? await buildAuditDeliverableFromNegotiation(negotiation)
          : buildProviderDeliverable(await runHarness(buildHarnessConfigFromNegotiation(negotiation, fallback)), order);
      await adapter.deliver(order.orderId, deliverable);
      state.deliveredOrders.push(order.orderId);
      console.log(`[croo-provider] delivered order=${order.orderId}`);

      if (options.once) {
        stream.close();
      }
    } catch (error) {
      console.error("[croo-provider] failed to deliver order", error);
    }
  });

  return state;
}

function isSupportedService(serviceId: string | undefined, options: ProviderRuntimeOptions): boolean {
  if (!serviceId) {
    return false;
  }
  return serviceId === options.targetServiceId || serviceId === options.auditorServiceId;
}

function parseRequirements(requirements: string): unknown {
  if (!requirements) {
    return undefined;
  }

  try {
    return JSON.parse(requirements);
  } catch {
    return { rawRequirements: requirements };
  }
}

function requireEventId(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`CROO event is missing ${name}.`);
  }
  return value;
}

function formatAuditInputError(error: unknown): string {
  if (error && typeof error === "object" && "issues" in error && Array.isArray((error as { issues?: unknown[] }).issues)) {
    return (error as { issues: Array<{ path?: unknown[]; message?: string }> }).issues
      .map((issue) => {
        const path = issue.path?.length ? `/${issue.path.join("/")}` : "/";
        return `${path}: ${issue.message ?? "invalid value"}`;
      })
      .join(" | ");
  }
  return error instanceof Error ? error.message : "Invalid audit request.";
}
