import { unified } from "unified";
import remarkParse from "remark-parse";
import { toString } from "mdast-util-to-string";

// Parse a PLUGIN.md source into:
//   { name, description, base: {…}, targets: { <id>: {…}, … } }
//
// Layout the parser expects:
//   # <plugin-name>
//   <prose paragraph used as description>
//   - key: value
//   - key: value
//   ## <target-id>
//   - key: value          (overrides for that target)
export function parse(md) {
  const tree = unified().use(remarkParse).parse(md);

  let name = null;
  const descriptionParts = [];
  const base = {};
  const targets = {};
  let current = "__base__";
  let h2Seen = false;

  for (const node of tree.children) {
    if (node.type === "heading" && node.depth === 1) {
      name = toString(node).trim();
      continue;
    }
    if (node.type === "heading" && node.depth === 2) {
      current = toString(node).trim().toLowerCase();
      targets[current] ??= {};
      h2Seen = true;
      continue;
    }
    if (node.type === "list") {
      const bucket = current === "__base__" ? base : targets[current];
      for (const item of node.children) {
        const pair = parseListItem(item);
        if (pair) bucket[pair.key] = pair.value;
      }
      continue;
    }
    if (node.type === "paragraph" && current === "__base__" && !h2Seen) {
      descriptionParts.push(toString(node).trim());
    }
  }

  const description = descriptionParts.join(" ").replace(/\s+/g, " ").trim() || null;
  return { name, description, base, targets };
}

function parseListItem(item) {
  // First paragraph child holds "key: value"
  const para = item.children.find((c) => c.type === "paragraph");
  if (!para) return null;
  const text = toString(para);
  const colonIdx = text.indexOf(":");
  if (colonIdx === -1) return null;

  const key = text.slice(0, colonIdx).trim();
  const rawValue = text.slice(colonIdx + 1).trim();

  // Sub-bullet list under this item => array value
  const sublist = item.children.find((c) => c.type === "list");
  if (sublist) {
    return {
      key,
      value: sublist.children.map((li) => coerceScalar(toString(li).trim())),
    };
  }

  // Comma-separated => array
  if (rawValue.includes(",")) {
    return {
      key,
      value: rawValue.split(",").map((s) => s.trim()).filter(Boolean).map(coerceScalar),
    };
  }

  return { key, value: coerceScalar(rawValue) };
}

function coerceScalar(s) {
  if (s === "true") return true;
  if (s === "false") return false;
  if (s === "null") return null;
  if (/^-?\d+$/.test(s)) return Number(s);
  if (/^-?\d+\.\d+$/.test(s)) return Number(s);
  return s;
}
