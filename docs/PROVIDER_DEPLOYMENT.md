# Provider Worker Deployment

This worker keeps the CROO provider online so incoming CAP orders can be accepted and delivered without relying on a local terminal.

## Required Environment Variables

Set these as server-side secrets. Do not commit real values.

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

The provider worker never calls `payOrder` and does not spend USDC.

## Docker

Build locally:

```bash
docker build -t croo-agent-provider .
```

Run locally with your uncommitted `.env.local`:

```bash
docker run --rm --env-file .env.local croo-agent-provider
```

Expected log lines:

```text
[croo-provider] starting provider worker
[croo-provider] target service=b47a05f8-c885-4967-b2cd-71135f202e49
[croo-provider] auditor service=55cc0a2d-75de-4f85-a58e-8c16cfecf8bd
websocket connected
[croo-provider] connected; waiting for CROO events
```

## Server Platform Shape

Use a background worker service, not a request/response serverless function.

- Build command: `npm ci && npm run build`
- Start command: `npm run start:provider`
- Runtime: Node.js 20+
- Service type: background worker / long-running process

If the platform supports Docker, use the included `Dockerfile`.
