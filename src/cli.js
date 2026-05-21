import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { parse } from "./parse.js";
import { compile } from "./compile.js";
import { TARGETS } from "./targets/index.js";

export async function run(argv) {
  const [command, ...rest] = argv;
  switch (command) {
    case "build":         return cmdBuild(rest);
    case "diff":          return cmdDiff(rest);
    case "list-targets":  return cmdListTargets();
    case "-v":
    case "--version":     return cmdVersion();
    case undefined:
    case "-h":
    case "--help":        return cmdHelp();
    default:
      console.error(`x927: unknown command "${command}"\n`);
      cmdHelp();
      process.exit(2);
  }
}

function loadPluginMd(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      target:    { type: "string", multiple: true },
      input:     { type: "string", short: "i" },
      "dry-run": { type: "boolean" },
    },
    allowPositionals: true,
  });
  const inputPath = path.resolve(values.input ?? positionals[0] ?? "PLUGIN.md");
  if (!fs.existsSync(inputPath)) {
    console.error(`x927: input not found: ${inputPath}`);
    process.exit(1);
  }
  const parsed = parse(fs.readFileSync(inputPath, "utf8"));
  const targetIds = values.target?.length ? values.target : Object.keys(TARGETS);
  for (const id of targetIds) {
    if (!TARGETS[id]) {
      console.error(`x927: unknown target "${id}". Known: ${Object.keys(TARGETS).join(", ")}`);
      process.exit(1);
    }
  }
  return { parsed, targetIds, baseDir: path.dirname(inputPath), values };
}

function cmdBuild(argv) {
  const { parsed, targetIds, baseDir, values } = loadPluginMd(argv);
  for (const id of targetIds) {
    const { path: outRel, content } = compile(parsed, TARGETS[id], { baseDir });
    const outPath = path.join(baseDir, outRel);
    if (values["dry-run"]) {
      console.log(`--- ${path.relative(process.cwd(), outPath)} ---\n${content}`);
    } else {
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, content);
      console.log(`wrote ${path.relative(process.cwd(), outPath)}`);
    }
  }
}

function cmdDiff(argv) {
  const { parsed, targetIds, baseDir } = loadPluginMd(argv);
  const drifted = [];
  for (const id of targetIds) {
    const { path: outRel, content } = compile(parsed, TARGETS[id], { baseDir });
    const outPath = path.join(baseDir, outRel);
    const existing = fs.existsSync(outPath) ? fs.readFileSync(outPath, "utf8") : null;
    if (existing !== content) drifted.push({ outPath, existing, content });
  }
  if (drifted.length === 0) {
    console.log("x927: all targets are in sync with PLUGIN.md");
    return;
  }
  for (const { outPath, existing } of drifted) {
    console.log(existing === null ? `missing: ${outPath}` : `drift:   ${outPath}`);
  }
  console.error(`\n${drifted.length} file(s) out of sync. Run \`x927 build\` to regenerate.`);
  process.exit(1);
}

function cmdListTargets() {
  const w = Math.max(...Object.keys(TARGETS).map((k) => k.length));
  for (const [id, target] of Object.entries(TARGETS)) {
    console.log(`${id.padEnd(w)}  →  ${target.output.path}`);
  }
}

function cmdVersion() {
  const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  console.log(pkg.version);
}

function cmdHelp() {
  console.log(`x927 — compile one PLUGIN.md to plugin manifests for Claude Code, Cursor, Codex, and Tessl.

Usage:
  x927 build [PLUGIN.md] [--target claude|cursor|codex|tessl ...] [--dry-run]
  x927 diff  [PLUGIN.md] [--target ...]   (exits 1 if generated files drift)
  x927 list-targets
  x927 --version

Named after XKCD 927 — yes, this introduces a fifth competing standard. The
intent is that the fifth one writes the other four, so you only review one.`);
}
