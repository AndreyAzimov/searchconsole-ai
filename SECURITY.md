# Security Policy

## Reporting a vulnerability

Report suspected vulnerabilities privately through [SearchConsole.ai support](https://searchconsole.ai/support) or email `get_support@searchconsole.ai`. Do not include credentials, access tokens, private Search Console data, or working exploits in a public issue.

We will acknowledge a report as soon as practical, investigate affected versions, and publish remediation guidance when confirmed.

## Security design

The npm installer deliberately has a small attack surface:

- No runtime, development, optional, peer, or bundled dependencies
- No `preinstall`, `install`, or `postinstall` lifecycle scripts
- No arbitrary shell commands; client commands use argument arrays with shell execution disabled
- A fixed HTTPS MCP endpoint: `https://searchconsole.ai/mcp`
- No Google credentials, npm credentials, analytics SDKs, or network-request code
- Cursor configuration changes reject symlinks and special files, use a private temporary directory, write atomically, and preserve a backup
- An explicit npm file allowlist and a pre-publish check that rejects unexpected files and common secret formats

The hosted service uses Google and MCP OAuth. This npm package never receives or stores OAuth credentials.

## Verifying a release

Inspect registry metadata and the exact tarball before running it:

```bash
npm view searchconsole-ai@latest name version maintainers dist.integrity
npm pack searchconsole-ai@latest --dry-run
```

Only the package files documented in the README should be present. The package must remain dependency-free.

## Supported versions

Security fixes are released on the latest npm version. Upgrade with:

```bash
npm update searchconsole-ai
```
