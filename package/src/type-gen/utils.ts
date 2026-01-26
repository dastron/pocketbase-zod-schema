import { z } from "zod";

export function zodToTs(schema: z.ZodTypeAny): string {
  if (schema instanceof z.ZodString) {
    return "string";
  }
  if (schema instanceof z.ZodNumber) {
    return "number";
  }
  if (schema instanceof z.ZodBoolean) {
    return "boolean";
  }
  if (schema instanceof z.ZodDate) {
    return "string"; // PocketBase stores dates as strings
  }
  if (schema instanceof z.ZodAny || schema instanceof z.ZodUnknown) {
    return "any";
  }
  if (schema instanceof z.ZodArray) {
    const elemType = zodToTs(schema.element);
    // Wrap in parens if it looks like a union or complex type
    if (elemType.includes("|") || elemType.includes(" ") || elemType.startsWith("{")) {
      return `(${elemType})[]`;
    }
    return `${elemType}[]`;
  }
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const lines: string[] = ["{"];
    for (const [key, value] of Object.entries(shape)) {
      const isOptional = value instanceof z.ZodOptional;
      const typeStr = zodToTs(value as z.ZodTypeAny);
      lines.push(`  ${key}${isOptional ? "?" : ""}: ${typeStr};`);
    }
    lines.push("}");
    return lines.join("\n");
  }
  if (schema instanceof z.ZodOptional) {
    const inner = zodToTs(schema.unwrap());
    return `${inner} | undefined`;
  }
  if (schema instanceof z.ZodNullable) {
    const inner = zodToTs(schema.unwrap());
    return `${inner} | null`;
  }
  if (schema instanceof z.ZodUnion) {
    const options = schema.options as z.ZodTypeAny[];
    return options.map((opt) => zodToTs(opt)).join(" | ");
  }
  if (schema instanceof z.ZodEnum) {
    const values = schema.options as string[];
    return values.map((v) => `"${v}"`).join(" | ");
  }
  if (schema instanceof z.ZodRecord) {
    const valueType = zodToTs(schema.valueSchema);
    return `Record<string, ${valueType}>`;
  }
  if (schema instanceof z.ZodLiteral) {
    const val = schema.value;
    if (typeof val === "string") return `"${val}"`;
    return String(val);
  }

  // Handle Wrapped types (Effects, Default, etc.)
  if (schema instanceof z.ZodEffects) {
      return zodToTs(schema._def.schema);
  }
  if (schema instanceof z.ZodDefault) {
      return zodToTs(schema._def.innerType);
  }
  if (schema instanceof z.ZodLazy) {
      // Lazy is hard because we might recurse infinitely or need names.
      // For now, return any.
      return "any";
  }

  return "any";
}
