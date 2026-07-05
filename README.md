# CROO Agent Readiness Auditor

**CROO Agent Readiness Auditor** is a live CAP-integrated agent that helps buyers and builders answer a practical question before they trust another CROO listing: is this agent actually ready to take an order, settle on-chain, and return a useful deliverable?

The project ships two services under the same provider runtime:

- `agent_readiness_audit` checks a CROO Agent Store listing, scores its market and CAP readiness, estimates the true requester cost, and returns a compact audit receipt.
- `cap_synthetic_order_harness` runs synthetic CAP lifecycle checks for builders who want to test schemas, SLA assumptions, delivery proof shape, and remediation paths before they list or update a service.

The provider is listed on the CROO Agent Store, listens to CROO WebSocket events, accepts matching negotiations, waits for paid orders, and delivers schema results through the CROO SDK. The requester-side payment path was tested with live orders on Base Mainnet using USDC.

## Why It Exists

CROO already makes it easy to list agents. The harder part is knowing which agents are reliable enough to hire, route to, or include in another agent's workflow. Store pages can look complete while still hiding common buyer risks: unclear schemas, no live settlement history, no cost transparency, weak service descriptions, or brittle provider runtimes.

This agent turns those risks into a small, machine-readable receipt. A buyer can use it before spending more money on a service. A builder can use it as a launch checklist before asking other agents to depend on them.

## Live CROO Listing

Provider agent:

- Name: `CAP Synthetic Order Harness`
- Agent ID: `11339c57-f401-4955-95a3-26fd0937fdce`

Services:

- `agent_readiness_audit`
  - Service ID: `55cc0a2d-75de-4f85-a58e-8c16cfecf8bd`
  - Price shown on CROO: `0.01` USDC
  - SLA: `5min`
  - Requirements: schema
  - Deliverable: schema

- `cap_synthetic_order_harness`
  - Service ID: `b47a05f8-c885-4967-b2cd-71135f202e49`
  - Price shown on CROO: `0.01` USDC
  - SLA: `5min`
  - Requirements: schema
  - Deliverable: schema

The live provider worker is deployed as a long-running Railway service so the agent can respond without a local terminal.

## Live CAP Evidence

The project has been tested with real CROO orders and accepted deliveries.

Readiness auditor live order:

- Order ID: `8fa208cf-1c0b-494c-b82e-5d80914a5d95`
- Negotiation ID: `4076b89a-670f-4230-a99d-5df09e2aa2c4`
- Status: `completed`
- Delivery status: `accepted`
- Payment tx: `0x9f84902da2b470ba67588fea7060acf4f33553af7e8882b447aed0985f7e9150`
- Delivery tx: `0x10ae7075b7a17500e6d0c1b9a1f919b2e0ddc9aea28f523c467a233e4bd10ed4`
- Delivery ID: `6b20a67b-2b4f-468b-ac07-b695f5dd9a8a`

Synthetic harness live order:

- Order ID: `56d31178-caf4-43a0-96fa-0ee5306a0e8d`
- Negotiation ID: `b2b92170-c892-40ab-9d7e-69d53d08059b`
- Status: `completed`
- Delivery status: `accepted`
- Payment tx: `0x558d11d759355a9fc54c9189fa274ddbe2abaeb398fe428938d30c4fd602b922`
- Delivery tx: `0x7473ed00060696c1d5aea5706a5e469e6302008f6dc2774484a0ed4f8706caae`
- Delivery ID: `7d27445e-e5f8-4c3a-92e9-75bcc7a69540`
- Receipt hash: `sha256:6608c86b40d61699bde88ba3fd854c6e7ff5ae5c1440770fc5e955f818fe0bf8`

## What The Auditor Returns

`agent_readiness_audit` accepts:

```json
{
  "agent_id": "11339c57-f401-4955-95a3-26fd0937fdce",
  "service_id": "b47a05f8-c885-4967-b2cd-71135f202e49",
  "mode": "listing_audit"
}
```

It returns a schema deliverable with:

- `grade`
- `recommendation`
- `overall_score`
- `fee_estimate`
- `finding_summary`
- `receipt_hash`
- `target_agent`
- `target_service`

The local report also includes supporting evidence, public CROO market observations, scoring components, and a deterministic receipt hash.

## CAP Integration

The provider worker uses the official `@croo-network/sdk` package:

- `AgentClient` for provider and requester operations
- `Config` for CROO API, WebSocket, and Base RPC settings
- `EventType.NegotiationCreated` to accept supported negotiations
- `EventType.OrderPaid` to start work only after payment
- `acceptNegotiation` to create an order from a requester negotiation
- `getOrder` and `getNegotiation` to recover order context
- `deliverOrder` to submit schema deliverables back to CROO
- `payOrder` only in the requester smoke script, guarded by an explicit max-spend flag

The long-running provider never calls `payOrder` and never spends USDC. Its job is to accept relevant orders, compute the deliverable, and submit it after CROO reports the order as paid.

## Local Setup

Requirements:

- Node.js 20+
- npm

Install:

```bash
npm install
```

Copy the environment template:

```bash
cp .env.example .env.local
```

For local simulations, no CROO key is required.

Run checks:

```bash
npm run typecheck
npm test
npm run build
```

Run the local API:

```bash
npm run api
```

Run the synthetic harness simulation:

```bash
npm run demo:run
```

Run a public-market readiness audit:

```bash
npm run demo:agent-readiness-audit
```

Generate CROO service registration bundles:

```bash
npm run demo:service-registration
npm run demo:auditor-service-registration
```

## Live Provider Runtime

Set these variables as server-side secrets:

```bash
CROO_API_URL=https://api.croo.network
CROO_WS_URL=wss://api.croo.network/ws
CROO_SDK_KEY=<provider-agent-sdk-key>
CROO_TARGET_SERVICE_ID=b47a05f8-c885-4967-b2cd-71135f202e49
CROO_AUDITOR_SERVICE_ID=55cc0a2d-75de-4f85-a58e-8c16cfecf8bd
BASE_RPC_URL=https://mainnet.base.org
CAP_HARNESS_LIVE_MODE=false
CAP_HARNESS_MAX_USDC_SPEND=0
```

Start the provider locally:

```bash
npm run croo:provider
```

Start the production build:

```bash
npm run build
npm run start:provider
```

The worker logs a masked WebSocket URL, connects to CROO, and waits for order events.

## Requester Smoke Tests

Negotiation smoke, without payment:

```bash
npm run croo:negotiate-smoke
```

Live paid E2E is deliberately guarded:

```bash
npx tsx src/cli/run.ts croo-live-e2e \
  --config examples/cap-harness.config.json \
  --execute \
  --max-usdc-spend 0.05
```

The script checks the order price before calling `payOrder`. If the order price exceeds the approved max spend, it fails closed.

## Deployment

This repo includes:

- `Dockerfile` for container deployment
- `railway.json` for a Railway background worker
- `docs/PROVIDER_DEPLOYMENT.md` with server setup details

Use a long-running worker service rather than a request-only serverless function. The provider needs to keep a CROO WebSocket connection open so it can see order events as they arrive.

## Repository Hygiene

Real SDK keys and requester credentials are intentionally not committed. Use `.env.local` locally and provider secrets in your deployment platform.

The public repository contains only the runtime, examples, tests, and documentation needed to inspect and run the submitted CROO agent.

## License

MIT
