import { sha256Hex } from "../services/hash.js";
import type { HarnessConfig, LifecycleEvent, ScenarioName, SyntheticOrder } from "../models/harness.js";

export class CapSimulationAdapter {
  private events: LifecycleEvent[] = [];

  reset(): void {
    this.events = [];
  }

  getEvents(): LifecycleEvent[] {
    return [...this.events];
  }

  negotiate(config: HarnessConfig, scenario: ScenarioName): SyntheticOrder {
    this.record("negotiation_created", "Negotiate", `Synthetic negotiation for ${scenario}`);
    this.record("negotiation_accepted", "Negotiate", "Provider accepted synthetic negotiation");
    this.record("order_created", "Negotiate", "Synthetic CAP order created");

    return {
      negotiationId: `sim-neg-${scenario}`,
      orderId: `sim-order-${scenario}`,
      requester: "synthetic-requester",
      provider: config.serviceName,
      stage: "negotiated",
      payloadHash: sha256Hex(config.requestPayload),
      expectedOutcome: scenario
    };
  }

  lock(order: SyntheticOrder, shouldFail = false): SyntheticOrder {
    if (shouldFail) {
      this.record("order_payment_failed", "Lock", "Payment failure simulated before escrow lock");
      return { ...order, stage: "rejected" };
    }

    this.record("order_paid", "Lock", "Synthetic USDC escrow lock simulated");
    return { ...order, stage: "locked" };
  }

  deliver(order: SyntheticOrder, proofHash?: string): SyntheticOrder {
    this.record("order_delivered", "Deliver", proofHash ? `Delivery proof ${proofHash}` : "Delivery submitted");
    return { ...order, stage: "delivering" };
  }

  clear(order: SyntheticOrder): SyntheticOrder {
    this.record("order_completed", "Clear", "Synthetic clear/release simulated");
    return { ...order, stage: "cleared" };
  }

  expire(order: SyntheticOrder): SyntheticOrder {
    this.record("order_expired", "Clear", "SLA timeout simulated");
    return { ...order, stage: "expired" };
  }

  dispute(order: SyntheticOrder): SyntheticOrder {
    this.record("dispute_opened", "Clear", "Synthetic dispute path opened after invalid delivery");
    this.record("order_rejected", "Clear", "Synthetic order rejected after dispute review");
    return { ...order, stage: "rejected" };
  }

  private record(name: LifecycleEvent["name"], stage: LifecycleEvent["stage"], detail: string): void {
    this.events.push({
      name,
      stage,
      at: new Date().toISOString(),
      simulated: true,
      detail
    });
  }
}
