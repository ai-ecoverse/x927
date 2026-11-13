// https://developers.openai.com/codex/plugins/build
// Codex and ChatGPT load a root plugin.json and read extensions["com.openai"] from it.
// .codex-plugin/plugin.json is the compatibility manifest for clients that predate that:
// it carries the portable fields, the com.openai extension and any overrides.
export default {
  id: "codex",
  label: "OpenAI Codex (compatibility manifest)",
  path: ".codex-plugin/plugin.json",
  portable: ["name", "version", "description", "author", "homepage", "repository", "license", "keywords"],
  extension: "com.openai",
  mcp: false,
  check(fields) {
    for (const key of ["name", "version", "description"]) {
      if (!fields[key]) return `Codex requires "${key}"`;
    }
    return null;
  },
};
