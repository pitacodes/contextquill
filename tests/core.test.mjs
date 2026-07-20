import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createStore, ContextQuillError } from "../lib/core.mjs";

async function withStore(run) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "contextquill-test-"));
  try {
    const store = createStore(dir);
    await store.init();
    await run(store, dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function approveDraft(store, input) {
  const draft = await store.createDraft(input);
  const review = await store.submitForReview({ draft_id: draft.id });
  await store.approveDraft({
    draft_id: draft.id,
    approval_statement: `APPROVE ${review.review_code}`,
    reviewer_name: "Peter",
  });
  return draft;
}

test("human approval locks the exact reviewed draft", async () => {
  await withStore(async (store) => {
    await store.configureProfile({
      positioning: "B2B SaaS operator",
      audience: "B2B SaaS leaders",
      auto_publish_enabled: true,
    });
    const signal = await store.captureSignal({
      title: "Implementation lesson",
      insight: "Successful AI deployment depends on workflow ownership, not just model quality.",
      confidentiality: "public",
      evidence: ["Observed in a published implementation retrospective"],
      topics: ["AI deployment"],
    });
    const draft = await store.createDraft({
      text: "The hardest part of enterprise AI is rarely the model. It is deciding who owns the workflow after the demo.",
      primary_topic: "AI deployment",
      source_signal_ids: [signal.id],
      evidence_refs: ["Published retrospective"],
    });
    const review = await store.submitForReview({ draft_id: draft.id });

    await assert.rejects(
      () => store.approveDraft({ draft_id: draft.id, approval_statement: "looks good" }),
      (error) => error instanceof ContextQuillError && error.code === "APPROVAL_GATE",
    );

    const approved = await store.approveDraft({
      draft_id: draft.id,
      approval_statement: `APPROVE ${review.review_code}`,
      reviewer_name: "Peter",
    });
    assert.equal(approved.status, "APPROVED");

    const dryRun = await store.publishApprovedDraft({ draft_id: draft.id, dry_run: true });
    assert.equal(dryRun.approved_hash_verified, true);

    const edited = await store.updateDraft({ draft_id: draft.id, text: `${draft.text}\n\nOne more thought.` });
    assert.equal(edited.status, "DRAFT");
    assert.equal(edited.approved_hash, undefined);

    await assert.rejects(
      () => store.publishApprovedDraft({ draft_id: draft.id, dry_run: true }),
      (error) => error instanceof ContextQuillError && error.code === "APPROVAL_GATE",
    );
  });
});

test("confidential sources require redaction confirmation before review", async () => {
  await withStore(async (store) => {
    const signal = await store.captureSignal({
      title: "Customer lesson",
      insight: "A rollout failed because ownership was unclear.",
      confidentiality: "client_confidential",
      topics: ["customer success"],
    });
    const draft = await store.createDraft({
      text: "A common rollout mistake is leaving ownership implicit.",
      primary_topic: "customer success",
      source_signal_ids: [signal.id],
    });
    await assert.rejects(
      () => store.submitForReview({ draft_id: draft.id }),
      (error) => error instanceof ContextQuillError && error.code === "DISCLOSURE_GATE",
    );
    await store.updateDraft({
      draft_id: draft.id,
      redactions_confirmed: true,
      safety_notes: "Customer name, product details, and dates removed; lesson generalized.",
    });
    const review = await store.submitForReview({ draft_id: draft.id });
    assert.match(review.review_code, /^CQ-[A-F0-9]{6}$/);
  });
});

test("topic analytics use exposure score and confidence labels", async () => {
  await withStore(async (store) => {
    await store.recordMetrics({
      records: [
        { post_id: "p1", primary_topic: "AI agents", topics: ["AI agents"], impressions: 1000, reactions: 50 },
        { post_id: "p2", primary_topic: "AI agents", topics: ["AI agents"], impressions: 1200, reactions: 60 },
        { post_id: "p3", primary_topic: "pricing", topics: ["pricing"], impressions: 500, reactions: 40, leads: 2 },
      ],
    });
    const analysis = await store.analyzePerformance();
    assert.equal(analysis.sample_size, 3);
    assert.equal(analysis.by_topic[0].name, "AI agents");
    assert.equal(analysis.by_topic[0].confidence, "low");
    assert.deepEqual(analysis.recommendations.double_down_topics, ["AI agents"]);
    assert.equal(analysis.recommendations.exploration_share, 0.25);
  });
});

test("only approved drafts can be scheduled", async () => {
  await withStore(async (store) => {
    const draft = await store.createDraft({ text: "A grounded post.", primary_topic: "operations" });
    await assert.rejects(
      () => store.scheduleDraft({ draft_id: draft.id, publish_at: new Date(Date.now() + 60_000).toISOString() }),
      (error) => error instanceof ContextQuillError && error.code === "APPROVAL_GATE",
    );
  });
});

test("self-service text and article payloads use LinkedIn UGC format", async () => {
  await withStore(async (_store, dir) => {
    const store = createStore(dir, {
      credentialsProvider: async () => ({
        memberUrn: "urn:li:person:test-member",
        accessToken: "test-token",
      }),
    });
    await store.init();
    const draft = await approveDraft(store, {
      title: "A useful link",
      text: "A grounded post with one reviewed link.",
      primary_topic: "operations",
      links: ["https://example.com/evidence"],
    });
    const preview = await store.publishApprovedDraft({ draft_id: draft.id, dry_run: true });
    assert.equal(preview.payload.author, "urn:li:person:test-member");
    assert.equal(
      preview.payload.specificContent["com.linkedin.ugc.ShareContent"].shareMediaCategory,
      "ARTICLE",
    );
    assert.equal(
      preview.payload.specificContent["com.linkedin.ugc.ShareContent"].media[0].originalUrl,
      "https://example.com/evidence",
    );
    assert.equal(preview.payload.visibility["com.linkedin.ugc.MemberNetworkVisibility"], "PUBLIC");
  });
});

test("approved text posts publish through the Share on LinkedIn UGC endpoint", async () => {
  await withStore(async (_store, dir) => {
    const calls = [];
    const store = createStore(dir, {
      credentialsProvider: async () => ({
        memberUrn: "urn:li:person:test-member",
        accessToken: "test-token",
      }),
      fetchImpl: async (url, init) => {
        calls.push({ url, init });
        return new Response("", { status: 201, headers: { "x-restli-id": "urn:li:share:test-post" } });
      },
    });
    await store.init();
    const draft = await approveDraft(store, {
      text: "An approved post.",
      primary_topic: "operations",
    });
    const result = await store.publishApprovedDraft({ draft_id: draft.id });
    assert.equal(result.status, "PUBLISHED");
    assert.equal(result.post.linkedin_post_id, "urn:li:share:test-post");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.linkedin.com/v2/ugcPosts");
    assert.equal(calls[0].init.method, "POST");
    assert.equal(calls[0].init.headers["X-Restli-Protocol-Version"], "2.0.0");
  });
});

test("approved image posts register and upload an asset before UGC publishing", async () => {
  await withStore(async (_store, dir) => {
    const imagePath = path.join(dir, "post.png");
    await writeFile(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const calls = [];
    const store = createStore(dir, {
      credentialsProvider: async () => ({
        memberUrn: "urn:li:person:test-member",
        accessToken: "test-token",
      }),
      fetchImpl: async (url, init) => {
        calls.push({ url, init });
        if (url.includes("assets?action=registerUpload")) {
          return Response.json({
            value: {
              uploadMechanism: {
                "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest": {
                  uploadUrl: "https://upload.example.test/image",
                },
              },
              asset: "urn:li:digitalmediaAsset:test-image",
            },
          });
        }
        if (url === "https://upload.example.test/image") return new Response("", { status: 201 });
        return new Response("", { status: 201, headers: { "x-restli-id": "urn:li:share:image-post" } });
      },
    });
    await store.init();
    const draft = await approveDraft(store, {
      title: "Image post",
      text: "An approved image post.",
      primary_topic: "operations",
      format: "image",
      attachments: [{ type: "image", path: imagePath, alt_text: "A simple test image" }],
    });
    const result = await store.publishApprovedDraft({ draft_id: draft.id });
    assert.equal(result.status, "PUBLISHED");
    assert.equal(calls[0].url, "https://api.linkedin.com/v2/assets?action=registerUpload");
    assert.equal(JSON.parse(calls[0].init.body).registerUploadRequest.owner, "urn:li:person:test-member");
    assert.equal(calls[1].url, "https://upload.example.test/image");
    assert.equal(calls[1].init.method, "PUT");
    const publishBody = JSON.parse(calls[2].init.body);
    assert.equal(calls[2].url, "https://api.linkedin.com/v2/ugcPosts");
    assert.equal(
      publishBody.specificContent["com.linkedin.ugc.ShareContent"].media[0].media,
      "urn:li:digitalmediaAsset:test-image",
    );
  });
});
