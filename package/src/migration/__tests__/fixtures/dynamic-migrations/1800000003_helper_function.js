/// <reference path="../pb_data/types.d.ts" />
// A helper function constructs the fields — no literal new XField({...})
// call site next to fields.add to match on.
migrate((app) => {
  function makeTextField(name, max) {
    return new TextField({
      id: "text_helper_" + name,
      name: name,
      max: max,
      required: false,
    });
  }

  const collection = new Collection({
    id: "pbc_dynamic_helper",
    name: "dynamic_helper",
    type: "base",
  });

  collection.fields.add(makeTextField("summary", 280));
  collection.fields.add(makeTextField("body", 5000));

  return app.save(collection);
}, (app) => {
  return app.delete(app.findCollectionByNameOrId("pbc_dynamic_helper"));
});
