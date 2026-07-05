export interface CrooOrderInput {
  negotiationId?: string;
  orderId: string;
  serviceId: string;
  payload: unknown;
}

export interface CrooDeliveryReceipt {
  orderId: string;
  deliveryHash: string;
  receiptHash: string;
  deliveredAt: string;
}

export interface CrooAccessKey {
  serviceId: string;
  sdkKeyPresent: boolean;
  requesterSdkKeyPresent: boolean;
}

export interface CrooSettlementBoundary {
  chain: "Base Mainnet";
  chainId: 8453;
  paymentToken: "USDC";
  liveOrderVerified: false;
  paidOperationRequiresExplicitMaxSpend: true;
}

export interface CrooAdapter {
  describeAccess(): CrooAccessKey;
  validateOrderInput(input: CrooOrderInput): void;
  deliver(orderId: string, deliverable: unknown): Promise<CrooDeliveryReceipt>;
  settlementBoundary(): CrooSettlementBoundary;
}
