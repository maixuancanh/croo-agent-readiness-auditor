import type { HarnessConfig, ReadinessReport, ScenarioResult } from "../models/harness.js";
import { readinessReportSchema } from "../models/harness.js";
import { sha256Hex } from "./hash.js";

const lifecycleStages = ["Negotiate", "Lock", "Deliver", "Clear"] as const;

export function buildReadinessReport(config: HarnessConfig, results: ScenarioResult[], startedAt: number): ReadinessReport {
  const lifecycleCoverage = Object.fromEntries(
    lifecycleStages.map((stage) => [
      stage,
      results.some((result) => result.lifecycleEvents.some((event) => event.stage === stage)) ? "covered" : "missing"
    ])
  ) as Record<(typeof lifecycleStages)[number], "covered" | "missing">;

  const remediation = Array.from(new Set(results.flatMap((result) => result.remediation)));
  const readinessStatus = results.every((result) => result.status === "PASS") ? "PASS" : "FAIL";
  const reportWithoutHash = {
    serviceName: config.serviceName,
    mode: config.mode,
    simulated: config.mode === "simulation",
    readinessStatus,
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    lifecycleCoverage,
    scenarioMatrix: results,
    remediation,
    notes: [
      "All local results are simulated and are not live CAP settlement evidence.",
      "Do not call payOrder or spend USDC without explicit max-spend approval."
    ]
  };

  return readinessReportSchema.parse({
    ...reportWithoutHash,
    receiptHash: sha256Hex(reportWithoutHash)
  });
}

export function shouldFailCi(report: ReadinessReport, threshold: HarnessConfig["ciThreshold"]): boolean {
  if (threshold === "core") {
    const core = new Set(["success", "timeout", "schema_mismatch", "payment_failure", "invalid_proof"]);
    return report.scenarioMatrix.some((result) => core.has(result.scenario) && result.status !== "PASS");
  }

  return report.readinessStatus !== "PASS";
}
