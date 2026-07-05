import { describe, expect, it } from "vitest";
import { readinessReportSchema } from "../../src/models/harness.js";
import { shouldFailCi } from "../../src/services/readiness-report.js";
import { runHarness } from "../../src/services/harness-service.js";

describe("readiness report contract", () => {
  it("returns a valid report with lifecycle coverage and receipt hash", async () => {
    const report = await runHarness({
      providerUrl: "demo://provider",
      serviceName: "cap_synthetic_order_harness",
      mode: "simulation",
      timeoutMs: 100,
      requestPayload: { agentEndpoint: "http://localhost:8788/service", capability: "risk_report", requestId: "contract" },
      inputSchema: {
        type: "object",
        required: ["agentEndpoint", "capability", "requestId"],
        properties: {
          agentEndpoint: { type: "string" },
          capability: { type: "string" },
          requestId: { type: "string" }
        }
      },
      outputSchema: {
        type: "object",
        required: ["status", "serviceName", "checkedAt", "findings"],
        properties: {
          status: { enum: ["PASS", "WARN", "FAIL"] },
          serviceName: { type: "string" },
          checkedAt: { type: "string" },
          findings: { type: "array" }
        }
      }
    });

    expect(readinessReportSchema.parse(report)).toBeTruthy();
    expect(report.readinessStatus).toBe("PASS");
    expect(report.receiptHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(report.lifecycleCoverage).toMatchObject({
      Negotiate: "covered",
      Lock: "covered",
      Deliver: "covered",
      Clear: "covered"
    });
  });

  it("flags CI failure when any selected scenario fails", () => {
    expect(
      shouldFailCi(
        {
          serviceName: "cap_synthetic_order_harness",
          mode: "simulation",
          simulated: true,
          readinessStatus: "FAIL",
          generatedAt: "2026-07-04T00:00:00.000Z",
          durationMs: 1,
          lifecycleCoverage: { Negotiate: "covered", Lock: "covered", Deliver: "missing", Clear: "covered" },
          scenarioMatrix: [
            {
              scenario: "success",
              status: "FAIL",
              simulated: true,
              durationMs: 1,
              lifecycleEvents: [],
              schemaErrors: [],
              proofHash: "sha256:example",
              remediation: ["Fix provider output."],
              summary: "Expected success path failed"
            }
          ],
          remediation: ["Fix provider output."],
          receiptHash: "sha256:example",
          notes: []
        },
        "all"
      )
    ).toBe(true);
  });
});
