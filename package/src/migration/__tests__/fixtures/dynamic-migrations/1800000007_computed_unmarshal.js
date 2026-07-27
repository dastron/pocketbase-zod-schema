/// <reference path="../pb_data/types.d.ts" />
// unmarshal with a computed payload (rules and indexes built dynamically).
migrate((app) => {
  const collection = app.findCollectionByNameOrId("dynamic_foreach");

  const authRule = ["@request.auth.id", "!=", "''"].join(" ");
  const payload = {
    listRule: authRule,
    viewRule: authRule,
    indexes: [],
  };
  payload.indexes.push(
    "CREATE INDEX `idx_dynamic_foreach_title` ON `dynamic_foreach` (`title`)"
  );

  unmarshal(payload, collection);

  return app.save(collection);
}, (app) => {
  return null;
});
