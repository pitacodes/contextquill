import { appendFile, chmod, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

const FILES = {
  profile: "profile.json",
  signals: "signals.json",
  drafts: "drafts.json",
  posts: "posts.json",
  metrics: "metrics.json",
};

const EMPTY = {
  profile: {},
  signals: [],
  drafts: [],
  posts: [],
  metrics: [],
};

const CONFIDENTIALITY = new Set(["public", "internal", "client_confidential", "unknown"]);
const DRAFT_STATES = new Set(["DRAFT", "IN_REVIEW", "APPROVED", "SCHEDULED", "PUBLISHED"]);
const LINKEDIN_CLIENT_ID = "86z5t5sel4czpt";
const LINKEDIN_TOKEN_SERVICE = "contextquill-linkedin-access-token";

export class ContextQuillError extends Error {
  constructor(message, code = "CONTEXTQUILL_ERROR", details = undefined) {
    super(message);
    this.name = "ContextQuillError";
    this.code = code;
    this.details = details;
  }
}

export function resolveDataDir() {
  if (process.env.CONTEXTQUILL_DATA_DIR) return path.resolve(process.env.CONTEXTQUILL_DATA_DIR);
  return path.join(os.homedir(), "Documents", "Codex", "ContextQuill");
}

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `${prefix}_${stamp}_${randomBytes(3).toString("hex")}`;
}

function cleanString(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  return String(value).trim();
}

function cleanArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => cleanString(item)).filter(Boolean))];
}

function numeric(value, fallback = 0) {
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 ? result : fallback;
}

function assertPresent(value, name) {
  if (!cleanString(value)) throw new ContextQuillError(`${name} is required.`, "VALIDATION_ERROR");
}

function assertDate(value, name) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) {
    throw new ContextQuillError(`${name} must be a valid ISO date-time.`, "VALIDATION_ERROR");
  }
  return date.toISOString();
}

function draftFingerprint(draft) {
  const material = JSON.stringify({
    text: draft.text,
    links: draft.links || [],
    attachments: draft.attachments || [],
  });
  return createHash("sha256").update(material).digest("hex");
}

function publicSafety(confidentiality) {
  if (confidentiality === "public") return "PUBLIC";
  if (confidentiality === "client_confidential") return "BLOCKED_UNTIL_REDACTED_OR_AUTHORIZED";
  return "NEEDS_REDACTION_REVIEW";
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return structuredClone(fallback);
    throw error;
  }
}

async function writeJsonAtomic(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temp, file);
  await chmod(file, 0o600).catch(() => {});
}

function median(values) {
  if (!values.length) return 0;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function mimeFor(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".gif") return "image/gif";
  return "image/jpeg";
}

function normalizeMemberUrn(value) {
  const cleaned = cleanString(value);
  if (!cleaned) return "";
  if (cleaned.startsWith("urn:li:person:")) return cleaned;
  return `urn:li:person:${cleaned}`;
}

