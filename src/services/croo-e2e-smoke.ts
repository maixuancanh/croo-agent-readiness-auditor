import type { Order } from "@croo-network/sdk";
import { CrooLiveAdapter } from "../adapters/croo-live-adapter.js";
import { sha256Hex } from "./hash.js";

export interface LiveE2eSmokeOptions {
  requirements: unknown;
  execute: boolean;
  maxUsdcSpend: number;
  orderId?: string;
  timeoutMs?: number;
}

export interface LiveE2eSmokeReport {
  mode: "dry-run" | "executed";
  targetServiceId: string;
  chain: "Base Mainnet";
  chainId: 8453;
  paymentToken: "USDC";
  maxUsdcSpend: number;
  requestHash: string;
  negotiation?: {
    negotiationId: string;
    status: string;
    expiresAt: string;
  };
  order?: {
    orderId: string;
    status: string;
    price: string;
    priceUsdc: number;
    payTxHash?: string;
    deliverTxHash?: string;
  };
  delivery?: {
    deliveryId: string;
    status: string;
    contentHash: string;
  };
}

export async function runLiveE2eSmoke(options: LiveE2eSmokeOptions): Promise<LiveE2eSmokeReport> {
  const targetServiceId = requiredEnv("CROO_TARGET_SERVICE_ID");
  const requesterSdkKey = requiredEnv("CROO_REQUESTER_SDK_KEY");
  const providerSdkKey = requiredEnv("CROO_SDK_KEY");
  const adapter = new CrooLiveAdapter({
    providerSdkKey,
    requesterSdkKey,
    targetServiceId,
    authorizedMaxUsdcSpend: options.maxUsdcSpend
  });
  const requirements = JSON.stringify(options.requirements);
  const baseReport = {
    targetServiceId,
    chain: "Base Mainnet" as const,
    chainId: 8453 as const,
    paymentToken: "USDC" as const,
    maxUsdcSpend: options.maxUsdcSpend,
    requestHash: sha256Hex({ serviceId: targetServiceId, requirements })
  };

  if (!options.execute) {
    return {
      mode: "dry-run",
      ...baseReport
    };
  }

  const requester = adapter.createRequesterClient();
  const negotiation = options.orderId
    ? undefined
    : await requester.negotiateOrder({
        serviceId: targetServiceId,
        requirements,
        metadata: JSON.stringify({
          source: "cap-synthetic-order-harness",
          smoke: "live-e2e",
          maxUsdcSpend: options.maxUsdcSpend
        })
      });

  const order = options.orderId
    ? await requester.getOrder(options.orderId)
    : await pollForOrderByNegotiation(requester, negotiation!.negotiationId, options.timeoutMs ?? 120_000);
  const payableOrder = order.status === "created" ? order : await pollForOrderStatus(requester, order.orderId, ["created"], options.timeoutMs ?? 120_000);
  const priceUsdc = parseUsdcAmount(payableOrder.price);
  adapter.assertPaidOperationAuthorized({
    orderId: payableOrder.orderId,
    priceUsdc,
    payerWallet: payableOrder.requesterWalletAddress
  });

  const paid = await requester.payOrder(payableOrder.orderId);
  const completed = await pollForOrderStatus(requester, payableOrder.orderId, ["delivering", "completed"], options.timeoutMs ?? 120_000);
  const delivery = await tryGetDelivery(requester, payableOrder.orderId);

  return {
    mode: "executed",
    ...baseReport,
    negotiation: negotiation
      ? {
          negotiationId: negotiation.negotiationId,
          status: negotiation.status,
          expiresAt: negotiation.expiresAt
        }
      : undefined,
    order: {
      orderId: completed.orderId,
      status: completed.status,
      price: completed.price,
      priceUsdc,
      payTxHash: paid.txHash || completed.payTxHash || undefined,
      deliverTxHash: completed.deliverTxHash || undefined
    },
    delivery: delivery
      ? {
          deliveryId: delivery.deliveryId,
          status: delivery.status,
          contentHash: delivery.contentHash
        }
      : undefined
  };
}

async function pollForOrderByNegotiation(client: ReturnType<CrooLiveAdapter["createRequesterClient"]>, negotiationId: string, timeoutMs: number): Promise<Order> {
  const deadline = Date.now() + timeoutMs;
  let lastStatuses = "";

  while (Date.now() < deadline) {
    const orders = await client.listOrders({ role: "buyer", pageSize: 20 });
    const order = orders.find((candidate) => candidate.negotiationId === negotiationId);
    if (order) {
      return order;
    }
    lastStatuses = orders.map((candidate) => `${candidate.orderId}:${candidate.status}`).join(", ");
    await delay(2_000);
  }

  throw new Error(`Timed out waiting for order from negotiation ${negotiationId}. Recent requester orders: ${lastStatuses || "none"}`);
}

async function pollForOrderStatus(
  client: ReturnType<CrooLiveAdapter["createRequesterClient"]>,
  orderId: string,
  acceptableStatuses: string[],
  timeoutMs: number
): Promise<Order> {
  const deadline = Date.now() + timeoutMs;
  let lastOrder: Order | undefined;

  while (Date.now() < deadline) {
    lastOrder = await client.getOrder(orderId);
    if (acceptableStatuses.includes(lastOrder.status)) {
      if (lastOrder.status === "paid") {
        await delay(2_000);
        continue;
      }
      return lastOrder;
    }
    if (["rejected", "expired", "pay_failed", "deliver_failed"].includes(lastOrder.status)) {
      throw new Error(`Order ${orderId} entered terminal failure status: ${lastOrder.status}`);
    }
    await delay(2_000);
  }

  throw new Error(`Timed out waiting for order ${orderId}. Last status: ${lastOrder?.status ?? "unknown"}`);
}

async function tryGetDelivery(client: ReturnType<CrooLiveAdapter["createRequesterClient"]>, orderId: string) {
  try {
    return await client.getDelivery(orderId);
  } catch {
    return undefined;
  }
}

function parseUsdcAmount(value: string): number {
  if (value.includes(".")) {
    return Number(value);
  }
  return Number(BigInt(value)) / 1_000_000;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for CROO live E2E smoke.`);
  }
  return value;
}
