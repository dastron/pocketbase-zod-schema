/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection_Projects = new Collection({
    id: "pb_nep8zftoc3lak0b",
    name: "Projects",
    type: "base",
    listRule: "@request.auth.id != \"\"",
    viewRule: "@request.auth.id != \"\" && (OwnerUser = @request.auth.id || SubscriberUsers ?= @request.auth.id)",
    createRule: "@request.auth.id != \"\"",
    updateRule: "@request.auth.id != \"\" && OwnerUser = @request.auth.id",
    deleteRule: "@request.auth.id != \"\" && OwnerUser = @request.auth.id",
    manageRule: null,
    fields: [
    {
      name: "id",
      type: "text",
      required: true,
      autogeneratePattern: "[a-z0-9]{15}",
      hidden: false,
      id: "text3208210256",
      max: 15,
      min: 15,
      pattern: "^[a-z0-9]+$",
      presentable: false,
      primaryKey: true,
      system: true,
    },
    {
      name: "created",
      type: "autodate",
      required: true,
      hidden: false,
      id: "autodate2990389176",
      onCreate: true,
      onUpdate: false,
      presentable: false,
      system: false,
    },
    {
      name: "updated",
      type: "autodate",
      required: true,
      hidden: false,
      id: "autodate3332085495",
      onCreate: true,
      onUpdate: true,
      presentable: false,
      system: false,
    },
    {
      name: "title",
      type: "text",
      required: true,
      min: 1,
      max: 200,
    },
    {
      name: "content",
      type: "editor",
      required: true,
    },
    {
      name: "status",
      type: "select",
      required: true,
      maxSelect: 1,
      values: ["draft", "active", "complete", "fail"],
    },
    {
      name: "summary",
      type: "text",
      required: false,
      max: 500,
    },
    {
      name: "OwnerUser",
      type: "relation",
      required: true,
      collectionId: "_pb_users_auth_",
      maxSelect: 1,
      minSelect: 0,
      cascadeDelete: false,
    },
    {
      name: "SubscriberUsers",
      type: "relation",
      required: true,
      collectionId: "_pb_users_auth_",
      maxSelect: 999,
      minSelect: 0,
      cascadeDelete: false,
    },
  ],
    indexes: [],
  });

  return app.save(collection_Projects);
}, (app) => {
  const collection_Projects = app.findCollectionByNameOrId("Projects");
  return app.delete(collection_Projects);
});
