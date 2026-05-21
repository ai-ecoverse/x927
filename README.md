# x927

> *"Situation: there are 4 competing plugin standards."*
> *"Ridiculous! We need one universal format that covers everyone."*
> *"Soon: Situation: there are 5 competing plugin standards."*
> — [XKCD 927](https://xkcd.com/927/)

`x927` compiles one `PLUGIN.md` source file into plugin manifests for **Claude Code**, **Cursor**, **OpenAI Codex**, and **Tessl**. A plugin author edits one file and reviews one diff instead of three or four manifests that silently drift.

The portable piece (`SKILL.md`, the [Agent Skills spec](https://agentskills.io/specification)) already works everywhere. `x927` only handles the part that *isn't* standardized: the per-vendor plugin manifest envelope and marketplace metadata.

## Usage

```bash
# Compile all targets from a PLUGIN.md in the current dir
npx x927 build

# Pick a target, or several
npx x927 build --target cursor --target tessl

# Show what would be written without touching disk
npx x927 build --dry-run

# CI guard — exits 1 if any generated file is out of sync with PLUGIN.md
npx x927 diff

# See which file each target writes
npx x927 list-targets
```

## The source format

`PLUGIN.md` is plain Markdown. The structure is:

- The H1 text (`# <name>`) becomes the plugin name.
- A paragraph immediately after the H1 becomes the `description` (or `summary` for Tessl).
- A bullet list of `- key: value` pairs holds the **base** fields, inherited by every target.
- `## <target>` opens a target-specific override section. Bullets under it override or augment the base.

Comma-separated values become arrays. Sub-bullets also become arrays. `true`/`false`/numbers are coerced.

### Example

```markdown
# app-builder

Development, customization, testing, and deployment skills for Adobe App Builder projects.

- version: 1.0.0
- author: Adobe
- license: Apache-2.0
- repository: https://github.com/adobe/skills
- keywords: app-builder, adobe, development
- skills: ./skills/

## Cursor

- displayName: Adobe App Builder
- logo: ./assets/logo.png

## Codex

- mcpServers: ./mcp.json

## Tessl

- name: adobe/app-builder
- softDependencies: impeccable
```

Running `npx x927 build` against that PLUGIN.md writes:

| Target | Output path | Spec |
|---|---|---|
| Claude Code  | `.claude-plugin/plugin.json` | [code.claude.com/docs/en/plugins-reference](https://code.claude.com/docs/en/plugins-reference) |
| Cursor       | `.cursor-plugin/plugin.json` | [cursor.com/docs/reference/plugins](https://cursor.com/docs/reference/plugins) |
| OpenAI Codex | `.codex-plugin/plugin.json`  | [developers.openai.com/codex/plugins/build](https://developers.openai.com/codex/plugins/build) |
| Tessl        | `tile.json`                  | [docs.tessl.io/reference/configuration](https://docs.tessl.io/reference/configuration) |

## The pipeline

For every target, x927 runs these four steps in order:

1. **Map.** Rename fields the target spells differently. (Tessl's `summary` ← shared `description`.)
2. **Filter.** Drop base fields the target doesn't support, so they don't leak into the manifest.
3. **Merge.** Overlay the `## <target>` section's bullets, which override base fields or add target-specific ones (these bypass the filter; the target section is trusted to know its own format).
4. **Output.** Run any target-specific transforms, then serialize.

Each target is one module under `src/targets/`, describing `rename`, `allow`, `transforms`, and `output`. Adding a fifth target is ~25 lines.

## GitHub Actions

```yaml
- uses: ai-ecoverse/x927@v1
  with:
    command: diff           # or "build"
    input: PLUGIN.md
    target: claude,cursor   # optional; defaults to all
```

`command: diff` makes a useful CI guard. If a contributor forgot to regenerate, the job fails before review.

## Status

All four targets (Claude Code, Cursor, OpenAI Codex, Tessl) are verified against the vendor's documentation or source. The Tessl target additionally runs through `tessl tile lint` in CI as part of the integration test suite.

## Releasing

Releases are automated by [semantic-release](https://semantic-release.gitbook.io/) on every push to `main`. The next version is computed from conventional-commit messages (`feat:` → minor, `fix:` → patch, `feat!:` / `BREAKING CHANGE:` → major). The workflow tags the release, updates `CHANGELOG.md` + `package.json`, publishes to npm with provenance via [OIDC trusted publishing](https://docs.npmjs.com/trusted-publishers), and creates the GitHub release.

The package's trusted-publisher config on npm must reference this repo (`ai-ecoverse/x927`) and the `release.yml` workflow. No `NPM_TOKEN` is stored.

## License

Apache-2.0. See [LICENSE](LICENSE).
