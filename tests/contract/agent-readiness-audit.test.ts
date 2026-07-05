import { describe, expect, it } from "vitest";
import type { StoreSnapshot } from "../../src/adapters/store-public-api.js";
import { agentReadinessAuditReportSchema } from "../../src/models/agent-audit.js";
import { runAgentReadinessAudit } from "../../src/services/agent-readiness-audit.js";

const snapshot: StoreSnapshot = {
  snapshotId: "sha256:test",
  fetchedAt: "2026-07-05T00:00:00.000Z",
  degraded: false,
  notes: ["test"],
  platformStats: {
    totalAgents: "759",
    totalServices: "443",
    totalOrders: "108355",
    totalVolume: "166843754350"
  },
  agents: [
    {
      agentId: "11339c57-f401-4955-95a3-26fd0937fdce",
      name: "CAP Synthetic Order Harness",
      description: "Developer tooling agent that verifies CAP lifecycle readiness with live order evidence and schema receipts.",
      completedOrders: "2",
      totalVolume: "20000",
      completionRate: 100,
      minServicePrice: "10000",
      skillTagSlugs: ["data-analytics", "research-report", "development-code", "automation-workflow"]
    }
  ],
  services: [
    {
      serviceId: "b47a05f8-c885-4967-b2cd-71135f202e49",
      agentId: "11339c57-f401-4955-95a3-26fd0937fdce",
      name: "cap_synthetic_order_harness",
      description: "Runs synthetic CROO CAP order lifecycle readiness checks and returns proof-hashed schema deliverables.",
      price: "10000",
      slaMinutes: 5,
      orders7d: "2"
    }
  ],
  leaderboard: [],
  search: [],
  sourceCoverage: {
    platformStats: true,
    agents: true,
    services: true,
    leaderboard: false,
    search: false,
    marketSamples: false
  }
};

describe("agent readiness audit contract", () => {
  it("returns a schema-valid readiness grade with fee estimate", async () => {
    const report = await runAgentReadinessAudit(
      {
        agentId: "11339c57-f401-4955-95a3-26fd0937fdce",
        serviceId: "b47a05f8-c885-4967-b2cd-71135f202e49",
        useLiveStore: true
      },
      {
        getSnapshot: async () => snapshot
      } as never
    );

    expect(agentReadinessAuditReportSchema.parse(report)).toBeTruthy();
    expect(report.target.serviceName).toBe("cap_synthetic_order_harness");
    expect(report.scores.overall).toBeGreaterThan(60);
    expect(report.feeEstimate.estimatedTrueCostUsdc).toBeCloseTo(0.01986, 5);
    expect(report.receiptHash).toMatch(/^sha256:/);
  });
});
