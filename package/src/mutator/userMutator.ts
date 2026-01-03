import type { z } from "zod";
import { UserInputSchema, UserSchema } from "../schema/user";
import { BaseMutator, type MutatorOptions } from "./baseMutator";

// Internal types for this testing fixture (not exported)
type UserInputType = z.infer<typeof UserInputSchema>;
type UserType = z.infer<typeof UserSchema>;

export class UserMutator extends BaseMutator<UserType, UserInputType> {
  protected setDefaults(): MutatorOptions {
    return {
      expand: [],
      filter: [],
      sort: ["-updated"],
    };
  }

  protected getCollection() {
    return this.pb.collection("Users");
  }

  protected async validateInput(input: UserInputType) {
    return UserInputSchema.parse(input);
  }
}
