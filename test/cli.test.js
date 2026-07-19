import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  SERVER_NAME,
  SERVER_URL,
  clientCommandPlan,
  mergeCursorConfig,
  parseArgs,
  setupCommandClient,
  setupCursor,
} from "../lib/cli.js";

test("parses a targeted dry-run setup", () => {
  assert.deepEqual(parseArgs(["setup", "codex", "--dry-run", "--no-login"]), {
    command: "setup",
    target: "codex",
    dryRun: true,
    login: false,
    help: false,
    version: false,
  });
});

test("builds supported client commands without a shell", () => {
  assert.deepEqual(clientCommandPlan("codex"), [
    ["codex", ["mcp", "add", SERVER_NAME, "--url", SERVER_URL]],
    ["codex", ["mcp", "login", SERVER_NAME]],
  ]);
  assert.deepEqual(clientCommandPlan("claude"), [
    ["claude", ["mcp", "add", "--transport", "http", SERVER_NAME, "--scope", "user", SERVER_URL]],
    ["claude", ["mcp", "login", SERVER_NAME]],
  ]);
});

test("previews a command client without requiring it on PATH", () => {
  const messages = [];
  const result = setupCommandClient("codex", {
    dryRun: true,
    findExecutable: () => undefined,
    output: { log: (message) => messages.push(message) },
  });

  assert.equal(result.dryRun, true);
  assert.deepEqual(messages, [
    `[dry run] codex mcp add ${SERVER_NAME} --url ${SERVER_URL}`,
    `[dry run] codex mcp login ${SERVER_NAME}`,
  ]);
});

test("merges Cursor configuration without dropping existing servers", () => {
  const source = JSON.stringify({
    otherSetting: true,
    mcpServers: { existing: { command: "example" } },
  });
  const result = mergeCursorConfig(source);

  assert.equal(result.changed, true);
  assert.deepEqual(result.config.mcpServers.existing, { command: "example" });
  assert.deepEqual(result.config.mcpServers[SERVER_NAME], {
    type: "http",
    url: SERVER_URL,
  });
  assert.equal(result.config.otherSetting, true);
});

test("treats an existing matching Cursor server as configured", () => {
  const source = JSON.stringify({
    mcpServers: { [SERVER_NAME]: { type: "http", url: SERVER_URL } },
  });
  assert.equal(mergeCursorConfig(source).changed, false);
});

test("refuses to overwrite a conflicting Cursor server", () => {
  const source = JSON.stringify({
    mcpServers: { [SERVER_NAME]: { url: "https://example.com/mcp" } },
  });
  assert.throws(() => mergeCursorConfig(source), /different URL/);
});

test("writes Cursor config atomically and backs up an existing file", () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "searchconsole-ai-test-"));
  const configPath = path.join(directory, ".cursor", "mcp.json");
  const original = JSON.stringify({ mcpServers: { existing: { command: "example" } } });
  mkdirSync(path.dirname(configPath), { recursive: true });
  writeFileSync(configPath, original);

  const messages = [];
  const result = setupCursor({
    configPath,
    output: { log: (message) => messages.push(message) },
  });

  const written = JSON.parse(readFileSync(configPath, "utf8"));
  assert.equal(result.changed, true);
  assert.equal(readFileSync(result.backupPath, "utf8"), original);
  assert.equal(written.mcpServers[SERVER_NAME].url, SERVER_URL);
  assert.match(messages.join("\n"), /complete OAuth/);
});

test("does not add a command client twice but still starts OAuth", () => {
  const calls = [];
  const runner = (_command, args) => {
    calls.push(args);
    if (args[1] === "get") return { status: 0, stdout: `url: ${SERVER_URL}`, stderr: "" };
    return { status: 0, stdout: "", stderr: "" };
  };

  const result = setupCommandClient("codex", {
    runner,
    findExecutable: () => "/usr/local/bin/codex",
    output: { log: () => {} },
  });

  assert.equal(result.changed, false);
  assert.deepEqual(calls, [
    ["mcp", "get", SERVER_NAME],
    ["mcp", "login", SERVER_NAME],
  ]);
});

test("adds and authenticates a missing command client", () => {
  const calls = [];
  const runner = (_command, args) => {
    calls.push(args);
    if (args[1] === "get") return { status: 1, stdout: "", stderr: "not found" };
    return { status: 0, stdout: "", stderr: "" };
  };

  const result = setupCommandClient("claude", {
    runner,
    findExecutable: () => "/usr/local/bin/claude",
    output: { log: () => {} },
  });

  assert.equal(result.changed, true);
  assert.deepEqual(calls, [
    ["mcp", "get", SERVER_NAME],
    ["mcp", "add", "--transport", "http", SERVER_NAME, "--scope", "user", SERVER_URL],
    ["mcp", "login", SERVER_NAME],
  ]);
});
