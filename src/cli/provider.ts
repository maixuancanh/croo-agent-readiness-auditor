#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { Command } from "commander";
import { loadLocalEnv } from "../config/env.js";
import { harnessConfigSchema } from "../models/harness.js";
import { startProviderRuntime } from "../services/provider-runtime.js";

loadLocalEnv();

const program = new Command();

program
  .name("croo-provider")
  .description("Run the CROO provider worker for CAP Synthetic Order Harness.")
  .option("-c, --config <path>", "Fallback harness config path", "examples/cap-harness.config.json")
  .option("--once", "Close after the first paid order is delivered", false)
  .action(async (options: { config: string; once: boolean }) => {
    const providerSdkKey = requiredEnv("CROO_SDK_KEY");
    const targetServiceId = requiredEnv("CROO_TARGET_SERVICE_ID");
    const auditorServiceId = process.env.CROO_AUDITOR_SERVICE_ID;
    const fallback = harnessConfigSchema.parse(JSON.parse(await readFile(options.config, "utf8")));

    console.log("[croo-provider] starting provider worker");
    console.log(`[croo-provider] target service=${targetServiceId}`);
    if (auditorServiceId) {
      console.log(`[croo-provider] auditor service=${auditorServiceId}`);
    }
    console.log("[croo-provider] safety: this worker never calls payOrder and never spends USDC");

    await startProviderRuntime(
      {
        configPath: options.config,
        providerSdkKey,
        targetServiceId,
        auditorServiceId,
        once: options.once
      },
      fallback
    );

    console.log("[croo-provider] connected; waiting for CROO events");
  });

await program.parseAsync(process.argv);

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required. Check .env.local.`);
  }
  return value;
}
