/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = new Collection({
    "id": "pb_t3zwudf1vmyfkc8",
    "name": "ProjectStats",
    "type": "view",
    "system": false,
    "listRule": "OwnerUser = @request.auth.id",
    "viewRule": "OwnerUser = @request.auth.id",
    "createRule": null,
    "updateRule": null,
    "deleteRule": null,
    "viewQuery": `
      SELECT p.OwnerUser AS id,
             p.OwnerUser AS OwnerUser,
             COUNT(*)    AS projectCount
        FROM Projects p
       GROUP BY p.OwnerUser
    `,
  });

  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("pb_t3zwudf1vmyfkc8") // ProjectStats;
  return app.delete(collection);
});
