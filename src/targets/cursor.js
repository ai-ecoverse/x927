// https://cursor.com/docs/reference/plugins
// Cursor loads a root plugin.json (skills and MCP servers only). This manifest is for
// plugins that also ship Cursor components or listing fields such as logo.
export default {
  id: "cursor",
  label: "Cursor",
  path: ".cursor-plugin/plugin.json",
  portable: ["name", "version", "description", "author", "homepage", "repository", "license", "keywords"],
  mcp: false,
  check() {
    return null;
  },
};
