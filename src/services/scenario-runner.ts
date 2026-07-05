import { CapSimulationAdapter } from "../adapters/cap-simulation-adapter.js";
import type { HarnessConfig, ScenarioName, ScenarioResult } from "../models/harness.js";
import { sha256Hex } from "./hash.js";
import { callProvider, ProviderCallError } from "./provider-caller.js";
import { validateJsonSchema } from "./schema-validator.js";

const proofHashPattern = /^sha256:[a-f0-9]{64}$/;

export async function runScenario(config: HarnessConfig, scenario: ScenarioName): Promise<ScenarioResult> {
  const started = Date.now();
  const adapter = new CapSimulationAdapter();
  const order = adapter.negotiate(config, scenario);
  const schemaErrors: ScenarioResult["schemaErrors"] = [];
  const remediation: string[] = [];

  try {
    const inputValidation = validateJsonSchema(config.inputSchema, config.requestPayload);
    if (!inputValidation.valid) {
      return finish("FAIL", "Input payload does not match service requirements schema", remediationFromSchema("input", inputValidation.errors));
    }

    if (scenario === "payment_failure") {
      adapter.lock(order, true);
      return finish("PASS", "Payment failure was isolated before provider execution", [
        "Keep requester funding checks before payOrder in live smoke tests."
      ]);
    }

    const lockedOrder = adapter.lock(order);

    if (scenario === "dispute_path") {
      adapter.dispute(lockedOrder);
      return finish("PASS", "Dispute path simulated and rejected without settlement claim", [
        "Document dispute evidence requirements for live CROO operations."
      ]);
    }

    const timeoutMs = scenario === "timeout" ? Math.min(config.timeoutMs, 500) : config.timeoutMs;
    const providerResponse = await callProvider(config, scenario, timeoutMs);
    const outputValidation = validateJsonSchema(config.outputSchema, providerResponse.result);

    if (!outputValidation.valid) {
      schemaErrors.push(...outputValidation.errors);
    }

    const proofErrors = validateProof(config, providerResponse.proof);
    schemaErrors.push(...proofErrors);

    if (scenario === "schema_mismatch") {
      if (outputValidation.valid) {
        return finish("FAIL", "Expected schema mismatch was not observed", [
          "Add a negative fixture or scenario header support so schema failures can be tested."
        ]);
      }

      adapter.dispute(lockedOrder);
      return finish("PASS", "Schema mismatch detected with exact JSON path", remediationFromSchema("output", outputValidation.errors));
    }

    if (scenario === "invalid_proof") {
      if (proofErrors.length === 0) {
        return finish("FAIL", "Expected invalid proof was not observed", [
          "Require local receipt proof hashes in provider deliverables."
        ]);
      }

      adapter.dispute(lockedOrder);
      return finish("PASS", "Invalid proof detected before synthetic clear", [
        "Return proof.hash as sha256:<64 lowercase hex characters>."
      ]);
    }

    if (!outputValidation.valid || proofErrors.length > 0) {
      adapter.dispute(lockedOrder);
      return finish("FAIL", "Provider delivery failed output or proof validation", [
        ...remediationFromSchema("output", outputValidation.errors),
        ...proofErrors.map((error) => `Fix proof at ${error.path}: ${error.message}`)
      ]);
    }

    const proofHash = providerResponse.proof?.hash ?? sha256Hex(providerResponse);
    adapter.deliver(lockedOrder, proofHash);
    adapter.clear(lockedOrder);
    return finish("PASS", "Synthetic CAP success path completed", []);
  } catch (error) {
    if (error instanceof ProviderCallError && scenario === "timeout" && error.code === "timeout") {
      adapter.expire(order);
      return finish("PASS", "SLA timeout was detected and mapped to synthetic expiration", [
        "Tune provider SLA, timeout budgets, or async delivery path before live listing."
      ]);
    }

    const message = error instanceof Error ? error.message : String(error);
    remediation.push("Check provider availability, JSON response shape, auth headers, and retry settings.");
    return finish("ERROR", message, remediation);
  }

  function finish(status: ScenarioResult["status"], summary: string, fixes: string[]): ScenarioResult {
    return {
      scenario,
      status,
      simulated: true,
      durationMs: Date.now() - started,
      lifecycleEvents: adapter.getEvents(),
      schemaErrors,
      proofHash: sha256Hex({ scenario, events: adapter.getEvents(), schemaErrors }),
      remediation: fixes,
      summary
    };
  }
}

export async function runScenarios(config: HarnessConfig): Promise<ScenarioResult[]> {
  const results: ScenarioResult[] = [];
  for (const scenario of config.scenarios) {
    results.push(await runScenario(config, scenario));
  }
  return results;
}

function validateProof(config: HarnessConfig, proof: { type: string; hash: string } | undefined): ScenarioResult["schemaErrors"] {
  if (!config.proofRequired) {
    return [];
  }

  if (!proof) {
    return [{ path: "/proof", message: "proof is required" }];
  }

  if (!proofHashPattern.test(proof.hash)) {
    return [{ path: "/proof/hash", message: "must be sha256:<64 lowercase hex characters>" }];
  }

  return [];
}

function remediationFromSchema(kind: "input" | "output", errors: ScenarioResult["schemaErrors"]): string[] {
  return errors.map((error) => `Fix ${kind} schema mismatch at ${error.path}: ${error.message}`);
}
