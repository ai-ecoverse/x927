// NOTE: Codex plugin format is provisional — the `.codex-plugin/plugin.json`
// path and field set come from second-hand research. Verify against the Codex
// CLI source before treating this target as authoritative.
export default {
  id: "codex",
  rename: {},
  allow: [
    "name",
    "description",
    "version",
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
