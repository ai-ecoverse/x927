# x927

> *"Situation: there are 14 competing standards."*
> *"14?! Ridiculous! We need to develop one universal standard that covers everyone's use cases."*
> *"Soon: Situation: there are 15 competing standards."*
> — [XKCD 927](https://xkcd.com/927/)

`x927` compiles an [Agent Plugins](https://agent-plugins.org) `plugin.json` into the plugin manifests of the clients that don't read it: **Claude Code** and **Tessl**, and the compatibility manifests of **Cursor** and **OpenAI Codex**. You edit one file, and `x927 diff` fails CI when a generated manifest or a marketplace catalog is behind it.

x927 1.x had its own source format, `PLUGIN.md`. Since Agent Plugins 1.0.0 there is a standard for that file, so x927 2 reads the standard and no longer adds a format of its own. See [Migrating from 1.x](#migrating-from-1x).

## Usage

```bash
# Compile the plugin in the current directory
npx x927 build

# Compile every plugin in a repository, and bring its marketplace catalogs in line
npx x927 build --all

# CI guard: exits 1 if a generated file is out of sync with plugin.json
npx x927 diff --all

# Start from the vendor manifests a plugin already has
npx x927 init

# Pick targets, or look at the output without writing it
npx x927 build --target claude --target tessl --dry-run
```

## The source

The source is the plugin's root `plugin.json`, as [the Agent Plugins specification](https://agent-plugins.org/specification) defines it (1.0.0, or the 1.1.0 draft). The [compatible clients](https://agent-plugins.org/compatible-clients), among them Codex, Cursor and GitHub Copilot, load that file as it is. x927 validates it against the specification's schema and refuses a file that breaks it.

The portable fields are `name`, `version`, `description`, `author`, `homepage`, `repository`, `license` and `keywords`. What x927 should write is in the manifest's `extensions`, under x927's own namespace `io.github.ai-ecoverse.x927`:

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "app-builder",
  "version": "1.0.0",
  "description": "Development, customization, testing, and deployment skills for Adobe App Builder projects.",
  "author": { "name": "Adobe" },
  "repository": "https://github.com/adobe/skills",
  "license": "Apache-2.0",
  "keywords": ["app-builder", "adobe", "development"],
  "extensions": {
    "io.github.ai-ecoverse.x927": {
      "targets": {
        "claude": { "privacyPolicyUrl": "https://www.adobe.com/privacy.html" },
        "tessl": { "name": "adobe/app-builder" },
        "cursor": { "displayName": "Adobe App Builder" }
      }
    }
  }
}
```

- **`targets`** names the manifests to write. Each key is a target, and its object holds that target's overrides: fields the portable manifest has no place for (Claude Code's `dependencies`, `userConfig` or extra `skills` paths, Cursor's `logo`), or another value for a portable field. `null` removes a field. Without `targets`, x927 writes the Claude Code manifest only.
- **`marketplace`** holds overrides for the plugin's entry in marketplace catalogs, or `false` to leave its entries alone.

Clients ignore extension namespaces they don't implement, so the file stays a valid Agent Plugin.

## Targets

| Target | Writes | From | Notes |
|---|---|---|---|
| `claude` | `.claude-plugin/plugin.json` | portable fields, overrides | Claude Code does not read a root `plugin.json`. [Reference](https://code.claude.com/docs/en/plugins/manifest-reference) |
| `tessl` | `.tessl-plugin/plugin.json` | portable fields except `keywords`, overrides | `targets.tessl.name` is required, as `<workspace>/<plugin>`. [Reference](https://docs.tessl.io/reference/configuration) |
| `cursor` | `.cursor-plugin/plugin.json` | portable fields, overrides | Only for Cursor components and listing fields; Cursor loads skills and MCP servers from the root manifest. [Reference](https://cursor.com/docs/reference/plugins) |
| `codex` | `.codex-plugin/plugin.json` | portable fields, `extensions["com.openai"]`, overrides | Compatibility manifest for clients that predate the root manifest. [Reference](https://developers.openai.com/codex/plugins/build) |

x927 checks what it can tell without the client: a Tessl name without a workspace, a Codex manifest without `version` or `description`, a Claude Code `author` without `name`. The clients' own validators are the authority on the rest; run `claude plugin validate --strict` and `tessl plugin lint` in CI next to `x927 diff`.

### MCP servers

A root `mcp.json` is the portable MCP configuration. When a plugin has one and builds `claude` or `tessl`, x927 also writes `.mcp.json`, which both read: `streamable-http` becomes `http`, and `${PLUGIN_ROOT}` and `${PLUGIN_DATA}` become `${CLAUDE_PLUGIN_ROOT}` and `${CLAUDE_PLUGIN_DATA}`.

### Marketplace catalogs

Agent Plugins defines no marketplace format, so the catalogs stay hand-written files. `build --all` and `diff --all` keep the entries of the plugins they compile in line with each `plugin.json`, in every catalog that exists:

- `.claude-plugin/marketplace.json`
- `.cursor-plugin/marketplace.json`
- `.github/plugin/marketplace.json`
- `.grok-plugin/marketplace.json`

An entry is matched by its `source` path. Its `description` and `version` are set from the plugin; `author`, `homepage`, `repository`, `license` and `keywords` are updated where the entry already has them; then the plugin's `marketplace` overrides apply. The catalog's own fields, entry fields such as `category`, and entries for plugins without a root `plugin.json` stay as they are. An entry listed under another name than its plugin is an error. A plugin that builds `claude` and is in no Claude catalog is reported, not added.

Codex's `.agents/plugins/marketplace.json` holds no plugin metadata, so there is nothing to keep in line.

## Starting from existing manifests

`x927 init` writes `plugin.json` for a plugin that has only vendor manifests, and `x927 init --all` does it for every such plugin in a repository. The portable fields come from the Claude Code manifest (or the first of Cursor, Codex and Tessl). Whatever a vendor manifest has beyond them becomes that target's overrides, so the next `build` writes the same manifests back; `init` lists the fields a build would add. A `.mcp.json` becomes the portable `mcp.json` when every server in it can be expressed there.

## Migrating from 1.x

- Move the fields of `PLUGIN.md` into a root `plugin.json`: the heading is `name`, the paragraph `description`, the base bullets the portable fields. `author` is an object (`{ "name": "Adobe" }`).
- Move each `## <target>` section into `extensions["io.github.ai-ecoverse.x927"].targets.<target>`. Fields outside the portable set (`skills`, `mcpServers`, `dependencies`) go there too, because the portable manifest is closed.
- Or run `x927 init` on the manifests 1.x generated, and delete `PLUGIN.md`.
- The Tessl target writes `.tessl-plugin/plugin.json`. `tile.json` is Tessl's legacy format and is no longer written; delete it.
- In the GitHub Action, `input` is now `path` (a directory).

## GitHub Actions

```yaml
- uses: ai-ecoverse/x927@v2
  with:
    command: diff   # or "build"
    path: .         # a plugin, or with all: true a repository
    all: true
```

## Releasing

Releases are automated by [semantic-release](https://semantic-release.gitbook.io/) on every push to `main`. The next version is computed from conventional-commit messages (`feat:` → minor, `fix:` → patch, `feat!:` / `BREAKING CHANGE:` → major). The workflow tags the release, updates `CHANGELOG.md` + `package.json`, publishes to npm with provenance via [OIDC trusted publishing](https://docs.npmjs.com/trusted-publishers), and creates the GitHub release.

The package's trusted-publisher config on npm must reference this repo (`ai-ecoverse/x927`) and the `release.yml` workflow. No `NPM_TOKEN` is stored.

## License

Apache-2.0. See [LICENSE](LICENSE). The schemas in `src/schemas/` are from [agentplugins/agent-plugins-spec](https://github.com/agentplugins/agent-plugins-spec), also Apache-2.0.
