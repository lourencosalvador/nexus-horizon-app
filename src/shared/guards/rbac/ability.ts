import { AbilityBuilder, createMongoAbility, type MongoAbility } from "@casl/ability";

export type AppAction = "manage" | "create" | "read" | "update" | "delete";
export type AppSubject = "all" | "User" | "Post" | "Conversation" | "Automation" | "Instance";

export type AppAbility = MongoAbility<[AppAction, AppSubject]>;

export type AbilityRule = {
  action: AppAction;
  subject: AppSubject;
};

export function buildAbility(rules: AbilityRule[]): AppAbility {
  const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility);
  for (const r of rules) can(r.action, r.subject);
  return build();
}


