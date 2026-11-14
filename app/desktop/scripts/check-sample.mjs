// Type-checks public/sample.json (written by `npm run sample` from src-tauri's own views) against Sample of
// src/api/index.ts, so the hand-written types of src/api/types.ts cannot drift from what src-tauri sends unnoticed.
// The JSON goes into a .ts file as an object literal with `satisfies`, which keeps its strings as literal types (a JSON
// import would widen "valid" to string), tsc checks the whole project, and the file goes again.
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";

const json = readFileSync("public/sample.json", "utf8");
const file = "src/api/sample-check.ts";
writeFileSync(
  file,
  `// Written by scripts/check-sample.mjs and removed after it.\nimport type { Sample } from "@/api";\n\nexport const sample = ${json} satisfies Sample;\n`,
);
try {
  // npx is npx.cmd on Windows, which only a shell runs.
  execFileSync("npx", ["tsc", "--noEmit", "-p", "."], { stdio: "inherit", shell: process.platform === "win32" });
  console.log("public/sample.json khớp kiểu Sample của src/api");
} catch {
  process.exitCode = 1;
} finally {
  rmSync(file);
}
