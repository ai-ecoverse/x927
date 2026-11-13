# [2.0.0](https://github.com/ai-ecoverse/x927/compare/v1.2.0...v2.0.0) (2026-11-13)


* feat!: compile from an Agent Plugins plugin.json instead of PLUGIN.md ([b8823cb](https://github.com/ai-ecoverse/x927/commit/b8823cb29e8c82da86111952df61daa42801d146))


### BREAKING CHANGES

* PLUGIN.md is no longer read; the source is a root
plugin.json with the Agent Plugins $schema (see "Migrating from 1.x" in the
README). The Tessl target writes .tessl-plugin/plugin.json, not tile.json.
Without declared targets only the Claude Code manifest is written. The
GitHub Action input "input" is now "path".

Signed-off-by: Lars Trieloff <lars@trieloff.net>

# [1.2.0](https://github.com/ai-ecoverse/x927/compare/v1.1.0...v1.2.0) (2026-05-21)


### Features

* validate v1 floating-tag auto-advance ([41a01e8](https://github.com/ai-ecoverse/x927/commit/41a01e8c41f92748f9993aa6cc0b5b0408e54a7e))

# [1.1.0](https://github.com/ai-ecoverse/x927/compare/v1.0.0...v1.1.0) (2026-05-21)


### Features

* prepare github marketplace ([b2af9f8](https://github.com/ai-ecoverse/x927/commit/b2af9f89bf7fa1dd49401cfa52fbe6cd87d0e582))

# 1.0.0 (2026-05-21)


### Bug Fixes

* **ci:** bump CI Node from 20 to 22 so node --test resolves test globs ([3073d3a](https://github.com/ai-ecoverse/x927/commit/3073d3a53a5ff4cfa00e24b800db6cec88240771))
* **ci:** quote step name with embedded colon to satisfy YAML parser ([0e9c0c3](https://github.com/ai-ecoverse/x927/commit/0e9c0c30a2a41549735f7b4434dd54d67ca517a4))
* make bin executable and normalize package.json for npm ([4e10475](https://github.com/ai-ecoverse/x927/commit/4e104750cc9a52e3a85e0d596b6cbbdef0560116))


### Features

* Apache-2.0, integration tests via tessl tile lint, OIDC publish ([992da5e](https://github.com/ai-ecoverse/x927/commit/992da5e7dbc47e3c4020b03618c53d24fd158223))
* initial x927 — compile PLUGIN.md to Claude/Cursor/Codex/Tessl manifests ([64ff46d](https://github.com/ai-ecoverse/x927/commit/64ff46d410746de479e254b345e7c4bc7227f0d3))
