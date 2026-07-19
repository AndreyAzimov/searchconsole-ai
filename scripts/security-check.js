import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const packageJsonPath = path.join(repositoryRoot, "package.json");
const manifest = JSON.parse(readFileSync(packageJsonPath, "utf8"));

const dependencyFields = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
  "bundledDependencies",
];
for (const field of dependencyFields) {
  const value = manifest[field];
  if (value && (Array.isArray(value) ? value.length : Object.keys(value).length)) {
    throw new Error(`${field} must remain empty.`);
  }
}

for (const lifecycle of ["preinstall", "install", "postinstall"]) {
  if (manifest.scripts?.[lifecycle]) throw new Error(`${lifecycle} scripts are not allowed.`);
}

const binPath = path.join(repositoryRoot, manifest.bin["searchconsole-ai"]);
const binSource = readFileSync(binPath, "utf8");
if (!binSource.startsWith("#!/usr/bin/env node\n")) throw new Error("The CLI executable is missing its Node shebang.");
if ((statSync(binPath).mode & 0o111) === 0) throw new Error("The CLI executable is not executable.");

const pack = spawnSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
  cwd: repositoryRoot,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});
if (pack.error) throw pack.error;
if (pack.status !== 0) throw new Error(`npm pack failed: ${pack.stderr.trim()}`);

const result = JSON.parse(pack.stdout)[0];
const actualFiles = result.files.map((file) => file.path).sort();
const expectedFiles = [
  "LICENSE",
  "README.md",
  "SECURITY.md",
  "bin/searchconsole-ai.js",
  "lib/cli.js",
  "package.json",
].sort();
if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
  throw new Error(`Unexpected package contents: ${actualFiles.join(", ")}`);
}

const forbiddenPatterns = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\/\/registry\.npmjs\.org\/:_authToken\s*=/,
  /\bnpm_[A-Za-z0-9]{20,}\b/,
  /\bghp_[A-Za-z0-9]{20,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  /"client_secret"\s*:/,
];
for (const relativePath of actualFiles) {
  const source = readFileSync(path.join(repositoryRoot, relativePath), "utf8");
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(source)) throw new Error(`Potential secret found in ${relativePath}: ${pattern}`);
  }
}

const cliSource = readFileSync(path.join(repositoryRoot, "lib", "cli.js"), "utf8");
if (!cliSource.includes('export const SERVER_URL = "https://searchconsole.ai/mcp";')) {
  throw new Error("The fixed SearchConsole.ai HTTPS endpoint changed unexpectedly.");
}

console.log(`Security check passed for ${manifest.name}@${manifest.version} (${result.size} bytes).`);
