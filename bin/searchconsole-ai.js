#!/usr/bin/env node

import { readFileSync } from "node:fs";

import { run } from "../lib/cli.js";

const packageVersion = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
).version;

run(process.argv.slice(2), { version: packageVersion }).catch((error) => {
  console.error(`\nSearchConsole.ai setup failed: ${error.message}`);
  process.exitCode = 1;
});
