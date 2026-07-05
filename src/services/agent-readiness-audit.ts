import { StorePublicApi, type StoreSnapshot } from "../adapters/store-public-api.js";
import {
  agentReadinessAuditReportSchema,
  agentReadinessAuditRequestSchema,
  type AgentReadinessAuditReport,
  type AuditFinding
} from "../models/agent-audit.js";
import { sha256Hex } from "./hash.js";

const usdcDecimals = 1_000_000;
const observedPaymasterFeeUsdc = 0.00986;

export async function runAgentReadinessAudit(input: unknown, storeApi = new StorePublicApi()): Promise<AgentReadinessAuditReport> {
  const request = agentReadinessAuditRequestSchema.parse(input);
  const snapshot = await storeApi.getSnapshot({
    query: request.query ?? request.serviceId ?? request.agentId ?? "agent readiness",
    useLiveStore: request.useLiveStore
  });
  const target = resolveTarget(snapshot, request.agentId, request.serviceId, request.query);
  const findings = buildFindings(target.agent, target.service, request.mode, request.maxProbeSpendUsdc);
  const scores = scoreTarget(target.agent, target.service, findings);
  const servicePriceUsdc = target.service ? microUsdc(target.service.price) : microUsdc(target.agent?.minServicePrice);
  const reportWithoutHash = {
    serviceName: "agent_readiness_audit" as const,
    mode: request.mode,
    generatedAt: new Date().toISOString(),
    target: {
      agentId: stringValue(target.agent?.agentId ?? target.service?.agentId),
      agentName: stringValue(target.agent?.name),
      serviceId: stringValue(target.service?.serviceId),
      serviceName: stringValue(target.service?.name)
    },
    marketContext: marketContext(snapshot),
    scores,
    feeEstimate: {
      servicePriceUsdc,
      observedPaymasterFeeUsdc,
      estimatedTrueCostUsdc: servicePriceUsdc == null ? undefined : roundUsdc(servicePriceUsdc + observedPaymasterFeeUsdc),
      source: "Observed from two completed CAP Synthetic Order Harness orders on Base; actual paymaster fee varies per transaction."
    },
    recommendation: recommendation(scores.overall, findings),
    findings,
    evidence: evidence(target.agent, target.service, snapshot)
  };

  return agentReadinessAuditReportSchema.parse({
    ...reportWithoutHash,
    receiptHash: sha256Hex(reportWithoutHash)
  });
}

function resolveTarget(snapshot: StoreSnapshot, agentId?: string, serviceId?: string, query?: string) {
  const service =
    findById(snapshot.services, "serviceId", serviceId) ??
    (query ? findByQuery(snapshot.services, query, ["name", "description"]) : undefined);
  const resolvedAgentId = agentId ?? stringValue(service?.agentId);
  const agent =
    findById(snapshot.agents, "agentId", resolvedAgentId) ??
    (query ? findByQuery(snapshot.agents, query, ["name", "description"]) : undefined);

  return { agent, service };
}

function scoreTarget(agent: Record<string, unknown> | undefined, service: Record<string, unknown> | undefined, findings: AuditFinding[]) {
  const description = `${stringValue(agent?.description) ?? ""} ${stringValue(service?.description) ?? ""}`.trim();
  const tagCount = Array.isArray(agent?.skillTagSlugs) ? agent.skillTagSlugs.length : 0;
  const listingQuality = clamp(
    35 +
      Math.min(description.length / 8, 35) +
      Math.min(tagCount * 5, 20) +
      (service ? 10 : 0) -
      (description.length < 80 ? 20 : 0)
  );
  const completedOrders = numberValue(agent?.completedOrders);
  const completionRate = numberValue(agent?.completionRate);
  const capEvidence = clamp((completedOrders > 0 ? 35 : 0) + Math.min(completedOrders * 4, 25) + Math.min(completionRate, 40));
  const demandSignal = clamp(Math.min(numberValue(service?.orders7d) / 70, 70) + Math.min(numberValue(agent?.totalVolume) / 20_000, 30));
  const priceUsdc = service ? microUsdc(service.price) : microUsdc(agent?.minServicePrice);
  const costTransparency = clamp(
    80 +
      (priceUsdc != null && priceUsdc <= 0.1 ? 10 : 0) -
      (priceUsdc != null && priceUsdc > 5 ? 25 : 0) -
      (findings.some((finding) => finding.category === "cost") ? 20 : 0)
  );
  const penalty = findings.filter((finding) => finding.severity === "fail").length * 16 + findings.filter((finding) => finding.severity === "warn").length * 6;
  const overall = clamp(listingQuality * 0.25 + capEvidence * 0.35 + demandSignal * 0.15 + costTransparency * 0.25 - penalty);

  return {
    listingQuality: Math.round(listingQuality),
    capEvidence: Math.round(capEvidence),
    demandSignal: Math.round(demandSignal),
    costTransparency: Math.round(costTransparency),
    overall: Math.round(overall),
    grade: grade(overall)
  };
}

