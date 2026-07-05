import { z } from "zod";

export const scenarioNameSchema = z.enum([
  "success",
  "timeout",
  "schema_mismatch",
  "payment_failure",
  "invalid_proof",
  "dispute_path"
]);

export type ScenarioName = z.infer<typeof scenarioNameSchema>;

export const harnessModeSchema = z.enum(["simulation", "live"]);

export const jsonSchemaLike = z.record(z.string(), z.unknown());

export const harnessConfigSchema = z.object({
  providerUrl: z.string().min(1),
  serviceName: z.string().min(1),
  mode: harnessModeSchema.default("simulation"),
  slaSeconds: z.number().int().positive().default(60),
  inputSchema: jsonSchemaLike.default({ type: "object" }),
  outputSchema: jsonSchemaLike.default({ type: "object" }),
  proofRequired: z.boolean().default(true),
  scenarios: z.array(scenarioNameSchema).nonempty().default([
    "success",
    "timeout",
    "schema_mismatch",
    "payment_failure",
    "invalid_proof"
  ]),
  requestPayload: z.record(z.string(), z.unknown()).default({}),
  providerHeaders: z.record(z.string(), z.string()).default({}),
  timeoutMs: z.number().int().positive().default(2000),
  retryCount: z.number().int().min(0).max(3).default(0),
  ciThreshold: z.enum(["all", "core"]).default("all"),
  live: z
    .object({
      targetServiceId: z.string().optional(),
      authorizedMaxUsdcSpend: z.number().nonnegative().default(0)
    })
    .default({ authorizedMaxUsdcSpend: 0 })
});

export type HarnessConfig = z.infer<typeof harnessConfigSchema>;

export const syntheticOrderSchema = z.object({
  orderId: z.string(),
  negotiationId: z.string(),
  requester: z.string(),
  provider: z.string(),
  stage: z.enum(["negotiated", "locked", "delivering", "cleared", "rejected", "expired"]),
  payloadHash: z.string(),
  expectedOutcome: scenarioNameSchema
});

export type SyntheticOrder = z.infer<typeof syntheticOrderSchema>;

export const lifecycleEventSchema = z.object({
  name: z.enum([
    "negotiation_created",
    "negotiation_accepted",
    "order_created",
    "order_paid",
    "order_payment_failed",
    "order_delivered",
    "order_completed",
    "order_rejected",
    "order_expired",
    "dispute_opened"
  ]),
  stage: z.enum(["Negotiate", "Lock", "Deliver", "Clear"]),
  at: z.string(),
  simulated: z.literal(true),
  detail: z.string().optional()
});

export type LifecycleEvent = z.infer<typeof lifecycleEventSchema>;

export const scenarioResultSchema = z.object({
  scenario: scenarioNameSchema,
  status: z.enum(["PASS", "FAIL", "ERROR"]),
  simulated: z.literal(true),
  durationMs: z.number().nonnegative(),
  lifecycleEvents: z.array(lifecycleEventSchema),
  schemaErrors: z.array(
    z.object({
      path: z.string(),
      message: z.string()
    })
  ),
  proofHash: z.string().optional(),
  remediation: z.array(z.string()),
  summary: z.string()
});

export type ScenarioResult = z.infer<typeof scenarioResultSchema>;

export const readinessReportSchema = z.object({
  serviceName: z.string(),
  mode: harnessModeSchema,
  simulated: z.boolean(),
  readinessStatus: z.enum(["PASS", "FAIL"]),
  generatedAt: z.string(),
  durationMs: z.number().nonnegative(),
  lifecycleCoverage: z.record(z.enum(["covered", "missing"])),
  scenarioMatrix: z.array(scenarioResultSchema),
  remediation: z.array(z.string()),
  receiptHash: z.string(),
  notes: z.array(z.string())
});

export type ReadinessReport = z.infer<typeof readinessReportSchema>;

export const providerResponseSchema = z.object({
  ok: z.boolean(),
  result: z.unknown(),
  proof: z
    .object({
      type: z.string(),
      hash: z.string()
    })
    .optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

export type ProviderResponse = z.infer<typeof providerResponseSchema>;
