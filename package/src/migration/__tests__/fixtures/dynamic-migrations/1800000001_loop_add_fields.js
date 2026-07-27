/// <reference path="../pb_data/types.d.ts" />
// A for-loop building fields with computed names and options — invisible to
// static analysis, handled by execution.
migrate((app) => {
  const collection = new Collection({
    id: "pbc_dynamic_loop",
    name: "dynamic_loop",
    type: "base",
    fields: [
      {
        autogeneratePattern: "[a-z0-9]{15}",
        hidden: false,
        id: "text3208210256",
        max: 15,
        min: 15,
        name: "id",
        pattern: "^[a-z0-9]+$",
        presentable: false,
        primaryKey: true,
        required: true,
        system: true,
        type: "text",
      },
    ],
  });

  for (let i = 1; i <= 5; i++) {
    collection.fields.add(
      new TextField({
        id: "text_step_" + i,
        name: "step_" + i,
        max: i * 10,
        required: i % 2 === 1,
      })
    );
  }

  return app.save(collection);
}, (app) => {
  return app.delete(app.findCollectionByNameOrId("pbc_dynamic_loop"));
});
