import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { ReadinessReport } from "../models/harness.js";

export async function writeJsonReport(path: string, report: ReadinessReport): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

export async function writeMarkdownReport(path: string, report: ReadinessReport): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const rows = report.scenarioMatrix
    .map((result) => `| ${result.scenario} | ${result.status} | ${result.durationMs} | ${result.summary} |`)
    .join("\n");
  const coverage = Object.entries(report.lifecycleCoverage)
    .map(([stage, status]) => `- ${stage}: ${status}`)
    .join("\n");
  const remediation = report.remediation.length
    ? report.remediation.map((item) => `- ${item}`).join("\n")
    : "- No remediation required for simulated readiness.";

  await writeFile(
    path,
    `# CAP Synthetic Order Harness Report

Mode: ${report.mode}
Simulated: ${report.simulated}
Readiness: ${report.readinessStatus}
Receipt: ${report.receiptHash}

## Lifecycle Coverage

${coverage}

## Scenario Matrix

| Scenario | Status | Duration ms | Summary |
| --- | --- | ---: | --- |
${rows}

## Remediation

${remediation}

All local results are simulated and are not live CAP settlement evidence.
`,
    "utf8"
  );
}
