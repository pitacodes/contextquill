# Install ContextQuill

ContextQuill needs Node.js 20 or later and a work agent that supports plugins or local MCP servers.

## Option 1: Codex and ChatGPT Work

Add the GitHub marketplace and install ContextQuill:

```bash
codex plugin marketplace add pitacodes/contextquill
codex plugin add contextquill@contextquill
```

Start a new task after installation so the plugin's skill and MCP tools are loaded. In Codex CLI, `/plugins` opens the plugin browser.

To update later:

```bash
codex plugin marketplace update contextquill
codex plugin add contextquill@contextquill
```

## Option 2: Claude Code or Claude Cowork

In Claude Code:

```text
/plugin marketplace add pitacodes/contextquill
/plugin install contextquill@contextquill
```

Run `/reload-plugins` or start a new session if requested.

In Claude Desktop or Cowork, open **Customize → Plugins**, add the GitHub repository as a marketplace, and install ContextQuill. You may also download `contextquill-plugin.zip` from the latest release and upload it as a custom plugin. Local MCP-backed tools need a desktop/local session. Cloud-only Cowork sessions need a separate remote MCP deployment.

## Option 3: Direct download

Open the [latest release](https://github.com/pitacodes/contextquill/releases/latest) and choose one of these assets:

- `contextquill-plugin.zip`: a portable plugin folder for clients that accept custom plugin ZIPs or manual MCP setup.
- `contextquill-codex-marketplace.zip`: a self-contained local Codex marketplace.

For the Codex marketplace archive:

1. Extract the ZIP.
2. Find the extracted `contextquill-marketplace` folder.
3. Run:

   ```bash
   codex plugin marketplace add /absolute/path/to/contextquill-marketplace
   codex plugin add contextquill@contextquill-local
   ```

4. Start a new task.

## Option 4: Any local MCP client

Clone or extract the repository, then configure a stdio MCP server:

```json
{
  "mcpServers": {
    "contextquill": {
      "command": "node",
      "args": ["/absolute/path/to/contextquill/mcp/server.mjs"]
    }
  }
}
```

Keep the path absolute. Start the client from a fresh session after changing MCP configuration.

## Connect LinkedIn

Once ContextQuill is installed, ask your agent:

```text
Use ContextQuill and connect my LinkedIn account.
```

The official LinkedIn authorization page opens in your browser. The plugin connects only the account you authorize.

### Credential storage by platform

- **macOS:** one-click OAuth stores the token in System Keychain.
- **Linux and Windows:** the current beta requires `LINKEDIN_MEMBER_URN` and `LINKEDIN_ACCESS_TOKEN` in the MCP process environment. Cross-platform native credential-store support is on the roadmap.

Never paste an access token into a chat or commit it to a repository.

## Verify the installation

From the extracted or cloned ContextQuill directory:

```bash
npm test
npm run doctor
```

Or ask the agent:

```text
Use ContextQuill. Show my dashboard and LinkedIn connection status.
```

## Data location

Local profiles, signals, drafts, metrics, and audit history are stored under:

```text
~/Documents/Codex/ContextQuill
```

Set `CONTEXTQUILL_DATA_DIR` for a different location. Back up or delete that directory according to your own data-retention needs.

## Uninstall or disconnect

Ask ContextQuill to disconnect LinkedIn before removing the plugin. You can also revoke ContextQuill from LinkedIn's connected-app settings.

Removing the plugin does not automatically delete the local content directory. Delete it separately only if you intend to remove your drafts, metrics, and audit history.
