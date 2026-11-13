import fs from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";

export const NAMESPACE = "io.github.ai-ecoverse.x927";
export const SCHEMA_PREFIX = "https://agent-plugins.org/schemas/";
export const SPEC_VERSIONS = ["1.0.0", "1.1.0"];
export const DEFAULT_SPEC = "1.0.0";
export const PORTABLE = ["name", "displayName", "version", "description", "author", "homepage", "repository", "license", "keywords"];

const validators = new Map();

function validator(kind, version) {
  const key = `${kind}-${version}`;
  if (!validators.has(key)) {
    const file = new URL(`./schemas/${key}.schema.json`, import.meta.url);
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    validators.set(key, ajv.compile(JSON.parse(fs.readFileSync(file, "utf8"))));
  }
  return validators.get(key);
}

export class SourceError extends Error {}

function readJson(file) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    throw new SourceError(`${file}: not found`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new SourceError(`${file}: not valid JSON (${error.message})`);
  }
}

// The Agent Plugins version a document declares, from its $schema.
export function specVersion(doc, kind) {
  const id = doc && typeof doc === "object" ? doc.$schema : undefined;
  const match = typeof id === "string" && id.match(/^https:\/\/agent-plugins\.org\/schemas\/(\d+\.\d+\.\d+)\/(plugin|mcp)\.schema\.json$/);
  if (!match || match[2] !== kind) return null;
  return match[1];
}

function check(doc, kind, file) {
  const version = specVersion(doc, kind);
  if (!version) {
    throw new SourceError(`${file}: "$schema" must be ${SCHEMA_PREFIX}<version>/${kind}.schema.json`);
  }
  if (!SPEC_VERSIONS.includes(version)) {
    throw new SourceError(`${file}: Agent Plugins ${version} is not supported (supported: ${SPEC_VERSIONS.join(", ")})`);
  }
  const validate = validator(kind, version);
  if (!validate(doc)) {
    const problems = validate.errors.map((e) => `  ${e.instancePath || "/"} ${e.message}${e.params?.additionalProperty ? ` (${e.params.additionalProperty})` : ""}`);
    throw new SourceError(`${file}: does not match the Agent Plugins ${version} ${kind} schema\n${[...new Set(problems)].join("\n")}`);
  }
  return version;
}

// Whether a directory holds an Agent Plugins manifest (a root plugin.json that declares the schema).
export function isPluginRoot(dir) {
  const file = path.join(dir, "plugin.json");
  if (!fs.existsSync(file)) return false;
  try {
    return specVersion(JSON.parse(fs.readFileSync(file, "utf8")), "plugin") !== null;
  } catch {
    return false;
  }
}

// Load and validate a plugin: its root plugin.json, its optional root mcp.json and what
// the x927 extension asks for.
export function loadPlugin(dir) {
  const file = path.join(dir, "plugin.json");
  const manifest = readJson(file);
  check(manifest, "plugin", file);

  const mcpFile = path.join(dir, "mcp.json");
  let mcp = null;
  if (fs.existsSync(mcpFile)) {
    mcp = readJson(mcpFile);
    check(mcp, "mcp", mcpFile);
  }

  const settings = manifest.extensions?.[NAMESPACE] ?? {};
  const targets = settings.targets ?? { claude: {} };
  if (typeof targets !== "object" || Array.isArray(targets)) {
    throw new SourceError(`${file}: extensions["${NAMESPACE}"].targets must be an object keyed by target`);
  }
  for (const [id, overrides] of Object.entries(targets)) {
    if (overrides === null || typeof overrides !== "object" || Array.isArray(overrides)) {
      throw new SourceError(`${file}: extensions["${NAMESPACE}"].targets.${id} must be an object`);
    }
  }
  const marketplace = settings.marketplace ?? {};
  if (marketplace !== false && (typeof marketplace !== "object" || Array.isArray(marketplace))) {
    throw new SourceError(`${file}: extensions["${NAMESPACE}"].marketplace must be an object or false`);
  }
  return { dir, file, manifest, mcp, targets, marketplace };
}
