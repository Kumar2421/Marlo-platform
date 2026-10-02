// Minimal JSON-Schema validator. A tool's inputSchema is both what clients see and what we enforce,
// so the published contract can never drift from the real validation.
export type Schema = {
  type?: "string" | "integer" | "number" | "boolean" | "object" | "array";
  description?: string;
  enum?: readonly (string | number)[];
  minimum?: number;
  maximum?: number;
  maxLength?: number;
  minLength?: number;
  maxItems?: number;
  minItems?: number;
  items?: Schema;
  properties?: Record<string, Schema>;
  required?: readonly string[];
  additionalProperties?: boolean;
  default?: unknown;
};

export function validate(schema: Schema, value: unknown, path = "arguments"): string[] {
  const errors: string[] = [];
  if (value === undefined || value === null) return errors;

  switch (schema.type) {
    case "string": {
      if (typeof value !== "string") return [`${path} must be a string`];
      if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${path} must be at most ${schema.maxLength} characters`);
      if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path} must be at least ${schema.minLength} characters`);
      break;
    }
    case "integer":
    case "number": {
      if (typeof value !== "number" || !Number.isFinite(value)) return [`${path} must be a number`];
      if (schema.type === "integer" && !Number.isInteger(value)) errors.push(`${path} must be an integer`);
      if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path} must be >= ${schema.minimum}`);
      if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path} must be <= ${schema.maximum}`);
      break;
    }
    case "boolean":
      if (typeof value !== "boolean") return [`${path} must be a boolean`];
      break;
    case "array": {
      if (!Array.isArray(value)) return [`${path} must be an array`];
      if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path} must have at most ${schema.maxItems} items`);
      if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path} must have at least ${schema.minItems} items`);
      if (schema.items && errors.length === 0) {
        for (let i = 0; i < value.length && errors.length < 5; i += 1) errors.push(...validate(schema.items, value[i], `${path}[${i}]`));
      }
      break;
    }
    case "object": {
      if (typeof value !== "object" || Array.isArray(value)) return [`${path} must be an object`];
      const record = value as Record<string, unknown>;
      for (const key of schema.required ?? []) {
        if (record[key] === undefined || record[key] === null || record[key] === "") errors.push(`${path}.${key} is required`);
      }
      if (schema.properties) {
        for (const [key, child] of Object.entries(schema.properties)) {
          if (record[key] !== undefined) errors.push(...validate(child, record[key], `${path}.${key}`));
        }
        if (schema.additionalProperties === false) {
          for (const key of Object.keys(record)) if (!(key in schema.properties)) errors.push(`${path}.${key} is not a known field`);
        }
      }
      break;
    }
  }
  if (schema.enum && !schema.enum.includes(value as string | number)) errors.push(`${path} must be one of: ${schema.enum.join(", ")}`);
  return errors.slice(0, 8);
}
