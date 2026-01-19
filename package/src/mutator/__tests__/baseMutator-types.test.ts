import { describe, expect, it, vi } from "vitest";
import { BaseMutator } from "../baseMutator";
import PocketBase from "pocketbase";

// Mock types
interface Author {
  id: string;
  name: string;
}

interface TestRecord {
  id: string;
  collectionId: string;
  collectionName: string;
  created: string;
  updated: string;
  title: string;
  expand?: {
    author?: Author;
  };
}

// Concrete implementation for testing
class TestMutator extends BaseMutator<TestRecord, { title: string }> {
  protected getCollection() {
    return this.pb.collection("tests") as any;
  }

  protected async validateInput(input: any) {
    return input;
  }
}

describe("BaseMutator Typed Expand", () => {
  it("should pass single expand string to PocketBase", async () => {
    const pb = new PocketBase("http://localhost");
    const getOneMock = vi.fn().mockResolvedValue({ id: "1", title: "test" });

    // Mock the collection method
    vi.spyOn(pb, "collection").mockReturnValue({
      getOne: getOneMock,
    } as any);

    const mutator = new TestMutator(pb);

    // Use the typed expand
    // In a real TS environment, this would strictly check "author"
    await mutator.getById("1", "author");

    expect(getOneMock).toHaveBeenCalledWith("1", { expand: "author" });
  });

  it("should pass array of expand strings to PocketBase", async () => {
    const pb = new PocketBase("http://localhost");
    const getOneMock = vi.fn().mockResolvedValue({ id: "1", title: "test" });

    vi.spyOn(pb, "collection").mockReturnValue({
      getOne: getOneMock,
    } as any);

    const mutator = new TestMutator(pb);

    await mutator.getById("1", ["author"]);

    expect(getOneMock).toHaveBeenCalledWith("1", { expand: "author" });
  });

  it("should handle mixed Default and Request expands", async () => {
    const pb = new PocketBase("http://localhost");
    const getOneMock = vi.fn().mockResolvedValue({ id: "1", title: "test" });

    vi.spyOn(pb, "collection").mockReturnValue({
      getOne: getOneMock,
    } as any);

    const mutator = new TestMutator(pb, { expand: ["default_expand"] });

    await mutator.getById("1", "author");

    expect(getOneMock).toHaveBeenCalledWith("1", { expand: "default_expand,author" });
  });

  it("should pass expand options to create", async () => {
    const pb = new PocketBase("http://localhost");
    const createMock = vi.fn().mockResolvedValue({ id: "1", title: "test" });

    vi.spyOn(pb, "collection").mockReturnValue({
      create: createMock,
    } as any);

    const mutator = new TestMutator(pb);

    await mutator.create({ title: "new" }, "author");

    expect(createMock).toHaveBeenCalledWith({ title: "new" }, { expand: "author" });
  });

  it("should pass expand options to update", async () => {
    const pb = new PocketBase("http://localhost");
    const updateMock = vi.fn().mockResolvedValue({ id: "1", title: "updated" });

    vi.spyOn(pb, "collection").mockReturnValue({
      update: updateMock,
    } as any);

    const mutator = new TestMutator(pb);

    await mutator.update("1", { title: "updated" }, "author");

    expect(updateMock).toHaveBeenCalledWith("1", { title: "updated" }, { expand: "author" });
  });
});
