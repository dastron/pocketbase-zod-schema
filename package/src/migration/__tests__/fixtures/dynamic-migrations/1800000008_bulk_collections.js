/// <reference path="../pb_data/types.d.ts" />
// One migration creating several collections from data — a common
// hand-written pattern the static parser sees as a single opaque blob.
migrate((app) => {
  const names = ["bulk_alpha", "bulk_beta", "bulk_gamma"];

  names.forEach(function (name) {
    const collection = new Collection({
      id: "pbc_" + name,
      name: name,
      type: "base",
      listRule: "",
      viewRule: "",
    });
    collection.fields.add(new TextField({ id: "text_label_" + name, name: "label", max: 64 }));
    app.save(collection);
  });

  return null;
}, (app) => {
  ["bulk_alpha", "bulk_beta", "bulk_gamma"].forEach(function (name) {
    app.delete(app.findCollectionByNameOrId(name));
  });
  return null;
});
