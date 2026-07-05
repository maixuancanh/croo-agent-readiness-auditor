import { describe, expect, it } from "vitest";
import type { Negotiation, Order } from "@croo-network/sdk";
import { harnessConfigSchema } from "../../src/models/harness.js";
import {
  buildAuditDeliverableFromNegotiation,
  buildHarnessConfigFromNegotiation,
  buildProviderDeliverable
} from "../../src/services/provider-runtime.js";

describe("provider runtime helpers", () => {
  const fallback = harnessConfigSchema.parse({
    providerUrl: "demo://provider",
    serviceName: "cap_synthetic_order_harness",
    requestPayload: {
      agentEndpoint: "demo://provider",
      capability: "fallback",
      requestId: "fallback"
    },
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

  it("maps negotiation requirements into a simulation harness config", () => {
    const config = buildHarnessConfigFromNegotiation(
      {
        negotiationId: "neg-1",
        serviceId: "svc-1",
        requesterAgentId: "requester",
        providerAgentId: "provider",
        requirements: JSON.stringify({
          agentEndpoint: "https://example.com/service",
          capability: "risk_report",
          requestId: "req-1"
        }),
        status: "pending",
        rejectReason: "",
        metadata: "",
        expiresAt: "",
        createdTime: "",
        updatedTime: ""
      } satisfies Negotiation,
      fallback
    );

    expect(config.mode).toBe("simulation");
    expect(config.requestPayload).toMatchObject({
      agentEndpoint: "https://example.com/service",
      capability: "risk_report",
      requestId: "req-1"
    });
  });

  it("builds snake_case CROO schema deliverables", () => {
    const deliverable = buildProviderDeliverable(
      {
        serviceName: "cap_synthetic_order_harness",
        mode: "simulation",
        simulated: true,
        readinessStatus: "PASS",
        generatedAt: "2026-07-04T00:00:00.000Z",
        durationMs: 1,
        lifecycleCoverage: { Negotiate: "covered", Lock: "covered", Deliver: "covered", Clear: "covered" },
        scenarioMatrix: [],
        remediation: [],
        receiptHash: "sha256:test",
        notes: []
      },
      {
        orderId: "order-1",
        negotiationId: "neg-1",
        chainOrderId: "1",
        serviceId: "svc-1",
        requesterAgentId: "requester",
        providerAgentId: "provider",
        buyerUserId: "buyer",
        requesterWalletAddress: "0x0",
        providerWalletAddress: "0x1",
        price: "0.01",
        paymentToken: "USDC",
        deliveryWindow: 300,
        status: "paid",
        rejectReason: "",
        createTxHash: "",
        payTxHash: "",
        deliverTxHash: "",
        rejectTxHash: "",
        clearTxHash: "",
        slaDeadline: "",
        payDeadline: "",
        createdTime: "",
        updatedTime: "",
        createdAt: "",
        paidAt: "",
        deliveredAt: "",
        rejectedAt: "",
        expiredAt: ""
      } satisfies Order
    );

    expect(deliverable).toMatchObject({
      service_name: "cap_synthetic_order_harness",
      readiness_status: "PASS",
      receipt_hash: "sha256:test",
      order_id: "order-1",
      negotiation_id: "neg-1"
    });
  });

  it("builds compact auditor deliverables from snake_case requirements", async () => {
    const deliverable = await buildAuditDeliverableFromNegotiation({
      negotiationId: "neg-audit",
      serviceId: "svc-audit",
      requesterAgentId: "requester",
      providerAgentId: "provider",
      requirements: JSON.stringify({
        agent_id: "11339c57-f401-4955-95a3-26fd0937fdce",
        service_id: "b47a05f8-c885-4967-b2cd-71135f202e49",
        mode: "listing_audit",
        use_live_store: false
      }),
      status: "pending",
      rejectReason: "",
      metadata: "",
      expiresAt: "",
      createdTime: "",
      updatedTime: ""
    } satisfies Negotiation);

    expect(deliverable).toMatchObject({
      grade: expect.any(String),
      recommendation: expect.any(String),
      overall_score: expect.any(Number),
      finding_summary: expect.any(String),
      receipt_hash: [expect.stringMatching(/^sha256:/)]
    });
  });
});
