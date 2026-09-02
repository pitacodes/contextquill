# Using ContextQuill with work agents

ContextQuill works best when it lives inside the same agent where real work happens. The agent can notice a useful decision or pattern at the end of a task, capture only the public-safe essence, and turn it into a draft later.

## The portable parts

The project separates two layers:

1. `skills/contextquill/SKILL.md` teaches the agent how to identify worthwhile signals, protect confidential information, write in the user's voice, and enforce human review.
2. `mcp/server.mjs` exposes the shared content store, approval state machine, LinkedIn connection, publishing, scheduling, and analytics tools.

Any agent that can load both a skill and a local stdio MCP server gets the full workflow. An MCP-only client still gets the tools, but the skill supplies the product's opinionated quality and safety behavior.

## Codex and ChatGPT Work

Install through the repository marketplace:

```bash
codex plugin marketplace add pitacodes/contextquill
codex plugin add contextquill@contextquill
```

Open a new task and say:

```text
Use ContextQuill for this task. Complete the primary work first. Near the end,
capture only genuinely useful, public-safe LinkedIn signals without interrupting me.
```

OpenAI's supported plugin surfaces share installed skills and MCP tools. The plugin still uses each host's normal sandbox, network, and action-approval controls.

## Claude Code

Install the repository marketplace:

```text
/plugin marketplace add pitacodes/contextquill
/plugin install contextquill@contextquill
```

The `.claude-plugin/plugin.json` manifest starts the same local MCP server through `${CLAUDE_PLUGIN_ROOT}` and loads the shared ContextQuill skill.

Suggested invocation:

```text
/contextquill:contextquill

Review the work we just finished. Capture at most three strong LinkedIn signals,
then draft only the strongest one for my review.
```

## Claude Cowork

On desktop/local Cowork sessions, add the GitHub marketplace under **Customize → Plugins**, or upload `contextquill-plugin.zip` as a custom plugin. The local MCP server runs on the user's computer.

Cloud-only Cowork sessions cannot reach this local stdio server. A future remote ContextQuill MCP deployment will be required for that mode. Do not point cloud Cowork at the OAuth handoff service: it is intentionally not a full hosted MCP server or persistent content store.

## Other MCP clients

Use an absolute path to the server:

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

If the client supports reusable instructions, add `skills/contextquill/SKILL.md` as the workflow instruction. Do not remove its approval or confidentiality rules.

## Recommended operating modes

### Passive capture during normal work

Use this at the start of a substantive task:

```text
Use ContextQuill passively. Finish my actual task first. If the work produces a
specific, evidence-backed insight that would help my audience, capture a minimal
public-safe signal. Do not draft or interrupt me for weak ideas.
```

### Weekly editorial batch

```text
Use ContextQuill. Review my uncultivated signals and recent performance data.
Choose the five strongest opportunities, explain the portfolio mix briefly,
and prepare three complete posts for human review. Keep at least 25% exploratory.
```

### Review and schedule

```text
Use ContextQuill. Show each complete post, links, attachment summary, audience,
safety notes, and planned time. Submit them for review one at a time. Never enter
an approval phrase for me and never schedule a changed draft without a new review.
```

### Performance loop

```text
Use ContextQuill. Analyze my post metrics by topic, format, hook, and weekday.
Separate exposure from qualified conversations, show sample sizes and confidence,
then propose what to repeat, stop, and keep testing next week.
```

## What the agent must never do

- Invent evidence, results, customer stories, quotations, or first-person experiences.
- Upload an entire confidential conversation when a minimal abstraction is enough.
- Name a customer or expose commercial details without public evidence or recorded permission.
- Approve a draft on behalf of the user.
- Treat “looks good,” silence, or a general automation request as draft approval.
- Scrape LinkedIn or reuse browser cookies.
