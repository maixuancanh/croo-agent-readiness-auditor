import type { HarnessConfig, ProviderResponse, ScenarioName } from "../models/harness.js";
import { providerResponseSchema } from "../models/harness.js";
import { sha256Hex } from "./hash.js";

export class ProviderCallError extends Error {
  constructor(
    message: string,
    public readonly code: "timeout" | "http" | "invalid_response"
  ) {
    super(message);
  }
}

export async function callProvider(
  config: HarnessConfig,
  scenario: ScenarioName,
  timeoutMs = config.timeoutMs
): Promise<ProviderResponse> {
  if (config.providerUrl.startsWith("demo://")) {
    return callDemoProvider(config, scenario, timeoutMs);
  }

  let attempt = 0;
  let lastError: Error | undefined;

  while (attempt <= config.retryCount) {
    attempt += 1;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(config.providerUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-cap-harness-scenario": scenario,
          ...config.providerHeaders
        },
        body: JSON.stringify({
          serviceName: config.serviceName,
          scenario,
          payload: config.requestPayload
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new ProviderCallError(`provider returned HTTP ${response.status}`, "http");
      }

      const parsed = providerResponseSchema.safeParse(await response.json());
      if (!parsed.success) {
        throw new ProviderCallError(parsed.error.message, "invalid_response");
      }

      return parsed.data;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (lastError.name === "AbortError") {
        throw new ProviderCallError(`provider timed out after ${timeoutMs}ms`, "timeout");
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError ?? new ProviderCallError("provider call failed", "http");
}

async function callDemoProvider(
  config: HarnessConfig,
  scenario: ScenarioName,
  timeoutMs: number
): Promise<ProviderResponse> {
  if (scenario === "timeout") {
    await new Promise((resolve) => setTimeout(resolve, timeoutMs + 50));
    throw new ProviderCallError(`provider timed out after ${timeoutMs}ms`, "timeout");
  }

  if (scenario === "schema_mismatch") {
    return {
      ok: true,
      result: { status: "READY" },
      proof: validProof(config, scenario)
    };
  }

  if (scenario === "invalid_proof") {
    return {
      ok: true,
      result: validResult(config),
      proof: { type: "local-receipt", hash: "not-a-sha256-receipt" }
    };
  }

  return {
    ok: true,
    result: validResult(config),
    proof: validProof(config, scenario)
  };
}

function validResult(config: HarnessConfig): Record<string, unknown> {
  return {
    status: "PASS",
    serviceName: config.serviceName,
    checkedAt: "2026-07-04T00:00:00.000Z",
    findings: []
  };
}

function validProof(config: HarnessConfig, scenario: ScenarioName): ProviderResponse["proof"] {
  return {
    type: "local-receipt",
    hash: sha256Hex({ scenario, payload: config.requestPayload, serviceName: config.serviceName })
  };
}
