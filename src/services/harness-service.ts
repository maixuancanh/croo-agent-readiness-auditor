import { harnessConfigSchema, type HarnessConfig, type ReadinessReport } from "../models/harness.js";
import { buildReadinessReport } from "./readiness-report.js";
import { runScenarios } from "./scenario-runner.js";

export async function runHarness(input: unknown): Promise<ReadinessReport> {
  const config = harnessConfigSchema.parse(input);
  ensureLiveSafety(config);
  const startedAt = Date.now();
  const results = await runScenarios(config);
  return buildReadinessReport(config, results, startedAt);
}

function ensureLiveSafety(config: HarnessConfig): void {
  if (config.mode !== "live") {
    return;
  }

  if (process.env.CAP_HARNESS_LIVE_MODE !== "true") {
    throw new Error("Live mode is disabled. Set CAP_HARNESS_LIVE_MODE=true only after explicit authorization.");
  }

  const maxSpend = Number(process.env.CAP_HARNESS_MAX_USDC_SPEND ?? "0");
  if (!Number.isFinite(maxSpend) || maxSpend <= 0 || config.live.authorizedMaxUsdcSpend <= 0) {
    throw new Error("Live mode requires explicit CAP_HARNESS_MAX_USDC_SPEND and config.live.authorizedMaxUsdcSpend.");
  }
}
