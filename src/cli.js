import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { compilePlugin } from "./compile.js";
import { findPlugins, findVendorPlugins } from "./discover.js";
import { initPlugin } from "./init.js";
import { compileCatalogs } from "./marketplace.js";
import { SourceError, isPluginRoot, loadPlugin } from "./source.js";
import { TARGETS } from "./targets/index.js";

export async function run(argv) {
  const [command, ...rest] = argv;
  try {
    switch (command) {
      case "build":         return cmdBuild(rest);
      case "diff":          return cmdDiff(rest);
      case "init":          return cmdInit(rest);
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
  } catch (error) {
    if (!(error instanceof SourceError)) throw error;
    console.error(`x927: ${error.message}`);
    process.exit(1);
  }
}

function options(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      target:    { type: "string", multiple: true },
      all:       { type: "boolean" },
      force:     { type: "boolean" },
      "dry-run": { type: "boolean" },
    },
    allowPositionals: true,
  });
  const root = path.resolve(positionals[0] ?? ".");
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new SourceError(`${root}: not a directory`);
  const only = values.target?.flatMap((value) => value.split(",")).map((id) => id.trim()).filter(Boolean) ?? null;
  for (const id of only ?? []) {
    if (!TARGETS[id]) throw new SourceError(`unknown target "${id}". Known: ${Object.keys(TARGETS).join(", ")}`);
  }
  return { root, only, values };
}

// Every file to write, as paths relative to root: the manifests of one plugin, or with
// --all those of every plugin under root and the marketplace catalogs that list them.
function plan(argv) {
  const { root, only, values } = options(argv);
  let dirs;
  if (values.all) {
    dirs = findPlugins(root);
    if (dirs.length === 0) throw new SourceError(`${root}: no Agent Plugins manifest (plugin.json) found under it`);
  } else {
    dirs = [root];
  }
  const plugins = dirs.map(loadPlugin);
  const files = [];
  for (const plugin of plugins) {
    for (const file of compilePlugin(plugin, only)) {
      files.push({ path: path.join(path.relative(root, plugin.dir), file.path), content: file.content });
    }
  }
  let notes = [];
  if (values.all) {
    const catalogs = compileCatalogs(root, plugins);
    files.push(...catalogs.files);
    notes = catalogs.notes;
  }
  return { root, files, notes, values, count: plugins.length };
}

function cmdBuild(argv) {
  const { root, files, notes, values, count } = plan(argv);
  let changed = 0;
  for (const file of files) {
    const full = path.join(root, file.path);
    if (values["dry-run"]) {
      console.log(`--- ${file.path} ---\n${file.content}`);
      continue;
    }
    const existing = fs.existsSync(full) ? fs.readFileSync(full, "utf8") : null;
    if (existing === file.content) continue;
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, file.content);
    console.log(`wrote ${file.path}`);
    changed += 1;
  }
  for (const note of notes) console.log(`note: ${note}`);
  if (!values["dry-run"]) console.log(`x927: ${count} plugin(s), ${files.length} file(s), ${changed} written`);
}

function cmdDiff(argv) {
  const { root, files, notes } = plan(argv);
  const drifted = [];
  for (const file of files) {
    const full = path.join(root, file.path);
    const existing = fs.existsSync(full) ? fs.readFileSync(full, "utf8") : null;
    if (existing !== file.content) drifted.push(existing === null ? `missing: ${file.path}` : `drift:   ${file.path}`);
  }
  for (const note of notes) console.log(`note: ${note}`);
  if (drifted.length === 0) {
    console.log(`x927: ${files.length} file(s) in sync with plugin.json`);
    return;
  }
  for (const line of drifted) console.log(line);
  console.error(`\n${drifted.length} file(s) out of sync. Run \`x927 build\` to regenerate.`);
  process.exit(1);
}

function cmdInit(argv) {
  const { root, values } = options(argv);
  const dirs = values.all ? findVendorPlugins(root) : [root];
  if (dirs.length === 0) throw new SourceError(`${root}: no vendor manifest found under it`);
  for (const dir of dirs) {
    const rel = path.relative(root, dir) || ".";
    if (values.all && isPluginRoot(dir) && !values.force) {
      console.log(`${rel}: has a plugin.json, left alone`);
      continue;
    }
    const { written, notes } = initPlugin(dir, { force: values.force });
    console.log(`${rel}: wrote ${written.join(", ")}`);
    for (const note of notes) console.log(`  ${note}`);
  }
  console.log(`\nReview the plugin.json files, then run \`x927 build${values.all ? " --all" : ""}\`.`);
}

function cmdListTargets() {
  const width = Math.max(...Object.keys(TARGETS).map((id) => id.length));
  for (const [id, target] of Object.entries(TARGETS)) {
    console.log(`${id.padEnd(width)}  ->  ${target.path}  (${target.label})`);
  }
}

function cmdVersion() {
  const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  console.log(pkg.version);
}

function cmdHelp() {
  console.log(`x927: compile an Agent Plugins plugin.json into the manifests of clients that don't read it.

Usage:
  x927 build [dir] [--all] [--target claude|tessl|cursor|codex ...] [--dry-run]
  x927 diff  [dir] [--all] [--target ...]     exits 1 if a generated file is out of sync
  x927 init  [dir] [--all] [--force]          write plugin.json from existing vendor manifests
  x927 list-targets
  x927 --version

dir is a plugin root (default: the current directory). With --all it is a repository:
every plugin.json under it is compiled, and the marketplace catalogs that list those
plugins are brought in line with them.

The source is the root plugin.json of https://agent-plugins.org. Which manifests to
write, and what they hold beyond the portable fields, is in its
extensions["io.github.ai-ecoverse.x927"] object.`);
}
