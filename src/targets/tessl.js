// https://docs.tessl.io/reference/configuration (.tessl-plugin/plugin.json; tile.json is the legacy format)
// Tessl names are workspace/plugin, so targets.tessl.name is required.
export default {
  id: "tessl",
  label: "Tessl",
  path: ".tessl-plugin/plugin.json",
  portable: ["name", "version", "description", "author", "homepage", "repository", "license"],
  mcp: true,
  check(fields) {
    if (typeof fields.name !== "string" || !/^[a-z0-9-]+\/[a-z0-9._-]+$/.test(fields.name)) {
      return 'Tessl needs a workspace-qualified name: set targets.tessl.name to "<workspace>/<plugin>"';
    }
    if (typeof fields.repository === "string" && !/^https?:\/\//.test(fields.repository)) {
      return 'Tessl accepts only an http(s) "repository" URL';
    }
    return null;
  },
};
