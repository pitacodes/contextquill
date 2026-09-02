#!/usr/bin/env node
import readline from "node:readline";
import { createStore, ContextQuillError } from "../lib/core.mjs";
import { connectLinkedInViaHostedOAuth } from "../lib/linkedin-oauth.mjs";

const store = createStore();

const objectSchema = (properties = {}, required = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

const string = (description, extra = {}) => ({ type: "string", description, ...extra });
const strings = (description) => ({ type: "array", items: { type: "string" }, description });
const number = (description) => ({ type: "number", minimum: 0, description });
const boolean = (description) => ({ type: "boolean", description });

const TOOLS = [
  {
    name: "get_dashboard",
    title: "Get ContextQuill dashboard",
    description: "See content-signal, draft, publishing, and analytics status. Use at the start of a ContextQuill session.",
    inputSchema: objectSchema(),
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
  },
  {
    name: "configure_profile",
    title: "Configure content profile",
    description:
      "Set the user's positioning, audience, content pillars, voice rules, disclosure boundaries, LinkedIn member URN, and approved-post auto-publish preference.",
    inputSchema: objectSchema({
      name: string("User's name."),
      role: string("Professional role."),
      industry: string("Industry, for example B2B SaaS."),
      positioning: string("What the user should become known for."),
      audience: string("The people the content should attract."),
      goals: strings("Business outcomes such as inbound leads, credibility, hiring, or partnerships."),
      content_pillars: strings("Recurring subject areas."),
      voice_principles: strings("Writing qualities and anti-patterns."),
      forbidden_topics: strings("Topics that must never be published."),
      forbidden_entities: strings("Names or entities that must never appear without renewed approval."),
      default_language: string("Default content language."),
      timezone: string("IANA timezone."),
      linkedin_member_urn: string("LinkedIn person URN or member ID. Never pass an access token here."),
      linkedin_version: string("LinkedIn API version in YYYYMM format."),
      auto_publish_enabled: boolean("If true, already approved and scheduled posts publish when due while ContextQuill is running."),
    }),
    annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
  },
  {
    name: "get_profile",
    title: "Get content profile",
    description: "Read the user's positioning, audience, content pillars, voice, and safety boundaries before drafting.",
    inputSchema: objectSchema(),
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
  },
  {
    name: "capture_signal",
    title: "Capture a work-to-content signal",
    description:
      "Save a structured, minimal summary of a valuable insight found in real work. Never upload an entire confidential conversation when a short evidence-backed abstraction is enough.",
    inputSchema: objectSchema(
      {
        title: string("Short internal title."),
        insight: string("The actual insight, decision, lesson, or pattern."),
        source_type: string("Source such as codex_work, customer_call, analysis, news, or project_retro."),
        source_summary: string("Minimal provenance summary without unnecessary confidential detail."),
        evidence: strings("Facts that support the insight."),
        topics: strings("Topic labels."),
        suggested_content_types: strings("Possible forms such as customer_case, playbook, opinion, news_commentary."),
        suggested_angle: string("Why this is worth sharing."),
        links: strings("Useful public source URLs."),
        confidentiality: string("public, internal, client_confidential, or unknown.", {
          enum: ["public", "internal", "client_confidential", "unknown"],
        }),
        client_permission: boolean("Whether named customer use is explicitly authorized."),
        freshness: string("evergreen or time-sensitive description."),
      },
      ["title", "insight", "confidentiality"],
    ),
    annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
  },
  {
    name: "list_signals",
    title: "List content signals",
    description: "Find captured content opportunities by status or topic.",
    inputSchema: objectSchema({
      status: string("Optional status such as CAPTURED or DRAFTED."),
      topic: string("Optional topic search."),
      limit: { type: "integer", minimum: 1, maximum: 200 },
    }),
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
  },
  {
    name: "create_draft",
    title: "Create LinkedIn draft",
    description:
      "Save a complete LinkedIn draft produced from captured evidence and the user's voice. This does not approve or publish it.",
    inputSchema: objectSchema(
      {
        text: string("Exact post text."),
        title: string("Internal draft title."),
        primary_topic: string("Primary topic used for analytics."),
        topics: strings("Additional topic labels."),
        content_type: string("customer_case, insight, playbook, opinion, news_commentary, build_in_public, or another explicit type."),
        format: string("text or image. MVP publishing supports text and one image."),
        hook_style: string("Hook pattern such as direct, contrarian, story, data, or question."),
        target_audience: string("Specific reader."),
        source_signal_ids: strings("Captured signals that ground this post."),
        evidence_refs: strings("Facts or public links used in the draft."),
        links: strings("Links included or cited."),
        attachments: {
          type: "array",
          maxItems: 1,
          description: "Optional single image for MVP publishing.",
          items: objectSchema(
            {
              type: string("Must be image.", { enum: ["image"] }),
              path: string("Absolute local image path."),
              alt_text: string("Accessible alt text, preferably under 120 characters."),
            },
            ["type", "path"],
          ),
        },
        cta: string("Call to action, if any."),
        safety_notes: string("What was anonymized, generalized, or verified for publication."),
        redactions_confirmed: boolean("True only after sensitive-source redaction was checked."),
      },
      ["text", "primary_topic"],
    ),
    annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
  },
  {
    name: "list_drafts",
    title: "List drafts",
    description: "List drafts by DRAFT, IN_REVIEW, APPROVED, SCHEDULED, or PUBLISHED state.",
    inputSchema: objectSchema({
      status: string("Optional draft status."),
      limit: { type: "integer", minimum: 1, maximum: 200 },
    }),
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
  },
  {
    name: "update_draft",
    title: "Update draft and revoke approval",
    description:
      "Edit a draft. Any edit automatically returns it to DRAFT and invalidates all review, approval, and scheduling state.",
    inputSchema: objectSchema(
      {
        draft_id: string("Draft ID."),
        text: string("Updated exact post text."),
        title: string("Updated internal title."),
        primary_topic: string("Updated primary topic."),
        topics: strings("Updated topics."),
        content_type: string("Updated content type."),
        format: string("Updated format."),
        hook_style: string("Updated hook style."),
        target_audience: string("Updated audience."),
        evidence_refs: strings("Updated evidence references."),
        links: strings("Updated links."),
        attachments: { type: "array", maxItems: 1, items: { type: "object" } },
        cta: string("Updated CTA."),
        safety_notes: string("Updated public-safety notes."),
        redactions_confirmed: boolean("Whether redactions were rechecked for this revision."),
      },
      ["draft_id"],
    ),
    annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
  },
  {
    name: "submit_for_human_review",
    title: "Submit exact draft for human review",
    description:
      "Freeze a review preview and generate a one-time review code. The assistant must display the full post and must never enter the approval phrase for the human.",
    inputSchema: objectSchema({ draft_id: string("Draft ID.") }, ["draft_id"]),
    annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
  },
  {
    name: "approve_reviewed_draft",
    title: "Record human approval",
    description:
      "Record approval only after the human reviewer personally types the exact approval phrase shown by submit_for_human_review. Never infer approval from silence, general praise, or a request to continue.",
    inputSchema: objectSchema(
      {
        draft_id: string("Draft ID."),
        approval_statement: string("Exact phrase typed by the human, for example APPROVE CQ-A1B2C3."),
        reviewer_name: string("Human reviewer's name."),
      },
      ["draft_id", "approval_statement"],
    ),
    annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
  },
  {
    name: "schedule_approved_post",
    title: "Schedule approved post",
    description:
      "Schedule an exact human-approved draft. ContextQuill will publish it when due if auto-publish is enabled and the local plugin is running.",
    inputSchema: objectSchema(
      { draft_id: string("Approved draft ID."), publish_at: string("Future ISO 8601 date-time with timezone.") },
      ["draft_id", "publish_at"],
    ),
    annotations: { readOnlyHint: false, openWorldHint: true, destructiveHint: false },
  },
  {
    name: "publish_approved_post",
    title: "Publish approved post to LinkedIn",
    description:
      "Publish the exact hash-locked, human-approved draft to LinkedIn. Refuses unapproved or edited drafts. Use dry_run for a payload preview.",
    inputSchema: objectSchema(
      { draft_id: string("Approved draft ID."), dry_run: boolean("Preview without any network write.") },
      ["draft_id"],
    ),
    annotations: { readOnlyHint: false, openWorldHint: true, destructiveHint: false },
  },
  {
    name: "publish_due_posts",
    title: "Publish due approved posts",
    description: "Publish all due, human-approved scheduled posts when auto-publish is enabled.",
    inputSchema: objectSchema(),
    annotations: { readOnlyHint: false, openWorldHint: true, destructiveHint: false },
  },
  {
    name: "connect_linkedin",
    title: "Connect LinkedIn account",
    description:
      "Open LinkedIn in the user's default browser and connect the account they authorize through ContextQuill's secure hosted OAuth handoff. Stores the token only in the user's secure local credential store and never returns it.",
    inputSchema: objectSchema(),
    annotations: { readOnlyHint: false, openWorldHint: true, destructiveHint: false },
  },
  {
    name: "linkedin_connection_status",
    title: "Check LinkedIn connection",
    description: "Check whether a member URN and access token are available without exposing the token.",
    inputSchema: objectSchema(),
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
  },
  {
    name: "verify_linkedin_connection",
    title: "Verify LinkedIn connection live",
    description:
      "Call LinkedIn's official userinfo endpoint to verify that the stored token belongs to the configured member. Never exposes the token.",
    inputSchema: objectSchema(),
    annotations: { readOnlyHint: true, openWorldHint: true, destructiveHint: false },
  },
  {
    name: "disconnect_linkedin",
    title: "Disconnect LinkedIn account",
    description:
      "Remove the locally stored LinkedIn credential and account binding. This does not revoke the app from LinkedIn's own settings.",
    inputSchema: objectSchema(),
    annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: true },
  },
  {
    name: "record_post_metrics",
    title: "Record LinkedIn post performance",
    description:
      "Add or update post metrics. Use official exports or user-provided analytics; do not scrape LinkedIn. Multiple records can be supplied at once.",
    inputSchema: objectSchema({
      records: {
        type: "array",
        minItems: 1,
        maxItems: 100,
        items: objectSchema(
          {
            post_id: string("ContextQuill post ID or LinkedIn post ID."),
            draft_id: string("Optional draft ID."),
            published_at: string("ISO publish time."),
            primary_topic: string("Primary topic."),
            topics: strings("Topic labels."),
            content_type: string("Content type."),
            format: string("text, image, document, or video."),
            hook_style: string("Hook style."),
            impressions: number("Post impressions."),
            reactions: number("Reactions."),
            comments: number("Comments."),
            reposts: number("Reposts."),
            clicks: number("Link or post clicks if available."),
            follows: number("Followers attributed if available."),
            leads: number("Qualified leads attributed by the user."),
          },
          ["post_id", "impressions"],
        ),
      },
    }, ["records"]),
    annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
  },
  {
    name: "analyze_performance",
    title: "Analyze topics and exposure",
    description:
      "Compare exposure, engagement, and leads by topic, content type, format, hook, and weekday. Uses shrinkage and confidence labels to reduce small-sample overfitting.",
    inputSchema: objectSchema({ since: string("Optional inclusive date filter.") }),
    annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
  },
  {
    name: "export_performance_report",
    title: "Export performance report",
    description: "Create a Markdown performance report in the private ContextQuill data directory.",
    inputSchema: objectSchema({ since: string("Optional inclusive date filter.") }),
    annotations: { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
  },
];

const HANDLERS = {
  get_dashboard: () => store.dashboard(),
  configure_profile: (args) => store.configureProfile(args),
  get_profile: () => store.getProfile(),
  capture_signal: (args) => store.captureSignal(args),
  list_signals: (args) => store.listSignals(args),
  create_draft: (args) => store.createDraft(args),
  list_drafts: (args) => store.listDrafts(args),
  update_draft: (args) => store.updateDraft(args),
  submit_for_human_review: (args) => store.submitForReview(args),
  approve_reviewed_draft: (args) => store.approveDraft(args),
  schedule_approved_post: (args) => store.scheduleDraft(args),
  publish_approved_post: (args) => store.publishApprovedDraft(args),
  publish_due_posts: () => store.publishDuePosts(),
  connect_linkedin: () => connectLinkedInViaHostedOAuth({ store }),
  linkedin_connection_status: () => store.connectionStatus(),
  verify_linkedin_connection: () => store.verifyLinkedInConnection(),
  disconnect_linkedin: () => store.disconnectLinkedIn(),
  record_post_metrics: (args) => store.recordMetrics(args),
  analyze_performance: (args) => store.analyzePerformance(args),
  export_performance_report: (args) => store.exportPerformanceReport(args),
};

function send(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function success(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function failure(id, code, message, data) {
  send({ jsonrpc: "2.0", id, error: { code, message, ...(data ? { data } : {}) } });
}

async function dispatch(request) {
  const { id, method, params = {} } = request;
  if (method === "initialize") {
    success(id, {
      protocolVersion: params.protocolVersion || "2025-06-18",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "contextquill", version: "0.3.0" },
      instructions:
        "ContextQuill turns real work into reviewed LinkedIn content. Never publish or schedule a draft until a human has typed the exact approval phrase produced by submit_for_human_review.",
    });
    return;
  }
  if (method === "ping") {
    success(id, {});
    return;
  }
  if (method === "tools/list") {
    success(id, { tools: TOOLS });
    return;
  }
  if (method === "tools/call") {
    const name = params.name;
    const handler = HANDLERS[name];
    if (!handler) {
      failure(id, -32601, `Unknown tool: ${name}`);
      return;
    }
    try {
      const output = await handler(params.arguments || {});
      success(id, {
        content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
        isError: false,
      });
    } catch (error) {
      const body = {
        error: error.code || "INTERNAL_ERROR",
        message: error.message || String(error),
        ...(error.details ? { details: error.details } : {}),
      };
      success(id, {
        content: [{ type: "text", text: JSON.stringify(body, null, 2) }],
        structuredContent: body,
        isError: true,
      });
    }
    return;
  }
  if (id !== undefined) failure(id, -32601, `Method not found: ${method}`);
}

await store.init();

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", async (line) => {
  if (!line.trim()) return;
  try {
    await dispatch(JSON.parse(line));
  } catch (error) {
    if (error instanceof SyntaxError) failure(null, -32700, "Parse error");
    else failure(null, -32603, error.message || "Internal error");
  }
});

let autoPublishRunning = false;
const timer = setInterval(async () => {
  if (autoPublishRunning) return;
  autoPublishRunning = true;
  try {
    await store.publishDuePosts();
  } catch (error) {
    if (!(error instanceof ContextQuillError)) process.stderr.write(`ContextQuill auto-publish error: ${error.message}\n`);
  } finally {
    autoPublishRunning = false;
  }
}, 60_000);
timer.unref();
