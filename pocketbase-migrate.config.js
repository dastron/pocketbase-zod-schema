export default {
  schema: {
    directory: "./package/src/schema",
    exclude: ["*.test.ts", "*.spec.ts", "base.ts", "index.ts", "project.ts"],
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