function buildFindings(
  agent: Record<string, unknown> | undefined,
  service: Record<string, unknown> | undefined,
  mode: string,
  maxProbeSpendUsdc: number
): AuditFinding[] {
  const findings: AuditFinding[] = [];

  if (!agent) {
    findings.push({
      severity: "fail",
      category: "discovery",
      message: "No matching public CROO agent was found in the sampled market data.",
      remediation: "Provide an exact agentId or refresh against the live public Store API."
    });
  }
  if (!service) {
    findings.push({
      severity: "warn",
      category: "service",
      message: "No exact service was resolved for this audit.",
      remediation: "Provide a serviceId to audit price, SLA, and recent order demand precisely."
    });
  }

  const completionRate = numberValue(agent?.completionRate);
  const completedOrders = numberValue(agent?.completedOrders);
  if (completedOrders === 0) {
    findings.push({
      severity: "warn",
      category: "cap",
      message: "The agent has no completed orders in the sampled public data.",
      remediation: "Run a low-cost live probe or complete a self-test order before treating the listing as production-ready."
    });
  } else if (completionRate < 80) {
    findings.push({
      severity: "warn",
      category: "cap",
      message: `Completion rate is ${completionRate}%, below the 80% readiness threshold.`,
      remediation: "Investigate rejected, expired, or failed orders and verify provider uptime."
    });
  }

  const descriptionLength = `${stringValue(agent?.description) ?? ""} ${stringValue(service?.description) ?? ""}`.trim().length;
  if (descriptionLength < 80) {
    findings.push({
      severity: "warn",
      category: "listing",
      message: "The listing description is short for agent-to-agent discovery.",
      remediation: "Add input schema, output promise, evidence sources, SLA behavior, and failure boundaries."
    });
  }

  const servicePrice = microUsdc(service?.price);
  if (servicePrice != null && servicePrice < observedPaymasterFeeUsdc) {
    findings.push({
      severity: "info",
      category: "cost",
      message: "Estimated paymaster sponsorship can be near or above the service price for very cheap services.",
      remediation: "Show true-cost guidance in the listing or price above expected sponsorship overhead."
    });
  }

  if (mode === "live_probe" && maxProbeSpendUsdc <= 0) {
    findings.push({
      severity: "fail",
      category: "safety",
      message: "Live probe mode was requested without a positive maxProbeSpendUsdc.",
      remediation: "Set an explicit max probe spend before creating paid CROO orders."
    });
  }

  return findings;
}

function marketContext(snapshot: StoreSnapshot) {
  const stats = snapshot.platformStats;
  return {
    totalAgents: numberValue(stats.totalAgents),
    totalServices: numberValue(stats.totalServices),
    totalOrders: numberValue(stats.totalOrders),
    totalVolumeUsdc: microUsdc(stats.totalVolume) ?? numberValue(stats.totalVolumeUsdc),
    sampledAgents: snapshot.agents.length,
    sampledServices: snapshot.services.length
  };
}

function evidence(agent: Record<string, unknown> | undefined, service: Record<string, unknown> | undefined, snapshot: StoreSnapshot) {
  const items = [
    { label: "snapshot_id", value: snapshot.snapshotId },
    { label: "snapshot_degraded", value: String(snapshot.degraded) },
    { label: "agent_completed_orders", value: String(numberValue(agent?.completedOrders)) },
    { label: "agent_completion_rate", value: `${numberValue(agent?.completionRate)}%` }
  ];

  if (service?.serviceId) {
    items.push({ label: "service_orders_7d", value: String(numberValue(service.orders7d)) });
  }

  return items;
}

function recommendation(overall: number, findings: AuditFinding[]): AgentReadinessAuditReport["recommendation"] {
  if (findings.some((finding) => finding.severity === "fail")) {
    return "FIX_BEFORE_LAUNCH";
  }
  if (overall >= 82) {
    return "SAFE_TO_HIRE";
  }
  if (overall >= 55) {
    return "PROBE_FIRST";
  }
  return "INSUFFICIENT_DATA";
}

function grade(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

function findById(items: Array<Record<string, unknown>>, key: string, id?: string): Record<string, unknown> | undefined {
  if (!id) {
    return undefined;
  }
  return items.find((item) => stringValue(item[key]) === id);
}

function findByQuery(items: Array<Record<string, unknown>>, query: string, keys: string[]): Record<string, unknown> | undefined {
  const normalized = query.toLowerCase();
  return items.find((item) => keys.some((key) => stringValue(item[key])?.toLowerCase().includes(normalized)));
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function microUsdc(value: unknown): number | undefined {
  if (value == null || value === "") {
    return undefined;
  }
  return roundUsdc(numberValue(value) / usdcDecimals);
}

function roundUsdc(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}
