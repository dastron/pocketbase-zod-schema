/// <reference path="../pb_data/types.d.ts" />
// removeById in the UP body — a text scanner only ever understood
// removeByName.
migrate((app) => {
  const collection = app.findCollectionByNameOrId("dynamic_loop");

  collection.fields.removeById("text_step_2");
  collection.fields.removeById("text_step_4");

  return app.save(collection);
}, (app) => {
  return null;
});
