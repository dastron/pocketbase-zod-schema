/// <reference path="../pb_data/types.d.ts" />
// Field definitions declared as data and applied with forEach.
migrate((app) => {
  const defs = [
    { name: "title", type: "text", required: true },
    { name: "views", type: "number", required: false },
    { name: "published", type: "bool", required: false },
  ];

  const collection = new Collection({
    id: "pbc_dynamic_foreach",
    name: "dynamic_foreach",
    type: "base",
  });

  defs.forEach(function (def, index) {
    collection.fields.add(
      new Field({
        id: def.type + "_gen_" + index,
        name: def.name,
        type: def.type,
        required: def.required,
      })
    );
  });

  return app.save(collection);
}, (app) => {
  return app.delete(app.findCollectionByNameOrId("pbc_dynamic_foreach"));
});
