import { afterEach, describe, expect, it } from "vitest";
import { runNegotiationSmoke } from "../../src/services/croo-smoke.js";

describe("runNegotiationSmoke", () => {
  const previousEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...previousEnv };
  });

  it("builds a dry-run negotiation report and always stops before payOrder", async () => {
    process.env.CROO_TARGET_SERVICE_ID = "svc_test";
    process.env.CROO_SDK_KEY = "test_provider_sdk_key";

    const report = await runNegotiationSmoke({
      requirements: { requestId: "dry-run" },
      execute: false
    });

    expect(report).toMatchObject({
      mode: "dry-run",
      targetServiceId: "svc_test",
      requesterSdkKeyPresent: false,
      stoppedBeforePayOrder: true,
      chainId: 8453,
      paymentToken: "USDC"
    });
    expect(report.expectedEvents).toContain("order_negotiation_created");
    expect(report.requestHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});
