import fs from "node:fs";
import path from "node:path";
import { isPluginRoot } from "./source.js";
import { TARGETS } from "./targets/index.js";

const SKIP = new Set(["node_modules", ".git"]);

function walk(dir, match, found) {
  if (match(dir)) {
    found.push(dir);
    return;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && !SKIP.has(entry.name)) walk(path.join(dir, entry.name), match, found);
  }
}

// Directories under root that hold an Agent Plugins manifest. A plugin is not searched for more plugins.
export function findPlugins(root) {
  const found = [];
  walk(root, isPluginRoot, found);
  return found.sort();
}

// Directories under root that hold a vendor manifest, for init.
export function findVendorPlugins(root) {
  const found = [];
  walk(root, (dir) => Object.values(TARGETS).some((target) => fs.existsSync(path.join(dir, target.path))), found);
  return found.sort();
}
