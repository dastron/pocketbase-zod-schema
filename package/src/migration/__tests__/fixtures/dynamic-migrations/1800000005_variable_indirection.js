/// <reference path="../pb_data/types.d.ts" />
// Field built through variables before being added — the "next char must
// be {" assumption of static scanning fails here.
migrate((app) => {
  const baseOptions = { required: true, max: 120 };
  const titleField = new TextField(
    Object.assign({ id: "text_indirect", name: "indirect_title" }, baseOptions)
  );

  const collection = new Collection({
    id: "pbc_dynamic_indirect",
    name: "dynamic_indirect",
    type: "base",
  });

  collection.fields.add(titleField);

  return app.save(collection);
}, (app) => {
  return app.delete(app.findCollectionByNameOrId("pbc_dynamic_indirect"));
});
