/**
 * unmarshal(data, dst) — the PocketBase JSVM helper migrations use to merge
 * a JSON-shaped object into a collection (or any Go struct).
 *
 * Semantics follow Go's json.Unmarshal into an existing struct: plain
 * objects merge key by key, while arrays and scalars replace the target
 * value wholesale. `unmarshal({indexes: []}, collection)` therefore clears
 * the indexes list, which is exactly what PocketBase's generated down
 * migrations rely on.
 */

import { Collection } from "./collection";
import { FieldsList } from "./fields-list";

function isPlainObject(value: unknown): value is Record<string, any> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  // Cross-realm safe: vm-created literals have a foreign Object prototype
  const proto = Object.getPrototypeOf(value);
  return proto === null || Object.getPrototypeOf(proto) === null;
}

export function unmarshal(data: unknown, dst: unknown): void {
  if (!isPlainObject(data) || dst === null || typeof dst !== "object") {
    return;
  }

  const target = dst as Record<string, any>;

  for (const [key, value] of Object.entries(data)) {
    if (key === "fields" && target instanceof Collection && Array.isArray(value)) {
      target.fields.replaceAll(value);
      continue;
    }
    if (key === "fields" && target.fields instanceof FieldsList && Array.isArray(value)) {
      target.fields.replaceAll(value);
      continue;
    }

    if (Array.isArray(value)) {
      target[key] = [...value];
    } else if (isPlainObject(value)) {
      if (isPlainObject(target[key])) {
        unmarshal(value, target[key]);
      } else {
        target[key] = {};
        unmarshal(value, target[key]);
      }
    } else {
      target[key] = value;
    }
  }
}