function keychainToken(memberUrn) {
  if (process.platform !== "darwin" || !memberUrn) return "";
  try {
    return execFileSync(
      "security",
      ["find-generic-password", "-s", LINKEDIN_TOKEN_SERVICE, "-a", memberUrn, "-w"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
  } catch {
    return "";
  }
}

export class ContextQuillStore {
  constructor(dataDir = resolveDataDir(), options = {}) {
    this.dataDir = path.resolve(dataDir);
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
    this.credentialsProvider = options.credentialsProvider;
  }

  file(name) {
    return path.join(this.dataDir, FILES[name]);
  }

  async init() {
    await mkdir(this.dataDir, { recursive: true });
    await mkdir(path.join(this.dataDir, "reports"), { recursive: true });
    for (const [name, fallback] of Object.entries(EMPTY)) {
      if (!existsSync(this.file(name))) await writeJsonAtomic(this.file(name), fallback);
    }
    return { data_dir: this.dataDir };
  }

  async get(name) {
    if (!(name in FILES)) throw new ContextQuillError(`Unknown store: ${name}`, "STORE_ERROR");
    return readJson(this.file(name), EMPTY[name]);
  }

  async set(name, value) {
    await writeJsonAtomic(this.file(name), value);
  }

  async audit(action, detail = {}) {
    const record = { at: nowIso(), action, ...detail };
    await appendFile(path.join(this.dataDir, "audit.jsonl"), `${JSON.stringify(record)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
  }

  async configureProfile(input = {}) {
    await this.init();
    const current = await this.get("profile");
    const next = {
      ...current,
      name: cleanString(input.name, current.name || ""),
      role: cleanString(input.role, current.role || ""),
      industry: cleanString(input.industry, current.industry || "B2B SaaS"),
      positioning: cleanString(input.positioning, current.positioning || ""),
      audience: cleanString(input.audience, current.audience || ""),
      goals: input.goals ? cleanArray(input.goals) : current.goals || [],
      content_pillars: input.content_pillars ? cleanArray(input.content_pillars) : current.content_pillars || [],
      voice_principles: input.voice_principles ? cleanArray(input.voice_principles) : current.voice_principles || [],
      forbidden_topics: input.forbidden_topics ? cleanArray(input.forbidden_topics) : current.forbidden_topics || [],
      forbidden_entities: input.forbidden_entities ? cleanArray(input.forbidden_entities) : current.forbidden_entities || [],
      default_language: cleanString(input.default_language, current.default_language || "zh-CN"),
      timezone: cleanString(input.timezone, current.timezone || "Asia/Shanghai"),
      linkedin_member_urn: input.linkedin_member_urn
        ? normalizeMemberUrn(input.linkedin_member_urn)
        : current.linkedin_member_urn || "",
      linkedin_member_name: cleanString(input.linkedin_member_name, current.linkedin_member_name || ""),
      linkedin_connected_at: cleanString(input.linkedin_connected_at, current.linkedin_connected_at || ""),
      linkedin_token_expires_at: cleanString(input.linkedin_token_expires_at, current.linkedin_token_expires_at || ""),
      linkedin_version: cleanString(input.linkedin_version, current.linkedin_version || "202606"),
      auto_publish_enabled:
        input.auto_publish_enabled === undefined
          ? Boolean(current.auto_publish_enabled)
          : Boolean(input.auto_publish_enabled),
      updated_at: nowIso(),
    };
    await this.set("profile", next);
    await this.audit("profile.configured", { auto_publish_enabled: next.auto_publish_enabled });
    return next;
  }

  async getProfile() {
    await this.init();
    return this.get("profile");
  }

  async captureSignal(input = {}) {
    await this.init();
    assertPresent(input.title, "title");
    assertPresent(input.insight, "insight");
    const confidentiality = cleanString(input.confidentiality, "unknown").toLowerCase();
    if (!CONFIDENTIALITY.has(confidentiality)) {
      throw new ContextQuillError(
        `confidentiality must be one of: ${[...CONFIDENTIALITY].join(", ")}`,
        "VALIDATION_ERROR",
      );
    }
    const signals = await this.get("signals");
    const signal = {
      id: makeId("sig"),
      title: cleanString(input.title),
      insight: cleanString(input.insight),
      source_type: cleanString(input.source_type, "codex_work"),
      source_summary: cleanString(input.source_summary),
      evidence: cleanArray(input.evidence),
      topics: cleanArray(input.topics),
      suggested_content_types: cleanArray(input.suggested_content_types),
      suggested_angle: cleanString(input.suggested_angle),
      links: cleanArray(input.links),
      confidentiality,
      public_safety: publicSafety(confidentiality),
      client_permission: Boolean(input.client_permission),
      freshness: cleanString(input.freshness, "evergreen"),
      status: "CAPTURED",
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    signals.push(signal);
    await this.set("signals", signals);
    await this.audit("signal.captured", { signal_id: signal.id, public_safety: signal.public_safety });
    return signal;
  }

  async listSignals(input = {}) {
    await this.init();
    const signals = await this.get("signals");
    const status = cleanString(input.status).toUpperCase();
    const topic = cleanString(input.topic).toLowerCase();
    return signals
      .filter((signal) => !status || signal.status === status)
      .filter((signal) => !topic || signal.topics.some((item) => item.toLowerCase().includes(topic)))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, Math.min(numeric(input.limit, 50) || 50, 200));
  }

  async createDraft(input = {}) {
    await this.init();
    assertPresent(input.text, "text");
    assertPresent(input.primary_topic, "primary_topic");
    const sourceIds = cleanArray(input.source_signal_ids);
    const signals = await this.get("signals");
    const missing = sourceIds.filter((id) => !signals.some((signal) => signal.id === id));
    if (missing.length) {
      throw new ContextQuillError(`Unknown source signal IDs: ${missing.join(", ")}`, "VALIDATION_ERROR");
    }
    const drafts = await this.get("drafts");
    const draft = {
      id: makeId("draft"),
      text: cleanString(input.text),
      title: cleanString(input.title),
      primary_topic: cleanString(input.primary_topic),
      topics: cleanArray(input.topics || [input.primary_topic]),
      content_type: cleanString(input.content_type, "insight"),
      format: cleanString(input.format, "text"),
      hook_style: cleanString(input.hook_style, "direct"),
      target_audience: cleanString(input.target_audience),
      source_signal_ids: sourceIds,
      evidence_refs: cleanArray(input.evidence_refs),
      links: cleanArray(input.links),
      attachments: Array.isArray(input.attachments) ? input.attachments : [],
      cta: cleanString(input.cta),
      safety_notes: cleanString(input.safety_notes),
      redactions_confirmed: Boolean(input.redactions_confirmed),
      status: "DRAFT",
      revision: 1,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    drafts.push(draft);
    await this.set("drafts", drafts);
    for (const signal of signals) {
      if (sourceIds.includes(signal.id) && signal.status === "CAPTURED") signal.status = "DRAFTED";
    }
    await this.set("signals", signals);
    await this.audit("draft.created", { draft_id: draft.id, source_signal_ids: sourceIds });
    return draft;
  }

  async getDraft(draftId) {
    await this.init();
    const draft = (await this.get("drafts")).find((item) => item.id === draftId);
    if (!draft) throw new ContextQuillError(`Draft not found: ${draftId}`, "NOT_FOUND");
    return draft;
  }

  async listDrafts(input = {}) {
    await this.init();
    const status = cleanString(input.status).toUpperCase();
    if (status && !DRAFT_STATES.has(status)) {
      throw new ContextQuillError(`Unknown draft status: ${status}`, "VALIDATION_ERROR");
    }
    return (await this.get("drafts"))
      .filter((draft) => !status || draft.status === status)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, Math.min(numeric(input.limit, 50) || 50, 200));
  }

  async updateDraft(input = {}) {
    await this.init();
    assertPresent(input.draft_id, "draft_id");
    const drafts = await this.get("drafts");
    const index = drafts.findIndex((draft) => draft.id === input.draft_id);
    if (index < 0) throw new ContextQuillError(`Draft not found: ${input.draft_id}`, "NOT_FOUND");
    const current = drafts[index];
    if (current.status === "PUBLISHED") {
      throw new ContextQuillError("Published posts cannot be edited in ContextQuill.", "IMMUTABLE");
    }
    const editable = [
      "text",
      "title",
      "primary_topic",
      "content_type",
      "format",
      "hook_style",
      "target_audience",
      "cta",
      "safety_notes",
    ];
    const next = { ...current };
    for (const key of editable) {
      if (input[key] !== undefined) next[key] = cleanString(input[key]);
    }
    for (const key of ["topics", "evidence_refs", "links"]) {
      if (input[key] !== undefined) next[key] = cleanArray(input[key]);
    }
    if (input.attachments !== undefined) next.attachments = Array.isArray(input.attachments) ? input.attachments : [];
    if (input.redactions_confirmed !== undefined) next.redactions_confirmed = Boolean(input.redactions_confirmed);
    next.status = "DRAFT";
    next.revision = numeric(current.revision, 1) + 1;
    next.updated_at = nowIso();
    delete next.review_code;
    delete next.review_hash;
    delete next.review_submitted_at;
    delete next.approved_hash;
    delete next.approved_at;
    delete next.approved_by;
    delete next.scheduled_at;
    drafts[index] = next;
    await this.set("drafts", drafts);
    await this.audit("draft.updated_and_approval_invalidated", { draft_id: next.id, revision: next.revision });
    return next;
  }

  async submitForReview(input = {}) {
    await this.init();
    assertPresent(input.draft_id, "draft_id");
    const drafts = await this.get("drafts");
    const index = drafts.findIndex((draft) => draft.id === input.draft_id);
    if (index < 0) throw new ContextQuillError(`Draft not found: ${input.draft_id}`, "NOT_FOUND");
    const draft = drafts[index];
    if (draft.status === "PUBLISHED") throw new ContextQuillError("This draft is already published.", "IMMUTABLE");
    if (/\[(?:TODO|CUSTOMER NAME|ADD DETAILS)|<(?:TODO|INSERT)/i.test(draft.text)) {
      throw new ContextQuillError("Draft still contains placeholders. Resolve them before review.", "QUALITY_GATE");
    }
    const signals = await this.get("signals");
    const sourceSignals = signals.filter((signal) => draft.source_signal_ids.includes(signal.id));
    const sensitive = sourceSignals.filter((signal) => signal.public_safety !== "PUBLIC");
    if (sensitive.length && (!draft.redactions_confirmed || !draft.safety_notes)) {
      throw new ContextQuillError(
        "Sensitive or internal source material is present. Confirm redactions and add safety notes before review.",
        "DISCLOSURE_GATE",
        { sensitive_signal_ids: sensitive.map((signal) => signal.id) },
      );
    }
    const reviewCode = `CQ-${randomBytes(3).toString("hex").toUpperCase()}`;
    draft.status = "IN_REVIEW";
    draft.review_code = reviewCode;
    draft.review_hash = draftFingerprint(draft);
    draft.review_submitted_at = nowIso();
    draft.updated_at = nowIso();
    drafts[index] = draft;
    await this.set("drafts", drafts);
    await this.audit("draft.review_submitted", { draft_id: draft.id, revision: draft.revision });
    return {
      draft,
      review_code: reviewCode,
      required_human_reply: `APPROVE ${reviewCode}`,
      warning: "The assistant must not enter this approval phrase for the user. The human reviewer must type it.",
    };
  }

  async approveDraft(input = {}) {
    await this.init();
    assertPresent(input.draft_id, "draft_id");
    assertPresent(input.approval_statement, "approval_statement");
    const drafts = await this.get("drafts");
    const index = drafts.findIndex((draft) => draft.id === input.draft_id);
    if (index < 0) throw new ContextQuillError(`Draft not found: ${input.draft_id}`, "NOT_FOUND");
    const draft = drafts[index];
    if (draft.status !== "IN_REVIEW") {
      throw new ContextQuillError("Draft must be in human review before approval.", "APPROVAL_GATE");
    }
    const accepted = new Set([`APPROVE ${draft.review_code}`]);
    if (!accepted.has(cleanString(input.approval_statement))) {
      throw new ContextQuillError(
        `Approval phrase must exactly match “APPROVE ${draft.review_code}”.`,
        "APPROVAL_GATE",
      );
    }
    const currentHash = draftFingerprint(draft);
    if (currentHash !== draft.review_hash) {
      throw new ContextQuillError("Draft changed after review started. Submit it for review again.", "VERSION_MISMATCH");
    }
    draft.status = "APPROVED";
    draft.approved_hash = currentHash;
    draft.approved_at = nowIso();
    draft.approved_by = cleanString(input.reviewer_name, "Human reviewer");
    draft.updated_at = nowIso();
    drafts[index] = draft;
    await this.set("drafts", drafts);
    await this.audit("draft.human_approved", { draft_id: draft.id, reviewer: draft.approved_by });
    return {
      draft_id: draft.id,
      status: draft.status,
      approved_at: draft.approved_at,
      approved_by: draft.approved_by,
      content_hash: draft.approved_hash,
      message: "Exact reviewed version is locked. Any edit will revoke this approval.",
    };
  }

  async scheduleDraft(input = {}) {
    await this.init();
    assertPresent(input.draft_id, "draft_id");
    const publishAt = assertDate(input.publish_at, "publish_at");
    if (new Date(publishAt).getTime() <= Date.now()) {
      throw new ContextQuillError("publish_at must be in the future.", "VALIDATION_ERROR");
    }
    const drafts = await this.get("drafts");
    const index = drafts.findIndex((draft) => draft.id === input.draft_id);
    if (index < 0) throw new ContextQuillError(`Draft not found: ${input.draft_id}`, "NOT_FOUND");
    const draft = drafts[index];
    if (draft.status !== "APPROVED") {
      throw new ContextQuillError("Only a human-approved draft can be scheduled.", "APPROVAL_GATE");
    }
    if (draftFingerprint(draft) !== draft.approved_hash) {
      throw new ContextQuillError("Approved content changed. Review it again before scheduling.", "VERSION_MISMATCH");
    }
    draft.status = "SCHEDULED";
    draft.scheduled_at = publishAt;
    draft.updated_at = nowIso();
    drafts[index] = draft;
    await this.set("drafts", drafts);
    await this.audit("draft.scheduled", { draft_id: draft.id, scheduled_at: publishAt });
    return { draft_id: draft.id, status: draft.status, scheduled_at: publishAt };
  }

  async linkedInCredentials(profile) {
    if (this.credentialsProvider) {
      const provided = await this.credentialsProvider(profile);
      return {
        memberUrn: normalizeMemberUrn(provided?.memberUrn),
        accessToken: cleanString(provided?.accessToken),
        linkedinVersion: cleanString(provided?.linkedinVersion, profile.linkedin_version || "202606"),
        source: cleanString(provided?.source, "injected provider"),
      };
    }
    const memberUrn = normalizeMemberUrn(process.env.LINKEDIN_MEMBER_URN || profile.linkedin_member_urn);
    const accessToken = process.env.LINKEDIN_ACCESS_TOKEN || keychainToken(memberUrn);
    return {
      memberUrn,
      accessToken,
      linkedinVersion: cleanString(process.env.LINKEDIN_VERSION, profile.linkedin_version || "202606"),
      source: process.env.LINKEDIN_ACCESS_TOKEN ? "environment" : accessToken ? "macOS Keychain" : "missing",
    };
  }

  async connectionStatus() {
    const profile = await this.getProfile();
    const credentials = await this.linkedInCredentials(profile);
    const expiresAt = cleanString(profile.linkedin_token_expires_at);
    const expired = expiresAt ? new Date(expiresAt).getTime() <= Date.now() : false;
    return {
      connected: Boolean(credentials.memberUrn && credentials.accessToken && !expired),
      member_urn_configured: Boolean(credentials.memberUrn),
      member_name: cleanString(profile.linkedin_member_name),
      token_available: Boolean(credentials.accessToken),
      token_expires_at: expiresAt || null,
      reauthorization_required: expired,
      credential_source: credentials.source,
      setup_command: "npm run connect-linkedin",
      setup_url: `https://www.linkedin.com/developers/tools/oauth/token-generator?clientId=${LINKEDIN_CLIENT_ID}`,
      required_scopes: ["openid", "profile", "w_member_social"],
      publisher_api: "Share on LinkedIn v2/ugcPosts",
      note: "ContextQuill never writes the LinkedIn access token into its JSON content store.",
    };
  }

  async verifyLinkedInConnection() {
    const profile = await this.getProfile();
    const credentials = await this.linkedInCredentials(profile);
    if (!credentials.memberUrn || !credentials.accessToken) {
      throw new ContextQuillError(
        "LinkedIn is not connected. Generate a token with openid, profile, and w_member_social, then run `npm run connect-linkedin`.",
        "LINKEDIN_NOT_CONNECTED",
      );
    }
    const identity = await this.linkedinFetch(
      "https://api.linkedin.com/v2/userinfo",
      { method: "GET", headers: { Authorization: `Bearer ${credentials.accessToken}` } },
      "LinkedIn identity verification",
    );
    const verifiedUrn = normalizeMemberUrn(identity.body?.sub);
    if (!verifiedUrn || verifiedUrn !== credentials.memberUrn) {
      throw new ContextQuillError("The LinkedIn token identity does not match the configured member.", "LINKEDIN_IDENTITY_MISMATCH");
    }
    return {
      connected: true,
      identity_verified: true,
      member_urn: verifiedUrn,
      member_name: cleanString(identity.body?.name, profile.linkedin_member_name || ""),
      credential_source: credentials.source,
      token_expires_at: cleanString(profile.linkedin_token_expires_at) || null,
      required_scopes: ["openid", "profile", "w_member_social"],
      publisher_api: "Share on LinkedIn v2/ugcPosts",
    };
  }

  buildLinkedInPayload(draft, authorUrn, media = null) {
    const shareContent = {
      shareCommentary: { text: draft.text },
      shareMediaCategory: "NONE",
    };
    if (media) {
      shareContent.shareMediaCategory = "IMAGE";
      shareContent.media = [
        {
          status: "READY",
          media: media.id,
          description: { text: cleanString(media.altText, "ContextQuill image") },
          title: { text: cleanString(draft.title, "ContextQuill") },
        },
      ];
    } else if (draft.links?.[0]) {
      shareContent.shareMediaCategory = "ARTICLE";
      shareContent.media = [
        {
          status: "READY",
          originalUrl: draft.links[0],
          title: { text: cleanString(draft.title, "Shared via ContextQuill") },
        },
      ];
    }
    return {
      author: authorUrn,
      lifecycleState: "PUBLISHED",
      specificContent: { "com.linkedin.ugc.ShareContent": shareContent },
      visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
    };
  }

  async linkedinFetch(url, init, label) {
    if (!this.fetchImpl) throw new ContextQuillError("fetch is unavailable in this Node runtime.", "RUNTIME_ERROR");
    const response = await this.fetchImpl(url, init);
    const text = await response.text();
    let body = text;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      // Preserve plain-text LinkedIn errors.
    }
    if (!response.ok) {
      throw new ContextQuillError(`${label} failed with HTTP ${response.status}.`, "LINKEDIN_API_ERROR", {
        status: response.status,
        response: typeof body === "string" ? body.slice(0, 1200) : body,
      });
    }
    return { response, body };
  }

  async uploadImage(attachment, credentials) {
    const filePath = path.resolve(cleanString(attachment.path));
    try {
      const info = await stat(filePath);
      if (!info.isFile()) throw new Error("not a file");
    } catch {
      throw new ContextQuillError(`Image attachment is not readable: ${filePath}`, "ATTACHMENT_ERROR");
    }
    const headers = {
      Authorization: `Bearer ${credentials.accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    };
    const initialized = await this.linkedinFetch(
      "https://api.linkedin.com/v2/assets?action=registerUpload",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          registerUploadRequest: {
            recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
            owner: credentials.memberUrn,
            serviceRelationships: [
              { relationshipType: "OWNER", identifier: "urn:li:userGeneratedContent" },
            ],
          },
        }),
      },
      "LinkedIn image registration",
    );
    const uploadUrl =
      initialized.body?.value?.uploadMechanism?.["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]
        ?.uploadUrl;
    const imageUrn = initialized.body?.value?.asset;
    if (!uploadUrl || !imageUrn) {
      throw new ContextQuillError("LinkedIn did not return an image upload URL and URN.", "LINKEDIN_API_ERROR");
    }
    const binary = readFileSync(filePath);
    await this.linkedinFetch(
      uploadUrl,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          "Content-Type": mimeFor(filePath),
        },
        body: binary,
      },
      "LinkedIn image upload",
    );
    return {
      id: imageUrn,
      altText: cleanString(attachment.alt_text || attachment.altText, "ContextQuill image"),
    };
  }

  async publishApprovedDraft(input = {}) {
    await this.init();
    assertPresent(input.draft_id, "draft_id");
    const drafts = await this.get("drafts");
    const index = drafts.findIndex((draft) => draft.id === input.draft_id);
    if (index < 0) throw new ContextQuillError(`Draft not found: ${input.draft_id}`, "NOT_FOUND");
    const draft = drafts[index];
    if (!new Set(["APPROVED", "SCHEDULED"]).has(draft.status)) {
      throw new ContextQuillError("Only a human-approved draft can be published.", "APPROVAL_GATE");
    }
    if (draftFingerprint(draft) !== draft.approved_hash) {
      throw new ContextQuillError("Approved content changed. Review it again before publishing.", "VERSION_MISMATCH");
    }
    if (draft.status === "SCHEDULED" && new Date(draft.scheduled_at).getTime() > Date.now() && !input.ignore_schedule) {
      throw new ContextQuillError(`Draft is scheduled for ${draft.scheduled_at}.`, "NOT_DUE");
    }
    if ((draft.attachments || []).length > 1) {
      throw new ContextQuillError("MVP publishing supports text or one image. Multi-image and PDF are next-phase features.", "MVP_LIMIT");
    }
    const profile = await this.getProfile();
    const credentials = await this.linkedInCredentials(profile);
    const previewPayload = this.buildLinkedInPayload(draft, credentials.memberUrn || "urn:li:person:NOT_CONFIGURED");
    if (input.dry_run) {
      return {
        dry_run: true,
        draft_id: draft.id,
        approved_hash_verified: true,
        linkedin_connected: Boolean(credentials.memberUrn && credentials.accessToken),
        payload: previewPayload,
        attachment: draft.attachments?.[0] || null,
      };
    }
    if (!credentials.memberUrn || !credentials.accessToken) {
      throw new ContextQuillError(
        "LinkedIn is not connected. Run `npm run connect-linkedin` in the ContextQuill plugin folder.",
        "LINKEDIN_NOT_CONNECTED",
      );
    }
    try {
      const media = draft.attachments?.[0] ? await this.uploadImage(draft.attachments[0], credentials) : null;
      const payload = this.buildLinkedInPayload(draft, credentials.memberUrn, media);
      const published = await this.linkedinFetch(
        "https://api.linkedin.com/v2/ugcPosts",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${credentials.accessToken}`,
            "Content-Type": "application/json",
            "X-Restli-Protocol-Version": "2.0.0",
          },
          body: JSON.stringify(payload),
        },
        "LinkedIn post publish",
      );
      const linkedinPostId = published.response.headers.get("x-restli-id") || published.body?.id || makeId("linkedin");
      const post = {
        id: makeId("post"),
        draft_id: draft.id,
        linkedin_post_id: linkedinPostId,
        published_at: nowIso(),
        primary_topic: draft.primary_topic,
        topics: draft.topics,
        content_type: draft.content_type,
        format: draft.attachments?.length ? "image" : draft.format,
        hook_style: draft.hook_style,
        text_hash: draft.approved_hash,
      };
      const posts = await this.get("posts");
      posts.push(post);
      await this.set("posts", posts);
      draft.status = "PUBLISHED";
      draft.published_at = post.published_at;
      draft.linkedin_post_id = linkedinPostId;
      draft.updated_at = nowIso();
      delete draft.last_publish_error;
      drafts[index] = draft;
      await this.set("drafts", drafts);
      await this.audit("draft.published", { draft_id: draft.id, linkedin_post_id: linkedinPostId });
      return { post, status: "PUBLISHED" };
    } catch (error) {
      draft.last_publish_error = { at: nowIso(), message: error.message, code: error.code || "ERROR" };
      drafts[index] = draft;
      await this.set("drafts", drafts);
      await this.audit("draft.publish_failed", { draft_id: draft.id, error: error.message });
      throw error;
    }
  }

  async publishDuePosts() {
    await this.init();
    const profile = await this.getProfile();
    if (!profile.auto_publish_enabled) {
      return { enabled: false, published: [], failed: [], message: "Auto-publish is disabled in the profile." };
    }
    const due = (await this.get("drafts")).filter(
      (draft) => draft.status === "SCHEDULED" && new Date(draft.scheduled_at).getTime() <= Date.now(),
    );
    const result = { enabled: true, published: [], failed: [] };
    for (const draft of due) {
      try {
        const output = await this.publishApprovedDraft({ draft_id: draft.id, ignore_schedule: true });
        result.published.push(output.post);
      } catch (error) {
        result.failed.push({ draft_id: draft.id, code: error.code || "ERROR", message: error.message });
      }
    }
    return result;
  }

  async recordMetrics(input = {}) {
    await this.init();
    const incoming = Array.isArray(input.records) ? input.records : [input];
    const metrics = await this.get("metrics");
    const posts = await this.get("posts");
    const saved = [];
    for (const row of incoming) {
      const postId = cleanString(row.post_id || row.linkedin_post_id);
      assertPresent(postId, "post_id");
      const post = posts.find((item) => item.id === postId || item.linkedin_post_id === postId);
      const metric = {
        post_id: postId,
        draft_id: cleanString(row.draft_id, post?.draft_id || ""),
        captured_at: nowIso(),
        published_at: cleanString(row.published_at, post?.published_at || ""),
        primary_topic: cleanString(row.primary_topic, post?.primary_topic || "uncategorized"),
        topics: cleanArray(row.topics || post?.topics || [row.primary_topic]),
        content_type: cleanString(row.content_type, post?.content_type || "unknown"),
        format: cleanString(row.format, post?.format || "text"),
        hook_style: cleanString(row.hook_style, post?.hook_style || "unknown"),
        impressions: numeric(row.impressions),
        reactions: numeric(row.reactions),
        comments: numeric(row.comments),
        reposts: numeric(row.reposts),
        clicks: numeric(row.clicks),
        follows: numeric(row.follows),
        leads: numeric(row.leads),
      };
      const index = metrics.findIndex((item) => item.post_id === postId);
      if (index >= 0) metrics[index] = { ...metrics[index], ...metric };
      else metrics.push(metric);
      saved.push(metric);
    }
    await this.set("metrics", metrics);
    await this.audit("metrics.recorded", { post_ids: saved.map((item) => item.post_id) });
    return saved;
  }

  groupPerformance(rows, dimension, overallAverage) {
    const groups = new Map();
    for (const row of rows) {
      const values = dimension === "topic"
        ? cleanArray([row.primary_topic, ...(row.topics || [])])
        : [cleanString(row[dimension], "unknown")];
      for (const value of values) {
        if (!groups.has(value)) groups.set(value, []);
        groups.get(value).push(row);
      }
    }
    return [...groups.entries()]
      .map(([name, items]) => {
        const impressions = items.map((item) => item.impressions);
        const totalImpressions = impressions.reduce((sum, value) => sum + value, 0);
        const engagements = items.reduce(
          (sum, item) => sum + item.reactions + item.comments + item.reposts + item.clicks,
          0,
        );
        const n = items.length;
        const rawAverage = average(impressions);
        const shrinkageWeight = n / (n + 3);
        const exposureScore = shrinkageWeight * rawAverage + (1 - shrinkageWeight) * overallAverage;
        return {
          name,
          posts: n,
          average_impressions: round(rawAverage),
          median_impressions: round(median(impressions)),
          exposure_score: round(exposureScore),
          engagement_rate: totalImpressions ? round(engagements / totalImpressions, 4) : 0,
          average_leads: round(average(items.map((item) => item.leads))),
          confidence: n >= 6 ? "high" : n >= 3 ? "medium" : "low",
        };
      })
      .sort((a, b) => b.exposure_score - a.exposure_score);
  }

  async analyzePerformance(input = {}) {
    await this.init();
    let rows = await this.get("metrics");
    if (input.since) {
      const since = new Date(input.since).getTime();
      if (Number.isNaN(since)) throw new ContextQuillError("since must be a valid date.", "VALIDATION_ERROR");
      rows = rows.filter((row) => new Date(row.published_at || row.captured_at).getTime() >= since);
    }
    rows = rows.filter((row) => row.impressions > 0);
    if (!rows.length) {
      return {
        sample_size: 0,
        message: "No impression data yet. Add metrics after publishing at least a few posts.",
        recommended_exploration_share: 0.3,
      };
    }
    const overallAverage = average(rows.map((row) => row.impressions));
    const byTopic = this.groupPerformance(rows, "topic", overallAverage);
    const byContentType = this.groupPerformance(rows, "content_type", overallAverage);
    const byFormat = this.groupPerformance(rows, "format", overallAverage);
    const byHookStyle = this.groupPerformance(rows, "hook_style", overallAverage);
    const byWeekdayRows = rows.map((row) => ({
      ...row,
      weekday: row.published_at
        ? new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(new Date(row.published_at))
        : "unknown",
    }));
    const byWeekday = this.groupPerformance(byWeekdayRows, "weekday", overallAverage);
    const reliableTopics = byTopic.filter((item) => item.posts >= 2);
    return {
      sample_size: rows.length,
      overall: {
        average_impressions: round(overallAverage),
        median_impressions: round(median(rows.map((row) => row.impressions))),
        aggregate_engagement_rate: round(
          rows.reduce((sum, row) => sum + row.reactions + row.comments + row.reposts + row.clicks, 0) /
            rows.reduce((sum, row) => sum + row.impressions, 0),
          4,
        ),
        total_leads: rows.reduce((sum, row) => sum + row.leads, 0),
      },
      by_topic: byTopic,
      by_content_type: byContentType,
      by_format: byFormat,
      by_hook_style: byHookStyle,
      by_weekday: byWeekday,
      recommendations: {
        double_down_topics: reliableTopics.slice(0, 3).map((item) => item.name),
        keep_exploring: true,
        exploration_share: 0.25,
        note:
          rows.length < 10
            ? "Small sample: use these as directional signals, not conclusions. Keep at least 25% of posts exploratory."
            : "Use exposure score together with engagement and leads; do not optimize for impressions alone.",
      },
    };
  }

  async exportPerformanceReport(input = {}) {
    const analysis = await this.analyzePerformance(input);
    const date = new Date().toISOString().slice(0, 10);
    const lines = [
      `# ContextQuill Performance Report — ${date}`,
      "",
      `Sample size: ${analysis.sample_size}`,
      "",
    ];
    if (!analysis.sample_size) {
      lines.push(analysis.message, "");
    } else {
      lines.push(
        `Average impressions: ${analysis.overall.average_impressions}`,
        `Median impressions: ${analysis.overall.median_impressions}`,
        `Aggregate engagement rate: ${(analysis.overall.aggregate_engagement_rate * 100).toFixed(2)}%`,
        `Leads recorded: ${analysis.overall.total_leads}`,
        "",
        "## Topics",
        "",
        "| Topic | Posts | Avg impressions | Exposure score | Engagement | Confidence |",
        "|---|---:|---:|---:|---:|---|",
        ...analysis.by_topic.map(
          (item) =>
            `| ${item.name} | ${item.posts} | ${item.average_impressions} | ${item.exposure_score} | ${(item.engagement_rate * 100).toFixed(2)}% | ${item.confidence} |`,
        ),
        "",
        "## Recommended mix",
        "",
        `Double down: ${analysis.recommendations.double_down_topics.join(", ") || "Not enough data"}`,
        `Exploration share: ${Math.round(analysis.recommendations.exploration_share * 100)}%`,
        "",
        analysis.recommendations.note,
        "",
      );
    }
    const reportPath = path.join(this.dataDir, "reports", `performance-${date}.md`);
    await writeFile(reportPath, `${lines.join("\n")}\n`, { mode: 0o600 });
    await this.audit("performance.report_exported", { report_path: reportPath });
    return { report_path: reportPath, analysis };
  }

  async dashboard() {
    await this.init();
    const [profile, signals, drafts, posts, metrics] = await Promise.all([
      this.get("profile"),
      this.get("signals"),
      this.get("drafts"),
      this.get("posts"),
      this.get("metrics"),
    ]);
    const statuses = {};
    for (const draft of drafts) statuses[draft.status] = (statuses[draft.status] || 0) + 1;
    return {
      project: "Project ContextQuill",
      data_dir: this.dataDir,
      profile_configured: Boolean(profile.positioning && profile.audience),
      auto_publish_enabled: Boolean(profile.auto_publish_enabled),
      counts: {
        signals: signals.length,
        drafts: drafts.length,
        posts: posts.length,
        metrics: metrics.length,
      },
      draft_statuses: statuses,
      next_scheduled: drafts
        .filter((draft) => draft.status === "SCHEDULED")
        .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
        .slice(0, 5)
        .map((draft) => ({ id: draft.id, scheduled_at: draft.scheduled_at, primary_topic: draft.primary_topic })),
    };
  }
}

export function createStore(dataDir, options) {
  return new ContextQuillStore(dataDir, options);
}
