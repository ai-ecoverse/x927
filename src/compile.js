// Pipeline (per target):
//   1. seed   — start from base = { name, description, ...parsed.base }
//   2. map    — rename keys per target.rename
//   3. filter — drop keys not in target.allow
//   4. merge  — overlay parsed.targets[target.id] on top
//   5. output — run target.transforms, serialize
export function compile(parsed, target, ctx = {}) {
  // 1. seed
  let fields = {};
  if (parsed.name) fields.name = parsed.name;
  if (parsed.description) fields.description = parsed.description;
  fields = { ...fields, ...parsed.base };

  // 2. map (rename)
  for (const [from, to] of Object.entries(target.rename || {})) {
    if (from in fields) {
      fields[to] = fields[from];
      delete fields[from];
    }
  }

  // 3. filter (drop unsupported base fields; target-specific overrides bypass)
  if (target.allow) {
    const allowed = new Set(target.allow);
    fields = Object.fromEntries(Object.entries(fields).filter(([k]) => allowed.has(k)));
  }

  // 4. merge (target overrides win)
  const overrides = parsed.targets?.[target.id] ?? {};
  fields = { ...fields, ...overrides };

  // 5. output: coerce list-typed fields (single value -> [value]), run transforms, serialize
  for (const field of target.lists || []) {
    if (field in fields && !Array.isArray(fields[field])) {
      fields[field] = [fields[field]];
    }
  }
  for (const transform of target.transforms || []) {
    fields = transform(fields, ctx);
  }

  return {
    path: target.output.path,
    content: serialize(fields, target.output.format, target.output.pretty),
  };
}

function serialize(obj, format, pretty) {
  if (format === "json") {
    return JSON.stringify(obj, null, pretty ? 2 : 0) + "\n";
  }
  throw new Error(`Unsupported output format: ${format}`);
}
