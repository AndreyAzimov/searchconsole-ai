import { constants as fsConstants } from "node:fs";
import {
  accessSync,
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { spawnSync } from "node:child_process";

export const SERVER_NAME = "searchconsole-ai";
export const SERVER_URL = "https://searchconsole.ai/mcp";
export const CLIENTS = ["codex", "claude", "cursor"];

const MAX_CURSOR_CONFIG_BYTES = 1024 * 1024;

const CLIENT_LABELS = {
  codex: "Codex",
  claude: "Claude Code",
  cursor: "Cursor",
};

export function usage(version = "0.1.0") {
  return `SearchConsole.ai setup CLI v${version}

Usage:
  searchconsole-ai setup
  searchconsole-ai setup <codex|claude|cursor|all> [--dry-run] [--no-login]

Examples:
  npx -y searchconsole-ai@latest setup
  npx -y searchconsole-ai@latest setup codex
  npx -y searchconsole-ai@latest setup claude
  npx -y searchconsole-ai@latest setup cursor

Options:
  --dry-run   Show the configuration changes without applying them
  --no-login  Configure Codex or Claude Code without starting MCP OAuth
  --help      Show this help
  --version   Show the package version

The CLI configures the hosted, read-only MCP endpoint at ${SERVER_URL}.
Google credentials are never stored by this package.`;
}

export function parseArgs(argv) {
  const args = [...argv];
  const options = {
    command: "setup",
    target: undefined,
    dryRun: false,
    login: true,
    help: false,
    version: false,
  };

  if (args[0] === "setup") args.shift();

  for (const arg of args) {
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--no-login") options.login = false;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--version" || arg === "-v") options.version = true;
    else if (!options.target && [...CLIENTS, "all"].includes(arg)) options.target = arg;
    else throw new Error(`Unknown argument: ${arg}\n\n${usage()}`);
  }

  return options;
}

export function findExecutable(command, options = {}) {
  const env = options.env || process.env;
  const platform = options.platform || process.platform;
  const pathValue = env.PATH || "";
  const extensions = platform === "win32"
    ? (env.PATHEXT || ".EXE;.CMD;.BAT;.COM").split(";")
    : [""];

  for (const directory of pathValue.split(path.delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = path.resolve(directory, `${command}${extension}`);
      try {
        accessSync(candidate, fsConstants.X_OK);
        if (statSync(candidate).isFile()) return candidate;
      } catch {
        // Continue searching PATH.
      }
    }
  }

  return undefined;
}

export function cursorConfigPath(homeDirectory = os.homedir()) {
  return path.join(homeDirectory, ".cursor", "mcp.json");
}

export function mergeCursorConfig(source = "") {
  let config = {};

  if (source.trim()) {
    try {
      config = JSON.parse(source);
    } catch (error) {
      throw new Error(`Cursor's mcp.json is not valid JSON: ${error.message}`);
    }
  }

  if (!config || Array.isArray(config) || typeof config !== "object") {
    throw new Error("Cursor's mcp.json must contain a JSON object.");
  }

  if (config.mcpServers === undefined) config.mcpServers = {};
  if (!config.mcpServers || Array.isArray(config.mcpServers) || typeof config.mcpServers !== "object") {
    throw new Error("Cursor's mcpServers value must be a JSON object.");
  }

  const existing = config.mcpServers[SERVER_NAME];
  if (existing) {
    if (existing.url === SERVER_URL) {
      return { changed: false, config };
    }

    throw new Error(
      `Cursor already has an MCP server named ${SERVER_NAME} with a different URL. ` +
      "Review ~/.cursor/mcp.json before replacing it.",
    );
  }

  config.mcpServers[SERVER_NAME] = {
    type: "http",
    url: SERVER_URL,
  };

  return { changed: true, config };
}

export function clientCommandPlan(client, { login = true } = {}) {
  if (client === "codex") {
    const plan = [
      ["codex", ["mcp", "add", SERVER_NAME, "--url", SERVER_URL]],
    ];
    if (login) plan.push(["codex", ["mcp", "login", SERVER_NAME]]);
    return plan;
  }

  if (client === "claude") {
    const plan = [
      ["claude", ["mcp", "add", "--transport", "http", SERVER_NAME, "--scope", "user", SERVER_URL]],
    ];
    if (login) plan.push(["claude", ["mcp", "login", SERVER_NAME]]);
    return plan;
  }

  if (client === "cursor") return [];
  throw new Error(`Unsupported client: ${client}`);
}

function renderCommand(command, args) {
  return [command, ...args].join(" ");
}

function combinedOutput(result) {
  return `${result.stdout || ""}\n${result.stderr || ""}`.trim();
}

function inspectConfiguredServer(client, executable, runner) {
  const result = runner(executable, ["mcp", "get", SERVER_NAME], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status !== 0) return "missing";
  return combinedOutput(result).includes(SERVER_URL) ? "current" : "different";
}

