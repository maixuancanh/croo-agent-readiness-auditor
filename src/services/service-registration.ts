import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { harnessConfigSchema, type HarnessConfig } from "../models/harness.js";
import { sha256Hex } from "./hash.js";

export interface ServiceRegistrationBundle {
  service: {
    name: string;
    description: string;
    priceUsdc: string;
    slaSeconds: number;
    requirementsType: "schema";
    deliverableType: "schema";
    skillTags: string[];
  };
  requirementsSchema: Record<string, unknown>;
  deliverableSchema: Record<string, unknown>;
  sampleRequirements: Record<string, unknown>;
  notes: string[];
  receiptHash: string;
}

export interface AgentReadinessAuditRegistrationBundle {
  service: {
    name: "agent_readiness_audit";
    description: string;
    priceUsdc: string;
    slaSeconds: number;
    requirementsType: "schema";
    deliverableType: "schema";
    skillTags: string[];
  };
  requirementsSchema: Record<string, unknown>;
  deliverableSchema: Record<string, unknown>;
  sampleRequirements: Record<string, unknown>;
  notes: string[];
  receiptHash: string;
}

export function buildServiceRegistrationBundle(input: unknown): ServiceRegistrationBundle {
  const config = harnessConfigSchema.parse(input);
  const bundleWithoutHash = {
    service: {
      name: config.serviceName,
      description:
        "Runs synthetic CROO CAP order lifecycle readiness checks across success, timeout, schema mismatch, payment failure, and invalid proof scenarios.",
      priceUsdc: "5",
      slaSeconds: config.slaSeconds,
      requirementsType: "schema" as const,
      deliverableType: "schema" as const,
      skillTags: ["developer-tooling", "cap", "readiness", "testing", "simulation"]
    },
    requirementsSchema: config.inputSchema,
    deliverableSchema: readinessDeliverableJsonSchema(),
    sampleRequirements: config.requestPayload,
    notes: [
      "Register this as a schema requirements/schema deliverable CROO Agent Store Service.",
      "Simulation output is local readiness evidence only, not live CAP settlement evidence.",
      "Do not run payOrder until exact max USDC spend is explicitly approved."
    ]
  };

  return {
    ...bundleWithoutHash,
    receiptHash: sha256Hex(bundleWithoutHash)
  };
}

export async function writeServiceRegistrationBundle(path: string, bundle: ServiceRegistrationBundle | AgentReadinessAuditRegistrationBundle): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(bundle, null, 2)}\n`, "utf8");
}

export function buildAgentReadinessAuditRegistrationBundle(): AgentReadinessAuditRegistrationBundle {
  const bundleWithoutHash = {
    service: {
      name: "agent_readiness_audit" as const,
      description:
        "Audits a CROO Agent Store listing or service for CAP readiness, completion evidence, listing quality, demand signal, and true-cost estimates from observed paymaster fees.",
      priceUsdc: "0.03",
      slaSeconds: 300,
      requirementsType: "schema" as const,
      deliverableType: "schema" as const,
      skillTags: ["data-analytics", "research-report", "development-code", "automation-workflow"]
    },
    requirementsSchema: agentReadinessAuditRequirementsSchema(),
    deliverableSchema: agentReadinessAuditDeliverableSchema(),
    sampleRequirements: {
      agent_id: "11339c57-f401-4955-95a3-26fd0937fdce",
      service_id: "b47a05f8-c885-4967-b2cd-71135f202e49",
      mode: "listing_audit"
    },
    notes: [
      "Register as a schema requirements/schema deliverable service.",
      "Use listing_audit by default; live_probe requires an explicit max spend before creating paid CROO orders.",
      "This service positions the project as the trust/readiness layer for a crowded CROO Agent Store."
    ]
  };

  return {
    ...bundleWithoutHash,
    receiptHash: sha256Hex(bundleWithoutHash)
  };
}

export function readinessDeliverableJsonSchema(): Record<string, unknown> {
  return {
    type: "object",
    required: [
      "serviceName",
      "mode",
      "simulated",
      "readinessStatus",
      "generatedAt",
      "durationMs",
      "lifecycleCoverage",
      "scenarioMatrix",
      "remediation",
      "receiptHash",
      "notes"
    ],
    properties: {
      serviceName: { type: "string" },
      mode: { enum: ["simulation", "live"] },
      simulated: { type: "boolean" },
      readinessStatus: { enum: ["PASS", "FAIL"] },
      generatedAt: { type: "string" },
      durationMs: { type: "number", minimum: 0 },
      lifecycleCoverage: {
        type: "object",
        additionalProperties: { enum: ["covered", "missing"] }
      },
      scenarioMatrix: {
        type: "array",
        items: {
          type: "object",
          required: ["scenario", "status", "simulated", "durationMs", "lifecycleEvents", "schemaErrors", "remediation", "summary"],
          properties: {
            scenario: { enum: ["success", "timeout", "schema_mismatch", "payment_failure", "invalid_proof", "dispute_path"] },
            status: { enum: ["PASS", "FAIL", "ERROR"] },
            simulated: { type: "boolean" },
            durationMs: { type: "number", minimum: 0 },
            lifecycleEvents: { type: "array" },
            schemaErrors: { type: "array" },
            proofHash: { type: "string" },
            remediation: { type: "array", items: { type: "string" } },
            summary: { type: "string" }
          }
        }
      },
      remediation: { type: "array", items: { type: "string" } },
      receiptHash: { type: "string" },
      notes: { type: "array", items: { type: "string" } }
    },
    additionalProperties: false
  };
}

export function agentReadinessAuditRequirementsSchema(): Record<string, unknown> {
  return {
    type: "object",
    required: ["mode"],
    properties: {
      agent_id: { type: "string" },
      service_id: { type: "string" },
      query: { type: "string" },
      mode: { enum: ["listing_audit", "launch_readiness", "live_probe"] },
      max_probe_spend_usdc: { type: "number" }
    }
  };
}

export function agentReadinessAuditDeliverableSchema(): Record<string, unknown> {
  return {
    type: "object",
    required: ["grade", "recommendation", "overall_score", "fee_estimate", "finding_summary", "receipt_hash"],
    properties: {
      grade: { enum: ["A", "B", "C", "D", "F"] },
      recommendation: { enum: ["SAFE_TO_HIRE", "PROBE_FIRST", "FIX_BEFORE_LAUNCH", "INSUFFICIENT_DATA"] },
      overall_score: { type: "number" },
      fee_estimate: { type: "string" },
      finding_summary: { type: "string" },
      receipt_hash: { type: "array", items: { type: "string" } },
      target_agent: { type: "string" },
      target_service: { type: "string" }
    }
  };
}
