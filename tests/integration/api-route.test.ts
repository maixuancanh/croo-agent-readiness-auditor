import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import { registerRoutes } from "../../src/api/routes.js";

describe("POST /services/cap-harness/run", () => {
  it("runs the harness through the local API", async () => {
    const app = Fastify();
    await registerRoutes(app);

    const response = await app.inject({
      method: "POST",
      url: "/services/cap-harness/run",
      payload: {
        providerUrl: "demo://provider",
        serviceName: "cap_synthetic_order_harness",
        mode: "simulation",
        timeoutMs: 100,
        requestPayload: { agentEndpoint: "http://localhost:8788/service", capability: "risk_report", requestId: "api" },
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
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().readinessStatus).toBe("PASS");
  });
});
