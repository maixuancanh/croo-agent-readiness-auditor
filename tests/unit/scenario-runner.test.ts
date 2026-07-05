import { describe, expect, it } from "vitest";
import { harnessConfigSchema } from "../../src/models/harness.js";
import { runScenario } from "../../src/services/scenario-runner.js";

const baseConfig = harnessConfigSchema.parse({
  providerUrl: "demo://provider",
  serviceName: "cap_synthetic_order_harness",
  timeoutMs: 100,
  requestPayload: { agentEndpoint: "http://localhost:8788/service", capability: "risk_report", requestId: "test" },
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

describe("runScenario", () => {
  it("passes the synthetic success scenario", async () => {
    const result = await runScenario(baseConfig, "success");
    expect(result.status).toBe("PASS");
    expect(result.lifecycleEvents.map((event) => event.stage)).toEqual(
      expect.arrayContaining(["Negotiate", "Lock", "Deliver", "Clear"])
    );
  });

  it("passes when timeout is detected", async () => {
    const result = await runScenario(baseConfig, "timeout");
    expect(result.status).toBe("PASS");
    expect(result.summary).toContain("SLA timeout");
  });

  it("passes when schema mismatch is detected with a path", async () => {
    const result = await runScenario(baseConfig, "schema_mismatch");
    expect(result.status).toBe("PASS");
    expect(result.schemaErrors.some((error) => error.path === "/findings")).toBe(true);
  });
});
