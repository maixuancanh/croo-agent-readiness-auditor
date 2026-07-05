import { Ajv } from "ajv/dist/ajv.js";
import type { ErrorObject } from "ajv";

export interface SchemaValidationError {
  path: string;
  message: string;
}

export interface SchemaValidationResult {
  valid: boolean;
  errors: SchemaValidationError[];
}

const ajv = new Ajv({
  allErrors: true,
  strict: false
});

function toExactPath(error: ErrorObject): string {
  if (error.instancePath) {
    return error.instancePath;
  }

  const missing = (error.params as { missingProperty?: string }).missingProperty;
  if (missing) {
    return `/${missing}`;
  }

  return "/";
}

export function validateJsonSchema(schema: Record<string, unknown>, data: unknown): SchemaValidationResult {
  const validate = ajv.compile(schema);
  const valid = validate(data);

  return {
    valid,
    errors: valid
      ? []
      : (validate.errors ?? []).map((error: ErrorObject) => ({
          path: toExactPath(error),
          message: error.message ?? "schema validation failed"
        }))
  };
}
