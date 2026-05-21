import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import url from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "..");
const EXAMPLE = path.join(REPO, "examples/app-builder");
const X927 = path.join(REPO, "bin/x927.js");

const HAS_TESSL = spawnSync("which", ["tessl"]).status === 0;

function freshExample() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "x927-test-"));
  fs.cpSync(EXAMPLE, dir, { recursive: true });
  return dir;
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function x927(args, cwd) {
  return spawnSync("node", [X927, ...args], { cwd, encoding: "utf8" });
}

test("build emits all four target manifests as valid JSON", () => {
  const dir = freshExample();
  try {
    const r = x927(["build"], dir);
    assert.strictEqual(r.status, 0, `build failed:\n${r.stderr}`);
    for (const rel of [
      ".claude-plugin/plugin.json",
      ".cursor-plugin/plugin.json",
      ".codex-plugin/plugin.json",
      "tile.json",
    ]) {
      const full = path.join(dir, rel);
      assert.ok(fs.existsSync(full), `expected ${rel} to be written`);
      assert.doesNotThrow(
        () => JSON.parse(fs.readFileSync(full, "utf8")),
        `${rel} is not valid JSON`,
      );
    }
  } finally {
    cleanup(dir);
  }
});

test("Tessl target auto-expands skills directory to the record form", () => {
  const dir = freshExample();
  try {
    x927(["build", "--target", "tessl"], dir);
    const tile = JSON.parse(fs.readFileSync(path.join(dir, "tile.json"), "utf8"));
    assert.strictEqual(typeof tile.skills, "object", "skills should be an object, not a string");
    assert.ok(!Array.isArray(tile.skills));
    assert.ok("hello" in tile.skills, "expected hello skill in tile.json");
    assert.ok("world" in tile.skills, "expected world skill in tile.json");
    assert.strictEqual(tile.skills.hello.path, "skills/hello/SKILL.md");
    assert.strictEqual(tile.skills.world.path, "skills/world/SKILL.md");
  } finally {
    cleanup(dir);
  }
});

test("tessl tile lint accepts the generated tile.json", { skip: !HAS_TESSL && "tessl CLI not installed" }, () => {
  const dir = freshExample();
  try {
    x927(["build", "--target", "tessl"], dir);
    const r = spawnSync("tessl", ["tile", "lint", "."], { cwd: dir, encoding: "utf8" });
    assert.strictEqual(
      r.status,
      0,
      `tessl tile lint exited ${r.status}\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`,
    );
    assert.match(r.stdout, /is valid/, "expected 'is valid' in tessl tile lint output");
  } finally {
    cleanup(dir);
  }
});

test("Tessl rename: description from base becomes summary in tile.json", () => {
  const dir = freshExample();
  try {
    x927(["build", "--target", "tessl"], dir);
    const tile = JSON.parse(fs.readFileSync(path.join(dir, "tile.json"), "utf8"));
    assert.ok("summary" in tile, "tile.json should have summary");
    assert.ok(!("description" in tile), "tile.json should not have description");
  } finally {
    cleanup(dir);
  }
});

test("Tessl filter drops base fields not in allowlist (license, repository, keywords)", () => {
  const dir = freshExample();
  try {
    x927(["build", "--target", "tessl"], dir);
    const tile = JSON.parse(fs.readFileSync(path.join(dir, "tile.json"), "utf8"));
    for (const f of ["license", "repository", "keywords", "author"]) {
      assert.ok(!(f in tile), `tile.json should not contain ${f}`);
    }
  } finally {
    cleanup(dir);
  }
});

test("Cursor target merges displayName and logo from ## Cursor section", () => {
  const dir = freshExample();
  try {
    x927(["build", "--target", "cursor"], dir);
    const m = JSON.parse(fs.readFileSync(path.join(dir, ".cursor-plugin/plugin.json"), "utf8"));
    assert.strictEqual(m.displayName, "Adobe App Builder");
    assert.strictEqual(m.logo, "./assets/logo.png");
  } finally {
    cleanup(dir);
  }
});

test("keywords is coerced to an array even when comma-separated in source", () => {
  const dir = freshExample();
  try {
    x927(["build", "--target", "claude"], dir);
    const m = JSON.parse(fs.readFileSync(path.join(dir, ".claude-plugin/plugin.json"), "utf8"));
    assert.ok(Array.isArray(m.keywords));
    assert.ok(m.keywords.length >= 2);
  } finally {
    cleanup(dir);
  }
});

test("softDependencies single value still becomes an array", () => {
  const dir = freshExample();
  try {
    x927(["build", "--target", "tessl"], dir);
    const tile = JSON.parse(fs.readFileSync(path.join(dir, "tile.json"), "utf8"));
    assert.ok(Array.isArray(tile.softDependencies), "softDependencies must be an array");
    assert.deepStrictEqual(tile.softDependencies, ["impeccable"]);
  } finally {
    cleanup(dir);
  }
});

test("diff exits 0 when generated files are in sync", () => {
  const dir = freshExample();
  try {
    x927(["build"], dir);
    const r = x927(["diff"], dir);
    assert.strictEqual(r.status, 0, `diff failed:\n${r.stdout}\n${r.stderr}`);
  } finally {
    cleanup(dir);
  }
});

test("diff exits 1 when a generated file has drifted", () => {
  const dir = freshExample();
  try {
    x927(["build"], dir);
    fs.writeFileSync(path.join(dir, "tile.json"), '{"name":"stale"}\n');
    const r = x927(["diff"], dir);
    assert.strictEqual(r.status, 1);
    assert.match(r.stdout, /drift:/);
  } finally {
    cleanup(dir);
  }
});

test("--target restricts output to the named target only", () => {
  const dir = freshExample();
  try {
    const r = x927(["build", "--target", "claude"], dir);
    assert.strictEqual(r.status, 0);
    assert.ok(fs.existsSync(path.join(dir, ".claude-plugin/plugin.json")));
    assert.ok(!fs.existsSync(path.join(dir, ".cursor-plugin/plugin.json")));
    assert.ok(!fs.existsSync(path.join(dir, ".codex-plugin/plugin.json")));
    assert.ok(!fs.existsSync(path.join(dir, "tile.json")));
  } finally {
    cleanup(dir);
  }
});

test("unknown target name exits with error", () => {
  const dir = freshExample();
  try {
    const r = x927(["build", "--target", "bogus"], dir);
    assert.notStrictEqual(r.status, 0);
    assert.match(r.stderr, /unknown target/);
  } finally {
    cleanup(dir);
  }
});
