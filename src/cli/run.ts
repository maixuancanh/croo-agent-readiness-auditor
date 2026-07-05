#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { Command } from "commander";
import { loadLocalEnv } from "../config/env.js";
import { harnessConfigSchema } from "../models/harness.js";
import { runAgentReadinessAudit } from "../services/agent-readiness-audit.js";
import { runLiveE2eSmoke } from "../services/croo-e2e-smoke.js";
import { runNegotiationSmoke } from "../services/croo-smoke.js";
import { runHarness } from "../services/harness-service.js";
import { deliverPaidOrderOnce } from "../services/provider-runtime.js";
import { shouldFailCi } from "../services/readiness-report.js";
import { writeJsonReport, writeMarkdownReport } from "../services/report-writer.js";
import {
  buildAgentReadinessAuditRegistrationBundle,
  buildServiceRegistrationBundle,
  writeServiceRegistrationBundle
} from "../services/service-registration.js";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const program = new Command();
loadLocalEnv();

program.name("cap-harness").description("CAP Synthetic Order Harness").version("0.1.0");

program
  .command("run")
  .requiredOption("-c, --config <path>", "Harness JSON config path")
  .option("-m, --mode <mode>", "Override mode: simulation or live")
  .option("-r, --report <path>", "JSON report path", "out/readiness.json")
  .option("--markdown <path>", "Optional markdown report path")
  .option("--ci", "Exit non-zero when readiness threshold fails", false)
  .action(async (options: { config: string; mode?: string; report: string; markdown?: string; ci: boolean }) => {
    const config = JSON.parse(await readFile(options.config, "utf8")) as Record<string, unknown>;
    if (options.mode) {
      config.mode = options.mode;
    }

    const report = await runHarness(config);
    await writeJsonReport(options.report, report);
    if (options.markdown) {
      await writeMarkdownReport(options.markdown, report);
    }

    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

    if (options.ci && shouldFailCi(report, report.scenarioMatrix.length ? (config.ciThreshold as "all" | "core" | undefined) ?? "all" : "all")) {
      process.exitCode = 1;
    }
  });

program
  .command("export-service")
  .requiredOption("-c, --config <path>", "Harness JSON config path")
  .option("-o, --out <path>", "Service registration bundle path", "out/croo-service-registration.json")
  .action(async (options: { config: string; out: string }) => {
    const config = JSON.parse(await readFile(options.config, "utf8")) as Record<string, unknown>;
    const bundle = buildServiceRegistrationBundle(config);
    await writeServiceRegistrationBundle(options.out, bundle);
    process.stdout.write(`${JSON.stringify(bundle, null, 2)}\n`);
  });

program
  .command("export-auditor-service")
  .option("-o, --out <path>", "Agent readiness auditor service registration bundle path", "out/croo-agent-readiness-auditor-registration.json")
  .action(async (options: { out: string }) => {
    const bundle = buildAgentReadinessAuditRegistrationBundle();
    await writeServiceRegistrationBundle(options.out, bundle);
    process.stdout.write(`${JSON.stringify(bundle, null, 2)}\n`);
  });

program
  .command("agent-readiness-audit")
  .requiredOption("-i, --input <path>", "Agent readiness audit request JSON path")
  .option("-o, --out <path>", "JSON report path", "out/agent-readiness-audit.json")
  .action(async (options: { input: string; out: string }) => {
    const input = JSON.parse(await readFile(options.input, "utf8")) as Record<string, unknown>;
    const report = await runAgentReadinessAudit(input);
    await mkdir(dirname(options.out), { recursive: true });
    await writeFile(options.out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  });

program
  .command("croo-negotiate-smoke")
  .requiredOption("-c, --config <path>", "Harness JSON config path used as requirements")
  .option("--execute", "Actually call CROO negotiateOrder. Still stops before payOrder.", false)
  .action(async (options: { config: string; execute: boolean }) => {
    const config = harnessConfigSchema.parse(JSON.parse(await readFile(options.config, "utf8")));
    const report = await runNegotiationSmoke({
      requirements: config.requestPayload,
      execute: options.execute
    });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  });

program
  .command("croo-live-e2e")
  .requiredOption("-c, --config <path>", "Harness JSON config path used as requirements")
  .option("--execute", "Actually negotiate, pay the order, and wait for provider delivery.", false)
  .option("--order-id <id>", "Resume from an already-created CROO order instead of creating a new negotiation")
  .requiredOption("--max-usdc-spend <amount>", "Maximum allowed order price in USDC")
  .action(async (options: { config: string; execute: boolean; orderId?: string; maxUsdcSpend: string }) => {
    const config = harnessConfigSchema.parse(JSON.parse(await readFile(options.config, "utf8")));
    const maxUsdcSpend = Number(options.maxUsdcSpend);
    if (!Number.isFinite(maxUsdcSpend) || maxUsdcSpend <= 0) {
      throw new Error("--max-usdc-spend must be a positive number.");
    }

    const report = await runLiveE2eSmoke({
      requirements: config.requestPayload,
      execute: options.execute,
      maxUsdcSpend,
      orderId: options.orderId
    });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  });

program
  .command("croo-deliver-paid-order")
  .requiredOption("-c, --config <path>", "Harness JSON config path used as fallback")
  .requiredOption("--order-id <id>", "Paid CROO order id to deliver")
  .action(async (options: { config: string; orderId: string }) => {
    const config = harnessConfigSchema.parse(JSON.parse(await readFile(options.config, "utf8")));
    const providerSdkKey = process.env.CROO_SDK_KEY;
    const targetServiceId = process.env.CROO_TARGET_SERVICE_ID;
    if (!providerSdkKey) {
      throw new Error("CROO_SDK_KEY is required for delivery.");
    }
    if (!targetServiceId) {
      throw new Error("CROO_TARGET_SERVICE_ID is required for delivery.");
    }

    const report = await deliverPaidOrderOnce(options.orderId, providerSdkKey, targetServiceId, config);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  });

await program.parseAsync(process.argv);
