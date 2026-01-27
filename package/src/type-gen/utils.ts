import { z, ZodIntersection, ZodTuple, ZodNativeEnum, ZodMap, ZodSet, ZodTypeAny } from "zod";

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
    const elemType = zodToTs(schema.element as z.ZodTypeAny);
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
    const inner = zodToTs(schema.unwrap() as z.ZodTypeAny);
    if (inner.includes('| undefined')) return inner;
    return `${inner} | undefined`;
  }
  if (schema instanceof z.ZodNullable) {
    const inner = zodToTs(schema.unwrap() as z.ZodTypeAny);
    return `${inner} | null`;
  }
  if (schema instanceof z.ZodUnion) {
    const options = schema.options as z.ZodTypeAny[];
    return options.map((opt) => zodToTs(opt)).join(" | ");
  }

  const isInstance = (target: any, typeName: string, fallbackClass?: any) => {
    if (fallbackClass && target instanceof fallbackClass) return true;
    if ((z as any)[typeName] && target instanceof (z as any)[typeName]) return true;
    return false;
  };

  if (isInstance(schema, 'ZodIntersection', ZodIntersection)) {
    const left = zodToTs(schema._def.left);
    const right = zodToTs(schema._def.right);
    return `(${left} & ${right})`;
  }

  if (isInstance(schema, 'ZodTuple', ZodTuple)) {
    const items = (schema as any).items || (schema._def as any).items;
    if (Array.isArray(items)) {
        const itemTypes = items.map((item: ZodTypeAny) => zodToTs(item));
        return `[${itemTypes.join(", ")}]`;
    }
    return "any[]";
  }

  if (schema instanceof z.ZodEnum) {
    const values = schema.options as string[];
    return values.map((v) => `"${v}"`).join(" | ");
  }

  if (isInstance(schema, 'ZodNativeEnum', ZodNativeEnum)) {
    const enumObj = (schema as any).enum || (schema._def as any).values;
    if (enumObj) {
        // Filter out numeric keys (reverse mapping in TS enums) to get the "real" keys
        const keys = Object.keys(enumObj).filter(k => isNaN(Number(k)));
        const values = keys.map(k => enumObj[k]);

        const uniqueValues = Array.from(new Set(values));
        return uniqueValues.map(v => typeof v === 'string' ? `"${v}"` : v).join(" | ");
    }
    return "any";
  }

  if (isInstance(schema, 'ZodMap', ZodMap)) {
      const keyType = zodToTs(schema._def.keyType);
      const valueType = zodToTs(schema._def.valueType);
      return `Record<${keyType}, ${valueType}>`;
  }

  if (isInstance(schema, 'ZodSet', ZodSet)) {
      const valueType = zodToTs(schema._def.valueType);
      return `${valueType}[]`;
  }

  if (schema instanceof z.ZodRecord) {
    const valueType = zodToTs(schema.valueType as z.ZodTypeAny);
    return `Record<string, ${valueType}>`;
  }
  if (schema instanceof z.ZodLiteral) {
    const val = schema.value;
    if (typeof val === "string") return `"${val}"`;
    return String(val);
  }

  if (schema instanceof z.ZodPipe) {
      return zodToTs(schema._def.in as z.ZodTypeAny);
  }
  if (schema instanceof z.ZodDefault) {
      return zodToTs(schema._def.innerType as z.ZodTypeAny);
  }
  if (schema instanceof z.ZodLazy) {
      return "any /* z.lazy() */";
  }

  return "any";
}
