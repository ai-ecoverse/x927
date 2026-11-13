import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import url from "node:url";
import { spawnSync } from "node:child_process";

const REPO = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const EXAMPLE = path.join(REPO, "examples/app-builder");
const X927 = path.join(REPO, "bin/x927.js");
const NS = "io.github.ai-ecoverse.x927";
const SCHEMA = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json";

const has = (bin) => spawnSync("which", [bin]).status === 0;

function tmp(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "x927-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function example(t) {
  const dir = tmp(t);
  fs.cpSync(EXAMPLE, dir, { recursive: true });
  return dir;
}

function write(dir, rel, value) {
  const file = path.join(dir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`);
}

const read = (dir, rel) => JSON.parse(fs.readFileSync(path.join(dir, rel), "utf8"));
const x927 = (args, cwd) => spawnSync("node", [X927, ...args], { cwd, encoding: "utf8" });

function plugin(t, manifest, files = {}) {
  const dir = tmp(t);
  write(dir, "plugin.json", { $schema: SCHEMA, name: "demo", ...manifest });
  for (const [rel, value] of Object.entries(files)) write(dir, rel, value);
  return dir;
}

test("build writes the declared targets and .mcp.json, and nothing else", (t) => {
  const dir = example(t);
  const r = x927(["build"], dir);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(read(dir, ".claude-plugin/plugin.json").name, "app-builder");
  assert.strictEqual(read(dir, ".tessl-plugin/plugin.json").name, "adobe/app-builder");
  assert.strictEqual(read(dir, ".cursor-plugin/plugin.json").displayName, "Adobe App Builder");
  assert.ok(fs.existsSync(path.join(dir, ".mcp.json")));
  assert.ok(!fs.existsSync(path.join(dir, ".codex-plugin")), "codex is not declared, so it is not written");
  assert.ok(!fs.existsSync(path.join(dir, "tile.json")), "the legacy tile.json is gone");
});

test("a plugin.json without the x927 extension builds the Claude manifest only", (t) => {
  const dir = plugin(t, { version: "1.0.0", description: "Demo" });
  assert.strictEqual(x927(["build"], dir).status, 0);
  assert.deepStrictEqual(read(dir, ".claude-plugin/plugin.json"), { name: "demo", version: "1.0.0", description: "Demo" });
  assert.ok(!fs.existsSync(path.join(dir, ".tessl-plugin")));
});

test("author is an object in every manifest", (t) => {
  const dir = example(t);
  x927(["build"], dir);
  for (const rel of [".claude-plugin/plugin.json", ".tessl-plugin/plugin.json", ".cursor-plugin/plugin.json"]) {
    assert.deepStrictEqual(read(dir, rel).author, { name: "Adobe" }, rel);
  }
});

test("an override replaces a portable field, and null removes it", (t) => {
  const dir = plugin(t, {
    description: "Portable, with a comma",
    keywords: ["a", "b"],
    extensions: { [NS]: { targets: { claude: { description: "For Claude, with a comma", keywords: null, dependencies: ["impeccable"] } } } },
  });
  assert.strictEqual(x927(["build"], dir).status, 0);
  assert.deepStrictEqual(read(dir, ".claude-plugin/plugin.json"), {
    name: "demo",
    description: "For Claude, with a comma",
    dependencies: ["impeccable"],
  });
});

test("Tessl gets description, not summary, and no keywords", (t) => {
  const dir = example(t);
  x927(["build", "--target", "tessl"], dir);
  const manifest = read(dir, ".tessl-plugin/plugin.json");
  assert.ok("description" in manifest && !("summary" in manifest));
  assert.ok(!("keywords" in manifest));
});

test("Tessl without a workspace-qualified name fails and writes nothing", (t) => {
  const dir = plugin(t, { extensions: { [NS]: { targets: { tessl: {} } } } });
  const r = x927(["build"], dir);
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /targets\.tessl\.name/);
  assert.ok(!fs.existsSync(path.join(dir, ".tessl-plugin")));
});

test("the Codex compatibility manifest carries the com.openai extension", (t) => {
  const dir = plugin(t, {
    version: "1.0.0",
    description: "Demo",
    extensions: { "com.openai": { interface: { displayName: "Demo" } }, [NS]: { targets: { codex: { skills: "./skills/" } } } },
  });
  assert.strictEqual(x927(["build"], dir).status, 0);
  const manifest = read(dir, ".codex-plugin/plugin.json");
  assert.deepStrictEqual(manifest.interface, { displayName: "Demo" });
  assert.strictEqual(manifest.skills, "./skills/");
  assert.ok(!("extensions" in manifest));
});

test("a top-level key outside the Agent Plugins schema is refused by name", (t) => {
  const dir = plugin(t, { skills: "./skills/" });
  const r = x927(["build"], dir);
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /skills/);
});

test("a plugin.json without the Agent Plugins $schema is refused", (t) => {
  const dir = tmp(t);
  write(dir, "plugin.json", { name: "demo" });
  const r = x927(["build"], dir);
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /\$schema/);
});

test("displayName is portable in Agent Plugins 1.1.0 and refused in 1.0.0", (t) => {
  const next = plugin(t, { $schema: SCHEMA.replace("1.0.0", "1.1.0"), displayName: "Demo Plugin" });
  assert.strictEqual(x927(["build"], next).status, 0);
  assert.strictEqual(read(next, ".claude-plugin/plugin.json").displayName, "Demo Plugin");
  const current = plugin(t, { displayName: "Demo Plugin" });
  assert.strictEqual(x927(["build"], current).status, 1);
});

test(".mcp.json takes Claude Code's transport name and placeholders", (t) => {
  const dir = plugin(t, {}, {
    "mcp.json": {
      $schema: SCHEMA.replace("plugin.schema", "mcp.schema"),
      mcpServers: {
        remote: { type: "streamable-http", url: "https://example.com/mcp" },
        local: { type: "stdio", command: "node", args: ["${PLUGIN_ROOT}/server.js"], env: { DATA: "${PLUGIN_DATA}" }, cwd: "${PLUGIN_ROOT}" },
      },
    },
  });
  assert.strictEqual(x927(["build"], dir).status, 0);
  assert.deepStrictEqual(read(dir, ".mcp.json"), {
    mcpServers: {
      remote: { type: "http", url: "https://example.com/mcp" },
      local: { type: "stdio", command: "node", args: ["${CLAUDE_PLUGIN_ROOT}/server.js"], env: { DATA: "${CLAUDE_PLUGIN_DATA}" }, cwd: "${CLAUDE_PLUGIN_ROOT}" },
    },
  });
});

test("an mcp.json that breaks the schema is refused", (t) => {
  const dir = plugin(t, {}, { "mcp.json": { $schema: SCHEMA.replace("plugin.schema", "mcp.schema"), mcpServers: { remote: { type: "http", url: "https://example.com/mcp" } } } });
  const r = x927(["build"], dir);
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /mcp\.json/);
});

test("diff exits 0 in sync, and 1 naming a drifted and a missing file", (t) => {
  const dir = example(t);
  x927(["build"], dir);
  assert.strictEqual(x927(["diff"], dir).status, 0);
  write(dir, ".claude-plugin/plugin.json", { name: "stale" });
  fs.rmSync(path.join(dir, ".mcp.json"));
  const r = x927(["diff"], dir);
  assert.strictEqual(r.status, 1);
  assert.match(r.stdout, /drift: {3}\.claude-plugin\/plugin\.json/);
  assert.match(r.stdout, /missing: \.mcp\.json/);
});

test("--target narrows the build, and an unknown target is an error", (t) => {
  const dir = example(t);
  assert.strictEqual(x927(["build", "--target", "cursor"], dir).status, 0);
  assert.ok(fs.existsSync(path.join(dir, ".cursor-plugin/plugin.json")));
  assert.ok(!fs.existsSync(path.join(dir, ".claude-plugin")));
  assert.ok(!fs.existsSync(path.join(dir, ".mcp.json")), "Cursor reads the root mcp.json");
  const r = x927(["build", "--target", "bogus"], dir);
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /unknown target/);
});

function repository(t) {
  const root = tmp(t);
  write(root, "plugins/one/plugin.json", { $schema: SCHEMA, name: "one", version: "2.0.0", description: "One, from plugin.json", license: "MIT", keywords: ["x"] });
  write(root, "plugins/two/plugin.json", {
    $schema: SCHEMA, name: "two", version: "0.3.0", description: "Two, from plugin.json",
    extensions: { [NS]: { marketplace: { description: "Two, for the catalog", category: "tools" } } },
  });
  write(root, "plugins/hidden/plugin.json", { $schema: SCHEMA, name: "hidden", version: "9.9.9", extensions: { [NS]: { marketplace: false } } });
  write(root, "plugins/unlisted/plugin.json", { $schema: SCHEMA, name: "unlisted" });
  write(root, "plugins/legacy/.claude-plugin/plugin.json", { name: "legacy" });
  write(root, "node_modules/dep/plugin.json", { $schema: SCHEMA, name: "dep" });
  write(root, ".claude-plugin/marketplace.json", {
    name: "market",
    owner: { name: "Owner" },
    plugins: [
      { name: "one", source: "./plugins/one", description: "stale", license: "Apache-2.0", category: "kept" },
      { name: "two", source: "./plugins/two", description: "stale", version: "0.1.0" },
      { name: "hidden", source: "./plugins/hidden", description: "hand-written", version: "1.0.0" },
      { name: "legacy", source: "./plugins/legacy", description: "hand-written" },
      { name: "remote", source: { source: "github", repo: "a/b" }, description: "hand-written" },
    ],
  });
  return root;
}

test("build --all compiles every plugin and brings the catalog in line", (t) => {
  const root = repository(t);
  const r = x927(["build", "--all"], root);
  assert.strictEqual(r.status, 0, r.stderr);
  for (const name of ["one", "two", "hidden", "unlisted"]) {
    assert.strictEqual(read(root, `plugins/${name}/.claude-plugin/plugin.json`).name, name);
  }
  assert.ok(!fs.existsSync(path.join(root, "node_modules/dep/.claude-plugin")), "node_modules is not searched");
  const catalog = read(root, ".claude-plugin/marketplace.json");
  assert.deepStrictEqual(catalog.owner, { name: "Owner" });
  assert.deepStrictEqual(catalog.plugins[0], { name: "one", source: "./plugins/one", description: "One, from plugin.json", license: "MIT", category: "kept", version: "2.0.0" });
  assert.deepStrictEqual(catalog.plugins[1], { name: "two", source: "./plugins/two", description: "Two, for the catalog", version: "0.3.0", category: "tools" });
  assert.deepStrictEqual(catalog.plugins[2], { name: "hidden", source: "./plugins/hidden", description: "hand-written", version: "1.0.0" });
  assert.deepStrictEqual(catalog.plugins[3], { name: "legacy", source: "./plugins/legacy", description: "hand-written" });
  assert.strictEqual(catalog.plugins[4].description, "hand-written");
  assert.match(r.stdout, /note: plugins\/unlisted is not listed/);
  assert.doesNotMatch(r.stdout, /plugins\/hidden is not listed/);
  assert.strictEqual(x927(["diff", "--all"], root).status, 0);
});

test("diff --all fails when a catalog entry is behind its plugin", (t) => {
  const root = repository(t);
  x927(["build", "--all"], root);
  const manifest = read(root, "plugins/one/plugin.json");
  write(root, "plugins/one/plugin.json", { ...manifest, version: "2.1.0" });
  const r = x927(["diff", "--all"], root);
  assert.strictEqual(r.status, 1);
  assert.match(r.stdout, /drift: {3}\.claude-plugin\/marketplace\.json/);
  assert.match(r.stdout, /drift: {3}plugins\/one\/\.claude-plugin\/plugin\.json/);
});

test("a catalog entry under another name than its plugin is an error", (t) => {
  const root = repository(t);
  const catalog = read(root, ".claude-plugin/marketplace.json");
  catalog.plugins[0].name = "uno";
  write(root, ".claude-plugin/marketplace.json", catalog);
  const r = x927(["build", "--all"], root);
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /"uno".*"one"/);
});

test("init writes a plugin.json that builds the same manifests back", (t) => {
  const dir = tmp(t);
  const claude = {
    name: "stardust", description: "Redesign a site, migrate it, and deploy it.", version: "0.37.2", author: "Adobe",
    repository: "https://github.com/adobe/skills", license: "Apache-2.0", keywords: ["design", "aem"],
    dependencies: ["impeccable"], skills: ["./skills/", "./skills/extra/nested"],
  };
  const tessl = { name: "adobe/stardust", version: "0.21.2", description: claude.description, skills: ["skills/extract"], dependencies: ["impeccable"] };
  write(dir, ".claude-plugin/plugin.json", claude);
  write(dir, ".tessl-plugin/plugin.json", tessl);
  write(dir, ".mcp.json", { mcpServers: { stardust: { type: "http", url: "https://example.com/mcp" } } });

  const r = x927(["init"], dir);
  assert.strictEqual(r.status, 0, r.stderr);
  const manifest = read(dir, "plugin.json");
  assert.strictEqual(manifest.$schema, SCHEMA);
  assert.deepStrictEqual(manifest.author, { name: "Adobe" });
  assert.deepStrictEqual(manifest.extensions[NS].targets.claude, { dependencies: ["impeccable"], skills: ["./skills/", "./skills/extra/nested"] });
  assert.deepStrictEqual(manifest.extensions[NS].targets.tessl, { name: "adobe/stardust", version: "0.21.2", skills: ["skills/extract"], dependencies: ["impeccable"] });
  assert.strictEqual(read(dir, "mcp.json").mcpServers.stardust.type, "streamable-http");
  assert.match(r.stdout, /build \.tessl-plugin\/plugin\.json: adds author, adds repository, adds license/);

  assert.strictEqual(x927(["build"], dir).status, 0);
  assert.deepStrictEqual(read(dir, ".claude-plugin/plugin.json"), { ...claude, author: { name: "Adobe" } });
  assert.deepStrictEqual(read(dir, ".tessl-plugin/plugin.json"), { ...tessl, author: { name: "Adobe" }, repository: claude.repository, license: claude.license });
  assert.deepStrictEqual(read(dir, ".mcp.json"), { mcpServers: { stardust: { type: "http", url: "https://example.com/mcp" } } });
});

test("init refuses a name Agent Plugins does not allow, and an existing plugin.json", (t) => {
  const bad = tmp(t);
  write(bad, ".claude-plugin/plugin.json", { name: "My Plugin" });
  const r = x927(["init"], bad);
  assert.strictEqual(r.status, 1);
  assert.match(r.stderr, /not a valid Agent Plugins name/);
  assert.ok(!fs.existsSync(path.join(bad, "plugin.json")));

  const dir = example(t);
  x927(["build"], dir);
  const again = x927(["init"], dir);
  assert.strictEqual(again.status, 1);
  assert.match(again.stderr, /already exists/);
});

test("init --all starts every plugin that has a vendor manifest", (t) => {
  const root = repository(t);
  const r = x927(["init", "--all"], root);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(read(root, "plugins/legacy/plugin.json").name, "legacy");
  assert.ok(!fs.existsSync(path.join(root, "plugin.json")), "a marketplace alone is not a plugin");
});

test("claude plugin validate accepts the generated manifest", { skip: !has("claude") && "claude CLI not installed" }, (t) => {
  const dir = example(t);
  x927(["build"], dir);
  const r = spawnSync("claude", ["plugin", "validate", dir], { encoding: "utf8" });
  assert.strictEqual(r.status, 0, `${r.stdout}\n${r.stderr}`);
});

test("tessl plugin lint accepts the generated manifest", { skip: !has("tessl") && "tessl CLI not installed" }, (t) => {
  const dir = example(t);
  x927(["build"], dir);
  const r = spawnSync("tessl", ["plugin", "lint", dir], { encoding: "utf8" });
  assert.strictEqual(r.status, 0, `${r.stdout}\n${r.stderr}`);
});

test("init leaves a .mcp.json alone when a server does not fit the portable schema", (t) => {
  const dir = tmp(t);
  write(dir, ".claude-plugin/plugin.json", { name: "demo" });
  write(dir, ".mcp.json", { mcpServers: { odd: { type: "http", url: "https://example.com/mcp", headers: { "X-Retries": 3 } }, ws: { type: "ws", url: "wss://example.com" } } });
  const first = x927(["init"], dir);
  assert.strictEqual(first.status, 0, first.stderr);
  assert.match(first.stdout, /stays hand-written/);
  assert.ok(!fs.existsSync(path.join(dir, "mcp.json")));

  write(dir, ".mcp.json", { mcpServers: { odd: { type: "http", url: "https://example.com/mcp", headers: { "X-Retries": 3 } } } });
  const second = x927(["init", "--force"], dir);
  assert.strictEqual(second.status, 0, second.stderr);
  assert.match(second.stdout, /stays hand-written/);
  assert.ok(!fs.existsSync(path.join(dir, "mcp.json")));
  assert.strictEqual(x927(["diff"], dir).status, 0);
});
