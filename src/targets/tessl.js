import fs from "node:fs";
import path from "node:path";

// Tessl expects `skills` as a record `{ <name>: { path: "skills/<dir>/SKILL.md" } }`,
// not a string. If the user wrote `skills: "./skills/"`, scan that directory for
// SKILL.md files and expand to the record form. Users can still override `skills`
// explicitly under `## Tessl` if they want a different shape.
function expandSkillsRecord(fields, { baseDir } = {}) {
  if (typeof fields.skills !== "string" || !baseDir) return fields;

  const skillsRel = fields.skills.replace(/^\.\//, "").replace(/\/$/, "");
  const skillsAbs = path.resolve(baseDir, skillsRel);
  if (!fs.existsSync(skillsAbs) || !fs.statSync(skillsAbs).isDirectory()) {
    return fields;
  }

  const entries = {};
  for (const dirent of fs.readdirSync(skillsAbs, { withFileTypes: true })) {
    if (!dirent.isDirectory()) continue;
    const skillMd = path.join(skillsAbs, dirent.name, "SKILL.md");
    if (fs.existsSync(skillMd)) {
      entries[dirent.name] = { path: `${skillsRel}/${dirent.name}/SKILL.md` };
    }
  }

  return { ...fields, skills: entries };
}

export default {
  id: "tessl",
  // Tessl uses `summary` where the rest use `description`.
  rename: { description: "summary" },
  allow: [
    "name",
    "summary",
    "version",
    "docs",
    "describes",
    "steering",
    "skills",
    "private",
    "entrypoint",
    "softDependencies",
  ],
  lists: ["softDependencies"],
  transforms: [expandSkillsRecord],
  output: {
    path: "tile.json",
    format: "json",
    pretty: true,
  },
};
