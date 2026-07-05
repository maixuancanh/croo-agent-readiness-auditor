import { describe, expect, it } from "vitest";
import { buildServiceRegistrationBundle } from "../../src/services/service-registration.js";

describe("service registration bundle", () => {
  it("exports dashboard-ready schema fields for the CAP harness service", () => {
    const bundle = buildServiceRegistrationBundle({
      providerUrl: "demo://provider",
      serviceName: "cap_synthetic_order_harness",
      slaSeconds: 60,
      requestPayload: { agentEndpoint: "http://localhost:8788/service", capability: "risk_report", requestId: "demo" },
      inputSchema: {
        type: "object",
        required: ["agentEndpoint", "capability", "requestId"],
        properties: {
          agentEndpoint: { type: "string" },
          capability: { type: "string" },
          requestId: { type: "string" }
        }
      }
    });

    expect(bundle.service).toMatchObject({
      name: "cap_synthetic_order_harness",
      requirementsType: "schema",
      deliverableType: "schema"
    });
    expect(bundle.requirementsSchema).toMatchObject({ type: "object" });
    expect(bundle.deliverableSchema).toMatchObject({
      type: "object",
      properties: expect.objectContaining({
        readinessStatus: { enum: ["PASS", "FAIL"] },
        receiptHash: { type: "string" }
      })
    });
    expect(bundle.receiptHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});
