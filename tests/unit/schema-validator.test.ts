import { describe, expect, it } from "vitest";
import { validateJsonSchema } from "../../src/services/schema-validator.js";

describe("validateJsonSchema", () => {
  it("returns exact JSON paths for missing and invalid fields", () => {
    const result = validateJsonSchema(
      {
        type: "object",
        required: ["status", "findings"],
        properties: {
          status: { enum: ["PASS", "FAIL"] },
          findings: { type: "array" }
        }
      },
      { status: "READY" }
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "/findings" }),
        expect.objectContaining({ path: "/status" })
      ])
    );
  });
});
