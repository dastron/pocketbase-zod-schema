/// <reference path="../pb_data/types.d.ts" />
// Conditional logic deciding which fields exist.
migrate((app) => {
  const includeAudit = true;
  const includeLegacy = false;

  const collection = new Collection({
    id: "pbc_dynamic_cond",
    name: "dynamic_conditional",
    type: "base",
  });

  if (includeAudit) {
    collection.fields.add(new TextField({ id: "text_audit", name: "audit_note", max: 500 }));
  }
  if (includeLegacy) {
    collection.fields.add(new TextField({ id: "text_legacy", name: "legacy_field" }));
  }

  return app.save(collection);
}, (app) => {
  return app.delete(app.findCollectionByNameOrId("pbc_dynamic_cond"));
});
