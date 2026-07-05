import Fastify from "fastify";
import { sha256Hex } from "../services/hash.js";

const app = Fastify({ logger: true });

app.post("/service", async (request) => {
  const scenario = request.headers["x-cap-harness-scenario"];

  if (scenario === "timeout") {
    await new Promise((resolve) => setTimeout(resolve, 750));
  }

  if (scenario === "schema_mismatch") {
    return {
      ok: true,
      result: { status: "READY" },
      proof: { type: "local-receipt", hash: sha256Hex(request.body) }
    };
  }

  if (scenario === "invalid_proof") {
    return {
      ok: true,
      result: { status: "PASS", serviceName: "demo", checkedAt: new Date().toISOString(), findings: [] },
      proof: { type: "local-receipt", hash: "invalid" }
    };
  }

  return {
    ok: true,
    result: { status: "PASS", serviceName: "demo", checkedAt: new Date().toISOString(), findings: [] },
    proof: { type: "local-receipt", hash: sha256Hex(request.body) }
  };
});

const port = Number(process.env.DEMO_PROVIDER_PORT ?? 8788);
await app.listen({ port, host: "127.0.0.1" });
