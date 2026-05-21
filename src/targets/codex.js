// Verified against openai/codex source: codex-rs/core-plugins/src/manifest.rs
// and codex-rs/utils/plugins/src/plugin_namespace.rs. Manifest path is
// `.codex-plugin/plugin.json` (with `.claude-plugin/plugin.json` as a
// fallback). Top-level fields below are the documented schema; relative
// paths inside `skills`, `mcpServers`, `apps`, and `hooks` must start with
// `./` and stay within the plugin root.
export default {
  id: "codex",
  rename: {},
  allow: [
    "name",
    "version",
    "description",
    "author",
    "homepage",
    "repository",
    "license",
    "keywords",
    "skills",
    "mcpServers",
    "apps",
    "hooks",
    "interface",
  ],
  lists: ["keywords"],
  transforms: [],
  output: {
    path: ".codex-plugin/plugin.json",
    format: "json",
    pretty: true,
  },
};
