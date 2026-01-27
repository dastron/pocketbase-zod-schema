import { describe, expect, it } from "vitest";
import { BaseMutator, Expanded } from "../baseMutator";
import { RecordModel } from "pocketbase";

// Mock implementation of BaseMutator
class MockMutator<T extends RecordModel> extends BaseMutator<T, any> {
  protected getCollection(): any {
    return {
      create: async (data: any, options: any) => ({ ...data, id: "1", ...options }),
      update: async (id: string, data: any, options: any) => ({ ...data, id, ...options }),
      getOne: async (id: string, options: any) => ({ id, ...options }),
    };
  }
  protected async validateInput(input: any) {
    return input;
  }
}

// Strict Record
interface StrictRecord extends RecordModel {
    name: string;
    expand?: {
        relA?: { name: string };
    };
}

describe("BaseMutator Strict Typing", () => {
    it("should allow valid expand keys for strict types", async () => {
        const mutator = new MockMutator<StrictRecord>({} as any);

        // This should compile and run
        const res = await mutator.create({}, "relA");

        // Check runtime behavior (mock returns options in result)
        // options: { expand: "relA" }
        expect((res as any).expand).toBe("relA");
    });

    it("should allow string expand if RecordModel is used (loose mode)", async () => {
        // RecordModel has generic expand
        const mutator = new MockMutator<RecordModel>({} as any);

        // This should also compile because RecordModel["expand"] allows string keys
        const res = await mutator.create({}, "any_string");

        expect((res as any).expand).toBe("any_string");
    });
});