function runClientCommand(executable, args, runner) {
  const result = runner(executable, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${path.basename(executable)} ${args.join(" ")} exited with status ${result.status}.`);
  }
}

export function setupCommandClient(client, options = {}) {
  const runner = options.runner || spawnSync;
  const output = options.output || console;
  const plan = clientCommandPlan(client, { login: options.login !== false });

  if (options.dryRun) {
    for (const [command, args] of plan) output.log(`[dry run] ${renderCommand(command, args)}`);
    return { changed: false, dryRun: true };
  }

  const executable = (options.findExecutable || findExecutable)(client);
  if (!executable) {
    throw new Error(
      `${CLIENT_LABELS[client]} is not available on PATH. Install it first, or add ${SERVER_URL} ` +
      "as a remote Streamable HTTP MCP server in the app settings.",
    );
  }

  const configured = inspectConfiguredServer(client, executable, runner);
  if (configured === "different") {
    throw new Error(
      `${CLIENT_LABELS[client]} already has an MCP server named ${SERVER_NAME} with a different configuration. ` +
      `Run \`${client} mcp get ${SERVER_NAME}\` and review it before replacing it.`,
    );
  }

  if (configured === "missing") {
    const [, addArgs] = plan[0];
    output.log(`Adding SearchConsole.ai to ${CLIENT_LABELS[client]}...`);
    runClientCommand(executable, addArgs, runner);
  } else {
    output.log(`SearchConsole.ai is already configured in ${CLIENT_LABELS[client]}.`);
  }

  if (options.login !== false) {
    const [, loginArgs] = plan[plan.length - 1];
    output.log(`Starting ${CLIENT_LABELS[client]} OAuth...`);
    runClientCommand(executable, loginArgs, runner);
  }

  return { changed: configured === "missing", dryRun: false };
}

export function setupCursor(options = {}) {
  const output = options.output || console;
  const configPath = options.configPath || cursorConfigPath(options.homeDirectory);
  let source = "";
  let existingMode;

  if (existsSync(configPath)) {
    const linkMetadata = lstatSync(configPath);
    if (!linkMetadata.isFile() || linkMetadata.isSymbolicLink()) {
      throw new Error(
        `Cursor's mcp.json must be a regular file, not a symlink or special file: ${configPath}`,
      );
    }
    if (linkMetadata.size > MAX_CURSOR_CONFIG_BYTES) {
      throw new Error(`Cursor's mcp.json is unexpectedly large (maximum 1 MiB): ${configPath}`);
    }

    existingMode = linkMetadata.mode & 0o777;
    source = readFileSync(configPath, "utf8");
  }
  const { changed, config } = mergeCursorConfig(source);

  if (!changed) {
    output.log(`SearchConsole.ai is already configured in Cursor (${configPath}).`);
    return { changed: false, configPath };
  }

  if (options.dryRun) {
    output.log(`[dry run] Write ${configPath}:`);
    output.log(JSON.stringify(config, null, 2));
    return { changed: false, configPath, dryRun: true };
  }

  const configDirectory = path.dirname(configPath);
  mkdirSync(configDirectory, { recursive: true, mode: 0o700 });

  let backupPath;
  const mode = existingMode || 0o600;
  if (existsSync(configPath)) {
    backupPath = `${configPath}.backup-${Date.now()}`;
    copyFileSync(configPath, backupPath, fsConstants.COPYFILE_EXCL);
    chmodSync(backupPath, mode);
  }

  const temporaryDirectory = mkdtempSync(path.join(configDirectory, ".searchconsole-ai-"));
  chmodSync(temporaryDirectory, 0o700);
  const temporaryPath = path.join(temporaryDirectory, "mcp.json");
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, {
      flag: "wx",
      mode,
    });
    renameSync(temporaryPath, configPath);
  } finally {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
    if (existsSync(temporaryDirectory)) rmdirSync(temporaryDirectory);
  }

  output.log(`Added SearchConsole.ai to Cursor (${configPath}).`);
  if (backupPath) output.log(`Previous configuration backed up to ${backupPath}.`);
  output.log("Open Cursor → Settings → Tools & MCP, enable SearchConsole.ai, and complete OAuth.");
  return { changed: true, configPath, backupPath };
}

function detectClients() {
  const detected = [];
  if (findExecutable("codex")) detected.push("codex");
  if (findExecutable("claude")) detected.push("claude");

  const cursorLocations = [
    findExecutable("cursor"),
    process.platform === "darwin" ? "/Applications/Cursor.app" : undefined,
    process.platform === "darwin" ? path.join(os.homedir(), "Applications", "Cursor.app") : undefined,
    cursorConfigPath(),
  ].filter(Boolean);
  if (cursorLocations.some((location) => existsSync(location))) detected.push("cursor");

  return detected;
}

async function chooseTarget(detected) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(`Choose a client: setup codex, setup claude, setup cursor, or setup all.\n\n${usage()}`);
  }

  console.log("\nChoose where to set up SearchConsole.ai:\n");
  CLIENTS.forEach((client, index) => {
    const marker = detected.includes(client) ? "detected" : "not detected";
    console.log(`  ${index + 1}. ${CLIENT_LABELS[client]} (${marker})`);
  });
  if (detected.length > 1) console.log("  a. All detected clients");

  const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await prompt.question("\nSelection: ")).trim().toLowerCase();
    if (answer === "a" && detected.length > 1) return "all";
    const index = Number.parseInt(answer, 10) - 1;
    if (CLIENTS[index]) return CLIENTS[index];
    throw new Error("Invalid selection.");
  } finally {
    prompt.close();
  }
}

export async function run(argv, options = {}) {
  const packageVersion = options.version || "0.1.0";
  const parsed = parseArgs(argv);

  if (parsed.help) {
    console.log(usage(packageVersion));
    return;
  }
  if (parsed.version) {
    console.log(packageVersion);
    return;
  }

  const detected = detectClients();
  const target = parsed.target || await chooseTarget(detected);
  const targets = target === "all" ? detected : [target];
  if (targets.length === 0) {
    throw new Error(`No supported clients were detected.\n\n${usage(packageVersion)}`);
  }

  for (const client of targets) {
    if (client === "cursor") setupCursor(parsed);
    else setupCommandClient(client, parsed);
  }

  if (!parsed.dryRun) {
    console.log("\nSearchConsole.ai is ready. Try: List my Google Search Console properties.");
  }
}
