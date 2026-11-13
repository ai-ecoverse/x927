// https://code.claude.com/docs/en/plugins/manifest-reference
// Claude Code does not read a root plugin.json, so it always needs this manifest.
export default {
  id: "claude",
  label: "Claude Code",
  path: ".claude-plugin/plugin.json",
  portable: ["name", "displayName", "version", "description", "author", "homepage", "repository", "license", "keywords"],
  mcp: true,
  check(fields) {
    if (fields.author && !fields.author.name) return 'Claude Code requires "author.name" when "author" is set';
    return null;
  },
};
