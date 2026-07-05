import type { Negotiation } from "@croo-network/sdk";
import { CrooLiveAdapter } from "../adapters/croo-live-adapter.js";
import { sha256Hex } from "./hash.js";

export interface NegotiationSmokeOptions {
  requirements: unknown;
  execute: boolean;
}

export interface NegotiationSmokeReport {
  mode: "dry-run" | "executed";
  targetServiceId: string;
  chain: "Base Mainnet";
  chainId: 8453;
  paymentToken: "USDC";
  requesterSdkKeyPresent: boolean;
  providerSdkKeyPresent: boolean;
  stoppedBeforePayOrder: true;
  expectedEvents: string[];
  requestHash: string;
  negotiation?: Pick<Negotiation, "negotiationId" | "serviceId" | "status" | "expiresAt">;
  nextManualStep: string;
}

export async function runNegotiationSmoke(options: NegotiationSmokeOptions): Promise<NegotiationSmokeReport> {
  const targetServiceId = requiredEnv("CROO_TARGET_SERVICE_ID");
  const requesterSdkKey = options.execute ? requiredEnv("CROO_REQUESTER_SDK_KEY") : process.env.CROO_REQUESTER_SDK_KEY;
  const providerSdkKey = process.env.CROO_SDK_KEY ?? "";
  const adapter = new CrooLiveAdapter({
    providerSdkKey,
    requesterSdkKey,
    targetServiceId,
    authorizedMaxUsdcSpend: 0
  });

  const requirements = JSON.stringify(options.requirements);
  const baseReport = {
    targetServiceId,
    chain: "Base Mainnet" as const,
    chainId: 8453 as const,
    paymentToken: "USDC" as const,
    requesterSdkKeyPresent: Boolean(requesterSdkKey),
    providerSdkKeyPresent: Boolean(providerSdkKey),
    stoppedBeforePayOrder: true as const,
    expectedEvents: adapter.expectedEventTypes(),
    requestHash: sha256Hex({ serviceId: targetServiceId, requirements }),
    nextManualStep: "Inspect the created negotiation/order in CROO, then request explicit max-spend approval before any payOrder."
  };

  if (!options.execute) {
    return {
      mode: "dry-run",
      ...baseReport
    };
  }

  const requester = adapter.createRequesterClient();
  const negotiation = await requester.negotiateOrder({
    serviceId: targetServiceId,
    requirements,
    metadata: JSON.stringify({
      source: "cap-synthetic-order-harness",
      smoke: "negotiate-only",
      stoppedBeforePayOrder: true
    })
  });

  return {
    mode: "executed",
    ...baseReport,
    negotiation: {
      negotiationId: negotiation.negotiationId,
      serviceId: negotiation.serviceId,
      status: negotiation.status,
      expiresAt: negotiation.expiresAt
    }
  };
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for CROO negotiation smoke.`);
  }
  return value;
}
