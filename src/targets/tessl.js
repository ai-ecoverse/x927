export default {
  id: "tessl",
  // Tessl uses `summary` where the rest use `description`.
  rename: { description: "summary" },
  allow: [
    "name",
    "summary",
    "version",
    "docs",
    "describes",
    "steering",
    "skills",
    "private",
    "entrypoint",
    "softDependencies",
  ],
  lists: ["softDependencies"],
  transforms: [],
  output: {
    path: "tile.json",
    format: "json",
    pretty: true,
  },
};
