import { describe, expect, it } from "vitest";
import { FieldsList } from "../fields-list";
import { Field, TextField } from "../fields";

describe("FieldsList", () => {
  it("adds fields and preserves order", () => {
    const list = new FieldsList();
    list.add(new TextField({ id: "a", name: "alpha" }));
    list.add(new TextField({ id: "b", name: "beta" }));

    expect(list.length).toBe(2);
    expect(list.map((f) => f.name)).toEqual(["alpha", "beta"]);
  });

  it("wraps plain objects into Field instances", () => {
    const list = new FieldsList([{ id: "a", name: "alpha", type: "text" }]);
    expect(list.getByName("alpha")).toBeInstanceOf(Field);
  });

  it("replaces in place when adding a field with an existing id", () => {
    const list = new FieldsList([
      { id: "a", name: "alpha", type: "text" },
      { id: "b", name: "beta", type: "text" },
      { id: "c", name: "gamma", type: "text" },
    ]);

    list.add(new TextField({ id: "b", name: "beta_renamed", max: 50 }));

    expect(list.length).toBe(3);
    expect(list.map((f) => f.name)).toEqual(["alpha", "beta_renamed", "gamma"]);
  });

  it("inserts at the requested position with addAt", () => {
    const list = new FieldsList([
      { id: "a", name: "alpha", type: "text" },
      { id: "c", name: "gamma", type: "text" },
    ]);

    list.addAt(1, new TextField({ id: "b", name: "beta" }));

    expect(list.map((f) => f.id)).toEqual(["a", "b", "c"]);
  });

  it("moves an existing field when addAt reuses its id", () => {
    const list = new FieldsList([
      { id: "a", name: "alpha", type: "text" },
      { id: "b", name: "beta", type: "text" },
      { id: "c", name: "gamma", type: "text" },
    ]);

    list.addAt(0, new TextField({ id: "c", name: "gamma_v2" }));

    expect(list.map((f) => f.id)).toEqual(["c", "a", "b"]);
    expect(list.getById("c")?.name).toBe("gamma_v2");
    expect(list.length).toBe(3);
  });

  it("clamps out-of-range addAt positions", () => {
    const list = new FieldsList([{ id: "a", name: "alpha", type: "text" }]);
    list.addAt(99, new TextField({ id: "b", name: "beta" }));
    list.addAt(-5, new TextField({ id: "c", name: "gamma" }));

    expect(list.map((f) => f.id)).toEqual(["c", "a", "b"]);
  });

  it("removes by id and by name, ignoring misses", () => {
    const list = new FieldsList([
      { id: "a", name: "alpha", type: "text" },
      { id: "b", name: "beta", type: "text" },
    ]);

    list.removeById("a");
    list.removeByName("beta");
    list.removeById("missing");
    list.removeByName("missing");

    expect(list.length).toBe(0);
  });

  it("getByName returns the live object so mutations persist", () => {
    const list = new FieldsList([{ id: "a", name: "alpha", type: "text", max: 10 }]);

    const field = list.getByName("alpha")!;
    field.max = 500;

    expect(list.serialize()[0].max).toBe(500);
  });

  it("supports iteration", () => {
    const list = new FieldsList([
      { id: "a", name: "alpha", type: "text" },
      { id: "b", name: "beta", type: "text" },
    ]);

    const names = [];
    for (const field of list) {
      names.push(field.name);
    }
    expect(names).toEqual(["alpha", "beta"]);
  });

  it("serializes to plain objects in order", () => {
    const list = new FieldsList([{ id: "a", name: "alpha", type: "text" }]);
    const serialized = list.serialize();

    expect(serialized).toEqual([{ id: "a", name: "alpha", type: "text" }]);
    expect(serialized[0]).not.toBeInstanceOf(Field);
  });

  it("replaceAll swaps the entire contents", () => {
    const list = new FieldsList([{ id: "a", name: "alpha", type: "text" }]);
    list.replaceAll([
      { id: "x", name: "ex", type: "number" },
      { id: "y", name: "why", type: "bool" },
    ]);

    expect(list.map((f) => f.id)).toEqual(["x", "y"]);
  });
});
