import { z } from "zod";

export const auditModeSchema = z.enum(["listing_audit", "launch_readiness", "live_probe"]).default("listing_audit");

export const agentReadinessAuditRequestSchema = z.preprocess((value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  const record = value as Record<string, unknown>;
  return {
    ...record,
    agentId: record.agentId ?? record.agent_id,
    serviceId: record.serviceId ?? record.service_id,
    useLiveStore: record.useLiveStore ?? record.use_live_store,
    maxProbeSpendUsdc: record.maxProbeSpendUsdc ?? record.max_probe_spend_usdc
  };
}, z
  .object({
    agentId: z.string().uuid().optional(),
    serviceId: z.string().uuid().optional(),
    query: z.string().min(2).optional(),
    mode: auditModeSchema,
    useLiveStore: z.boolean().default(true),
    maxProbeSpendUsdc: z.number().min(0).default(0)
  })
  .refine((value) => value.agentId || value.serviceId || value.query, {
    message: "Provide agentId, serviceId, or query."
  }));

export const auditFindingSchema = z.object({
  severity: z.enum(["info", "warn", "fail"]),
  category: z.string(),
  message: z.string(),
  remediation: z.string()
});

export const agentReadinessAuditReportSchema = z.object({
  serviceName: z.literal("agent_readiness_audit"),
  mode: auditModeSchema,
  generatedAt: z.string(),
  target: z.object({
    agentId: z.string().optional(),
    agentName: z.string().optional(),
    serviceId: z.string().optional(),
    serviceName: z.string().optional()
  }),
  marketContext: z.object({
    totalAgents: z.number(),
    totalServices: z.number(),
    totalOrders: z.number(),
    totalVolumeUsdc: z.number(),
    sampledAgents: z.number(),
    sampledServices: z.number()
  }),
  scores: z.object({
    listingQuality: z.number().min(0).max(100),
    capEvidence: z.number().min(0).max(100),
    demandSignal: z.number().min(0).max(100),
    costTransparency: z.number().min(0).max(100),
    overall: z.number().min(0).max(100),
    grade: z.enum(["A", "B", "C", "D", "F"])
  }),
  feeEstimate: z.object({
    servicePriceUsdc: z.number().min(0).optional(),
    observedPaymasterFeeUsdc: z.number().min(0),
    estimatedTrueCostUsdc: z.number().min(0).optional(),
    source: z.string()
  }),
  recommendation: z.enum(["SAFE_TO_HIRE", "PROBE_FIRST", "FIX_BEFORE_LAUNCH", "INSUFFICIENT_DATA"]),
  findings: z.array(auditFindingSchema),
  evidence: z.array(
    z.object({
      label: z.string(),
      value: z.string(),
      url: z.string().optional()
    })
  ),
  receiptHash: z.string()
});

export type AgentReadinessAuditRequest = z.infer<typeof agentReadinessAuditRequestSchema>;
export type AgentReadinessAuditReport = z.infer<typeof agentReadinessAuditReportSchema>;
export type AuditFinding = z.infer<typeof auditFindingSchema>;
