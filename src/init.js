import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { TARGETS } from "./targets/index.js";
import { compilePlugin, serialize } from "./compile.js";
import { DEFAULT_SPEC, NAMESPACE, SCHEMA_PREFIX, SourceError, loadPlugin } from "./source.js";

const NAME = /^(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;
const ORDER = ["claude", "cursor", "codex", "tessl"];
const SERVER_KEYS = {
  stdio: ["type", "command", "args", "env", "cwd"],
  "streamable-http": ["type", "url", "headers"],
  sse: ["type", "url", "headers"],
};

function normalize(key, value) {
  if (key === "author" && typeof value === "string") return { name: value };
  return value;
}

// Whether a value may sit in the portable part of an Agent Plugins 1.0.0 manifest.
function portable(key, value) {
  if (key === "name") return typeof value === "string" && value.length <= 64 && NAME.test(value);
  if (key === "keywords") return Array.isArray(value) && value.every((item) => typeof item === "string");
  if (key === "author") {
    return value !== null && typeof value === "object" && !Array.isArray(value) &&
      Object.entries(value).every(([k, v]) => ["name", "email", "url"].includes(k) && typeof v === "string");
  }
  if (key === "displayName") return false;
  return typeof value === "string";
}

function toPortableMcp(doc) {
  const servers = {};
  for (const [name, server] of Object.entries(doc.mcpServers ?? {})) {
    let type = server.type;
    if (type === "http") type = "streamable-http";
    if (!type && server.command) type = "stdio";
    if (!SERVER_KEYS[type]) return null;
    const out = { ...server, type };
    if (Object.keys(out).some((key) => !SERVER_KEYS[type].includes(key))) return null;
    const text = JSON.stringify(out).replaceAll("${CLAUDE_PLUGIN_ROOT}", "${PLUGIN_ROOT}").replaceAll("${CLAUDE_PLUGIN_DATA}", "${PLUGIN_DATA}");
    servers[name] = JSON.parse(text);
  }
  return { $schema: `${SCHEMA_PREFIX}${DEFAULT_SPEC}/mcp.schema.json`, mcpServers: servers };
}

function changes(before, after) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const out = [];
  for (const key of keys) {
    if (!(key in before)) out.push(`adds ${key}`);
    else if (!(key in after)) out.push(`drops ${key}`);
    else if (!isDeepStrictEqual(before[key], after[key])) out.push(`changes ${key}`);
  }
  return out;
}

// Write a root plugin.json (and mcp.json) for a plugin that has only vendor manifests.
// The portable fields come from the first manifest found; what a vendor manifest has
// beyond them becomes that target's overrides, so a build writes the same manifests back.
export function initPlugin(dir, { force = false } = {}) {
  const file = path.join(dir, "plugin.json");
  if (fs.existsSync(file) && !force) throw new SourceError(`${file}: already exists (pass --force to replace it)`);

  const vendor = {};
  for (const id of ORDER) {
    const manifestFile = path.join(dir, TARGETS[id].path);
    if (!fs.existsSync(manifestFile)) continue;
    try {
      vendor[id] = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
    } catch (error) {
      throw new SourceError(`${manifestFile}: not valid JSON (${error.message})`);
    }
  }
  const ids = Object.keys(vendor);
  if (ids.length === 0) {
    throw new SourceError(`${dir}: no vendor manifest to start from (${ORDER.map((id) => TARGETS[id].path).join(", ")})`);
  }

  const first = { ...vendor[ids[0]] };
  if (ids[0] === "tessl" && typeof first.name === "string") first.name = first.name.split("/").pop();
  const manifest = { $schema: `${SCHEMA_PREFIX}${DEFAULT_SPEC}/plugin.schema.json` };
  for (const key of ["name", "version", "description", "author", "homepage", "repository", "license", "keywords"]) {
    const value = normalize(key, first[key]);
    if (value !== undefined && portable(key, value)) manifest[key] = value;
  }
  if (!manifest.name) throw new SourceError(`${dir}: "${first.name}" is not a valid Agent Plugins name (lowercase letters, digits, hyphens and periods)`);

  const targets = {};
  for (const id of ids) {
    const overrides = {};
    for (const [key, raw] of Object.entries(vendor[id])) {
      const value = normalize(key, raw);
      const inherited = TARGETS[id].portable.includes(key) && manifest[key] !== undefined;
      if (!inherited || !isDeepStrictEqual(value, manifest[key])) overrides[key] = value;
    }
    targets[id] = overrides;
  }
  manifest.extensions = { [NAMESPACE]: { targets } };

  const previous = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
  const written = ["plugin.json"];
  const notes = [];
  const legacyMcp = path.join(dir, ".mcp.json");
  const mcpFile = path.join(dir, "mcp.json");
  const unportable = ".mcp.json has servers the portable mcp.json cannot express; it stays hand-written";
  let wroteMcp = false;
  if (fs.existsSync(legacyMcp) && !fs.existsSync(mcpFile)) {
    let converted = null;
    try {
      converted = toPortableMcp(JSON.parse(fs.readFileSync(legacyMcp, "utf8")));
    } catch {
      converted = null;
    }
    if (converted) {
      fs.writeFileSync(mcpFile, serialize(converted));
      wroteMcp = true;
    } else {
      notes.push(unportable);
    }
  }
  fs.writeFileSync(file, serialize(manifest));

  let plugin;
  try {
    plugin = loadPlugin(dir);
  } catch (error) {
    if (wroteMcp) {
      fs.rmSync(mcpFile);
      wroteMcp = false;
      notes.push(unportable);
    }
    try {
      plugin = loadPlugin(dir);
    } catch {
      if (previous === null) fs.rmSync(file);
      else fs.writeFileSync(file, previous);
      throw error;
    }
  }
  if (wroteMcp) written.push("mcp.json");
  for (const out of compilePlugin(plugin)) {
    const existing = path.join(dir, out.path);
    const before = fs.existsSync(existing) ? JSON.parse(fs.readFileSync(existing, "utf8")) : {};
    const diff = changes(before, JSON.parse(out.content));
    if (diff.length > 0) notes.push(`build ${out.path}: ${diff.join(", ")}`);
  }
  return { written, notes };
}
