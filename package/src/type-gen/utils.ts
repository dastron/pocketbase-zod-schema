import { z, ZodIntersection, ZodTuple, ZodMap, ZodSet } from "zod";
import type { ZodTypeAny } from "zod";

export function zodToTs(schema: ZodTypeAny): string {
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
    const elemType = zodToTs(schema.element as ZodTypeAny);
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
      const typeStr = zodToTs(value as ZodTypeAny);
      lines.push(`  ${key}${isOptional ? "?" : ""}: ${typeStr};`);
    }
    lines.push("}");
    return lines.join("\n");
  }
  if (schema instanceof z.ZodOptional) {
    const inner = zodToTs(schema.unwrap() as ZodTypeAny);
    if (inner.includes('| undefined')) return inner;
    return `${inner} | undefined`;
  }
  if (schema instanceof z.ZodNullable) {
    const inner = zodToTs(schema.unwrap() as ZodTypeAny);
    return `${inner} | null`;
  }
  if (schema instanceof z.ZodUnion) {
    const options = schema.options as ZodTypeAny[];
    return options.map((opt) => zodToTs(opt)).join(" | ");
  }

  const isInstance = (target: any, typeName: string, fallbackClass?: any) => {
    if (fallbackClass && target instanceof fallbackClass) return true;
    if ((z as any)[typeName] && target instanceof (z as any)[typeName]) return true;
    return false;
  };

  if (isInstance(schema, "ZodIntersection", ZodIntersection)) {
    const def = schema._def as unknown as { left: ZodTypeAny; right: ZodTypeAny };
    const left = zodToTs(def.left);
    const right = zodToTs(def.right);
    return `(${left} & ${right})`;
  }

  if (isInstance(schema, "ZodTuple", ZodTuple)) {
    const items = (schema as { items?: ZodTypeAny[] }).items ?? (schema._def as { items?: ZodTypeAny[] }).items;
    if (Array.isArray(items)) {
      const itemTypes = items.map((item: ZodTypeAny) => zodToTs(item));
      return `[${itemTypes.join(", ")}]`;
    }
    return "any[]";
  }

  if (schema instanceof z.ZodEnum) {
    const options = schema.options as unknown[];
    return options.map((v) => (typeof v === "string" ? `"${v}"` : String(v))).join(" | ");
  }

  if (isInstance(schema, "ZodMap", ZodMap)) {
    const def = schema._def as unknown as { keyType: ZodTypeAny; valueType: ZodTypeAny };
    const keyType = zodToTs(def.keyType);
    const valueType = zodToTs(def.valueType);
    return `Record<${keyType}, ${valueType}>`;
  }

  if (isInstance(schema, "ZodSet", ZodSet)) {
    const def = schema._def as unknown as { valueType: ZodTypeAny };
    const valueType = zodToTs(def.valueType);
    return `${valueType}[]`;
  }

  if (schema instanceof z.ZodRecord) {
    const valueType = zodToTs(schema.valueType as ZodTypeAny);
    return `Record<string, ${valueType}>`;
  }
  if (schema instanceof z.ZodLiteral) {
    const val = schema.value;
    if (typeof val === "string") return `"${val}"`;
    return String(val);
  }

  if (schema instanceof z.ZodPipe) {
    return zodToTs((schema._def as unknown as { in: ZodTypeAny }).in);
  }
  if (schema instanceof z.ZodDefault) {
    return zodToTs((schema._def as unknown as { innerType: ZodTypeAny }).innerType);
  }
  if (schema instanceof z.ZodLazy) {
      return "any /* z.lazy() */";
  }

  return "any";
}
