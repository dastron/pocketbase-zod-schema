export default {
  schema: {
    directory: "./package/src/schema",
    // base.ts / fields.ts / view.ts hold helpers, not collection definitions
    exclude: ["*.test.ts", "*.spec.ts", "base.ts", "fields.ts", "index.ts", "view.ts"],
  },
  migrations: {
    directory: "../pocketbase/pb_migrations",
    format: "js",
  },
  diff: {
    warnOnDelete: true,
    requireForceForDestructive: true,
  },
};

