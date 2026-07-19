# SearchConsole.ai

Set up the hosted, read-only Google Search Console MCP server in Codex, Claude Code, or Cursor.

```bash
npx -y searchconsole-ai@latest setup
```

Or choose a client directly:

```bash
npx -y searchconsole-ai@latest setup codex
npx -y searchconsole-ai@latest setup claude
npx -y searchconsole-ai@latest setup cursor
```

## Why SearchConsole.ai?

- No Google Cloud project or downloaded OAuth credentials
- Hosted Streamable HTTP MCP endpoint
- Google OAuth with read-only Search Console access
- Search analytics, period comparisons, URL inspection, indexing diagnostics, and sitemaps
- Works with Codex, Claude Code, Cursor, ChatGPT, and other OAuth-capable MCP clients

## What the setup command does

For Codex and Claude Code, the CLI invokes the client's supported `mcp add` command and starts its MCP OAuth flow. For Cursor, it safely adds this entry to `~/.cursor/mcp.json`, preserving existing configuration and creating a backup before changing an existing file:

```json
{
  "mcpServers": {
    "searchconsole-ai": {
      "type": "http",
      "url": "https://searchconsole.ai/mcp"
    }
  }
}
```

Preview changes without applying them:

```bash
npx -y searchconsole-ai@latest setup cursor --dry-run
```

Configure a command-line client without opening OAuth immediately:

```bash
npx -y searchconsole-ai@latest setup codex --no-login
```

This package does not contain or run a local Search Console server. It never asks for, receives, or stores Google credentials. Authentication is handled by the MCP client and the hosted SearchConsole.ai OAuth service.

## Manual configuration

Add a remote Streamable HTTP MCP server named `searchconsole-ai` with this URL:

```text
https://searchconsole.ai/mcp
```

Full instructions: [searchconsole.ai](https://searchconsole.ai/?ref=npm)

## Privacy and support

- [Privacy policy](https://searchconsole.ai/privacy)
- [Terms](https://searchconsole.ai/terms)
- [Support](https://searchconsole.ai/support)

## License

MIT
