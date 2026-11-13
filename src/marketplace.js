import fs from "node:fs";
import path from "node:path";
import { serialize } from "./compile.js";
import { SourceError } from "./source.js";

// Catalogs that list plugins as { name, source, description, version, ... } entries.
export const CATALOGS = [
  ".claude-plugin/marketplace.json",
  ".cursor-plugin/marketplace.json",
  ".github/plugin/marketplace.json",
  ".grok-plugin/marketplace.json",
];

const ALWAYS = ["description", "version"];
const IF_PRESENT = ["author", "homepage", "repository", "license", "keywords"];

function sourceDir(root, catalog, entry) {
  if (typeof entry.source !== "string") return null;
  const candidates = [path.resolve(root, entry.source)];
  const pluginRoot = catalog.metadata?.pluginRoot;
  if (typeof pluginRoot === "string") candidates.push(path.resolve(root, pluginRoot, entry.source));
  return candidates.find((dir) => fs.existsSync(dir) && fs.statSync(dir).isDirectory()) ?? null;
}

// The catalogs under root, with the entries of the given plugins brought in line with
// their plugin.json. Entries for other plugins, and every other key, stay as they are.
export function compileCatalogs(root, plugins) {
  const byDir = new Map(plugins.map((plugin) => [path.resolve(plugin.dir), plugin]));
  const files = [];
  const notes = [];
  for (const rel of CATALOGS) {
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) continue;
    let catalog;
    try {
      catalog = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (error) {
      throw new SourceError(`${file}: not valid JSON (${error.message})`);
    }
    if (!Array.isArray(catalog.plugins)) throw new SourceError(`${file}: "plugins" must be an array`);

    const listed = new Set();
    for (const entry of catalog.plugins) {
      const dir = sourceDir(root, catalog, entry);
      const plugin = dir && byDir.get(dir);
      if (!plugin) continue;
      listed.add(dir);
      if (plugin.marketplace === false) continue;
      if (entry.name !== plugin.manifest.name) {
        throw new SourceError(`${file}: entry "${entry.name}" points at ${path.relative(root, dir)}, whose plugin.json names it "${plugin.manifest.name}"`);
      }
      for (const key of ALWAYS) {
        if (plugin.manifest[key] !== undefined) entry[key] = plugin.manifest[key];
      }
      for (const key of IF_PRESENT) {
        if (key in entry && plugin.manifest[key] !== undefined) entry[key] = plugin.manifest[key];
      }
      for (const [key, value] of Object.entries(plugin.marketplace)) {
        if (value === null) delete entry[key];
        else entry[key] = value;
      }
    }
    if (rel === CATALOGS[0]) {
      for (const plugin of plugins) {
        if (plugin.marketplace !== false && "claude" in plugin.targets && !listed.has(path.resolve(plugin.dir))) {
          notes.push(`${path.relative(root, plugin.dir) || "."} is not listed in ${rel}`);
        }
      }
    }
    files.push({ path: rel, content: serialize(catalog) });
  }
  return { files, notes };
}
