import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { runAgentReadinessAudit } from "../services/agent-readiness-audit.js";
import { runHarness } from "../services/harness-service.js";

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async () => ({
    ok: true,
    services: ["agent-readiness-auditor", "cap-synthetic-order-harness"]
  }));

  app.post("/services/cap-harness/run", async (request, reply) => {
    try {
      return await runHarness(request.body);
    } catch (error) {
      const statusCode = error instanceof ZodError ? 400 : 500;
      return reply.status(statusCode).send({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.post("/services/agent-readiness-audit", async (request, reply) => {
    try {
      return await runAgentReadinessAudit(request.body);
    } catch (error) {
      const statusCode = error instanceof ZodError ? 400 : 500;
      return reply.status(statusCode).send({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
}
