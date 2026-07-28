/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection_Projects_add_metadata_0 = app.findCollectionByNameOrId("pb_nvqqpsg91hw82dj") // Projects;

  collection_Projects_add_metadata_0.fields.add(new JSONField({
    "name": "metadata",
    "id": "json76po97n652",
    "required": true
  }));

  return app.save(collection_Projects_add_metadata_0);
}, (app) => {
  const collection_Projects_revert_add_metadata = app.findCollectionByNameOrId("pb_nvqqpsg91hw82dj") // Projects;

  collection_Projects_revert_add_metadata.fields.removeByName("metadata");

  return app.save(collection_Projects_revert_add_metadata);
});
