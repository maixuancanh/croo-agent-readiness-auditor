import { AgentClient, Config, DeliverableType, EventType } from "@croo-network/sdk";
import { sha256Hex } from "../services/hash.js";
import type { CrooAdapter, CrooDeliveryReceipt, CrooOrderInput, CrooSettlementBoundary } from "./croo-adapter.js";

export interface CrooLiveAdapterConfig {
  providerSdkKey: string;
  requesterSdkKey?: string;
  targetServiceId?: string;
  authorizedMaxUsdcSpend?: number;
}

export class CrooLiveAdapter implements CrooAdapter {
  private readonly config: Config;

  constructor(private readonly options: CrooLiveAdapterConfig) {
    this.config = {
      baseURL: process.env.CROO_API_URL ?? "https://api.croo.network",
      wsURL: process.env.CROO_WS_URL ?? "wss://api.croo.network/ws",
      rpcURL: process.env.BASE_RPC_URL ?? "https://mainnet.base.org",
      logger: redactingLogger
    };
  }

  createProviderClient(): AgentClient {
    return new AgentClient(this.config, this.options.providerSdkKey);
  }

  createRequesterClient(): AgentClient {
    if (!this.options.requesterSdkKey) {
      throw new Error("CROO_REQUESTER_SDK_KEY is required for requester smoke tests.");
    }
    return new AgentClient(this.config, this.options.requesterSdkKey);
  }

  assertPaidOperationAuthorized(order: { orderId: string; priceUsdc?: number; payerWallet?: string }): void {
    const maxSpend = this.options.authorizedMaxUsdcSpend ?? 0;
    const price = order.priceUsdc ?? 0;

    if (maxSpend <= 0 || price > maxSpend) {
      throw new Error(
        [
          "payOrder blocked: explicit max USDC spend approval is required.",
          `target service id: ${this.options.targetServiceId ?? "unknown"}`,
          `order id: ${order.orderId}`,
          `price: ${price} USDC`,
          "chain: Base Mainnet (8453)",
          `payer AA wallet: ${order.payerWallet ?? "unknown"}`,
          `approved max spend: ${maxSpend} USDC`
        ].join("\n")
      );
    }
  }

  expectedEventTypes(): string[] {
    return [
      EventType.NegotiationCreated,
      EventType.OrderCreated,
      EventType.OrderPaid,
      EventType.OrderCompleted,
      EventType.OrderRejected,
      EventType.OrderExpired
    ].map(String);
  }

  describeAccess() {
    return {
      serviceId: this.options.targetServiceId ?? "not-configured",
      sdkKeyPresent: Boolean(this.options.providerSdkKey),
      requesterSdkKeyPresent: Boolean(this.options.requesterSdkKey)
    };
  }

  validateOrderInput(input: CrooOrderInput): void {
    if (!input.orderId || !input.serviceId) {
      throw new Error("CROO order input requires orderId and serviceId.");
    }
  }

  async deliver(orderId: string, deliverable: unknown): Promise<CrooDeliveryReceipt> {
    const client = this.createProviderClient();
    const deliveryHash = sha256Hex(deliverable);
    await client.deliverOrder(orderId, {
      deliverableType: DeliverableType.Schema,
      deliverableSchema: JSON.stringify(deliverable)
    });
    return {
      orderId,
      deliveryHash,
      receiptHash: sha256Hex({ orderId, deliveryHash }),
      deliveredAt: new Date().toISOString()
    };
  }

  settlementBoundary(): CrooSettlementBoundary {
    return {
      chain: "Base Mainnet",
      chainId: 8453,
      paymentToken: "USDC",
      liveOrderVerified: false,
      paidOperationRequiresExplicitMaxSpend: true
    };
  }
}

const secretPattern = /croo_sk_[A-Za-z0-9]+/g;

const redactingLogger = {
  debug: (...args: unknown[]) => console.debug(...args.map(redactLogValue)),
  error: (...args: unknown[]) => console.error(...args.map(redactLogValue)),
  info: (...args: unknown[]) => console.info(...args.map(redactLogValue)),
  log: (...args: unknown[]) => console.log(...args.map(redactLogValue)),
  warn: (...args: unknown[]) => console.warn(...args.map(redactLogValue))
};

function redactLogValue(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(secretPattern, "croo_sk_***");
  }
  if (Array.isArray(value)) {
    return value.map(redactLogValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactLogValue(item)]));
  }
  return value;
}
