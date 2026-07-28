/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const snapshot = [
    {
      "createRule": "@request.auth.id != ''",
      "deleteRule": null,
      "fields": [
        {
          "autogeneratePattern": "[a-z0-9]{15}",
          "hidden": false,
          "id": "text3208210256",
          "max": 15,
          "min": 15,
          "name": "id",
          "pattern": "^[a-z0-9]+$",
          "presentable": false,
          "primaryKey": true,
          "required": true,
          "system": true,
          "type": "text"
        },
        {
          "autogeneratePattern": "",
          "hidden": false,
          "id": "text724990059",
          "max": 200,
          "min": 0,
          "name": "title",
          "pattern": "",
          "presentable": false,
          "primaryKey": false,
          "required": true,
          "system": false,
          "type": "text"
        },
        {
          "hidden": false,
          "id": "number2392944706",
          "max": null,
          "min": 0,
          "name": "score",
          "onlyInt": true,
          "presentable": false,
          "required": false,
          "system": false,
          "type": "number"
        },
        {
          "cascadeDelete": true,
          "collectionId": "_pb_users_auth_",
          "hidden": false,
          "id": "relation3182418120",
          "maxSelect": 1,
          "minSelect": 0,
          "name": "owner",
          "presentable": false,
          "required": true,
          "system": false,
          "type": "relation"
        }
      ],
      "id": "pbc_articles001",
      "indexes": [
        "CREATE UNIQUE INDEX `idx_articles_title` ON `articles` (`title`)"
      ],
      "listRule": "",
      "name": "articles",
      "system": false,
      "type": "base",
      "updateRule": "owner = @request.auth.id",
      "viewRule": ""
    },
    {
      "authAlert": {
        "emailTemplate": {
          "body": "<p>Login from a new location.</p>",
          "subject": "Login from a new location"
        },
        "enabled": true
      },
      "createRule": null,
      "deleteRule": "id = @request.auth.id",
      "fields": [
        {
          "autogeneratePattern": "[a-z0-9]{15}",
          "hidden": false,
          "id": "text3208210256",
          "max": 15,
          "min": 15,
          "name": "id",
          "pattern": "^[a-z0-9]+$",
          "presentable": false,
          "primaryKey": true,
          "required": true,
          "system": true,
          "type": "text"
        },
        {
          "autogeneratePattern": "",
          "hidden": true,
          "id": "password901924565",
          "max": 0,
          "min": 8,
          "name": "password",
          "pattern": "",
          "presentable": false,
          "required": true,
          "system": true,
          "type": "password"
        },
        {
          "autogeneratePattern": "[a-zA-Z0-9]{50}",
          "hidden": true,
          "id": "text2504183744",
          "max": 60,
          "min": 30,
          "name": "tokenKey",
          "pattern": "",
          "presentable": false,
          "primaryKey": false,
          "required": true,
          "system": true,
          "type": "text"
        },
        {
          "exceptDomains": null,
          "hidden": false,
          "id": "email3885137012",
          "name": "email",
          "onlyDomains": null,
          "presentable": false,
          "required": true,
          "system": true,
          "type": "email"
        },
        {
          "hidden": false,
          "id": "bool1547992806",
          "name": "emailVisibility",
          "presentable": false,
          "required": false,
          "system": true,
          "type": "bool"
        },
        {
          "hidden": false,
          "id": "bool256245529",
          "name": "verified",
          "presentable": false,
          "required": false,
          "system": true,
          "type": "bool"
        }
      ],
      "id": "_pb_users_auth_",
      "indexes": [
        "CREATE UNIQUE INDEX `idx_tokenKey__pb_users_auth_` ON `users` (`tokenKey`)",
        "CREATE UNIQUE INDEX `idx_email__pb_users_auth_` ON `users` (`email`) WHERE `email` != ''"
      ],
      "listRule": "id = @request.auth.id",
      "name": "users",
      "system": false,
      "type": "auth",
      "updateRule": "id = @request.auth.id",
      "viewRule": "id = @request.auth.id"
    },
    {
      "createRule": null,
      "deleteRule": null,
      "fields": [],
      "id": "pbc_stats0000001",
      "indexes": [],
      "listRule": "",
      "name": "article_stats",
      "system": false,
      "type": "view",
      "updateRule": null,
      "viewQuery": "SELECT articles.id AS id, COUNT(*) AS total\nFROM articles\nGROUP BY articles.owner",
      "viewRule": ""
    }
  ];

  return app.importCollections(snapshot, false);
}, (app) => {
  return null;
})
