import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
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
