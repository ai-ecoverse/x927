import { TARGETS } from "./targets/index.js";
import { SourceError } from "./source.js";

export function serialize(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

// One target's manifest: the portable fields the target reads, then the client's own
// extension (Codex), then the overrides from the x927 extension. An override of null
// removes a field.
export function compileManifest(plugin, id) {
  const target = TARGETS[id];
  if (!target) throw new SourceError(`${plugin.file}: unknown target "${id}" (known: ${Object.keys(TARGETS).join(", ")})`);

  const fields = {};
  for (const key of target.portable) {
    if (plugin.manifest[key] !== undefined) fields[key] = plugin.manifest[key];
  }
  if (target.extension) Object.assign(fields, plugin.manifest.extensions?.[target.extension] ?? {});
  for (const [key, value] of Object.entries(plugin.targets[id] ?? {})) {
    if (value === null) delete fields[key];
    else fields[key] = value;
  }

  const problem = target.check(fields);
  if (problem) throw new SourceError(`${plugin.file}: ${problem}`);
  return { path: target.path, content: serialize(fields) };
}

const CLAUDE_TYPES = { "streamable-http": "http" };
const CLAUDE_PLACEHOLDERS = { "${PLUGIN_ROOT}": "${CLAUDE_PLUGIN_ROOT}", "${PLUGIN_DATA}": "${CLAUDE_PLUGIN_DATA}" };

function expand(value) {
  return value.replace(/\$\{PLUGIN_(ROOT|DATA)\}/g, (match) => CLAUDE_PLACEHOLDERS[match]);
}

// .mcp.json, which Claude Code and Tessl read, from the root mcp.json: the schema
// identifier goes, streamable-http becomes http, and the placeholders get Claude Code's names.
export function compileMcp(plugin) {
  const servers = {};
  for (const [name, server] of Object.entries(plugin.mcp.mcpServers ?? {})) {
    const out = { ...server, type: CLAUDE_TYPES[server.type] ?? server.type };
    delete out.extensions;
    if (Array.isArray(out.args)) out.args = out.args.map(expand);
    if (out.env) out.env = Object.fromEntries(Object.entries(out.env).map(([key, value]) => [key, expand(value)]));
    if (typeof out.cwd === "string") out.cwd = expand(out.cwd);
    servers[name] = out;
  }
  return { path: ".mcp.json", content: serialize({ mcpServers: servers }) };
}

// Every file x927 writes for a plugin, for the targets it declares (or the ones asked for).
export function compilePlugin(plugin, only = null) {
  const ids = Object.keys(plugin.targets).filter((id) => !only || only.includes(id));
  for (const id of ids) {
    if (!TARGETS[id]) throw new SourceError(`${plugin.file}: unknown target "${id}" (known: ${Object.keys(TARGETS).join(", ")})`);
  }
  const files = ids.map((id) => compileManifest(plugin, id));
  if (plugin.mcp && ids.some((id) => TARGETS[id].mcp)) files.push(compileMcp(plugin));
  return files;
}
