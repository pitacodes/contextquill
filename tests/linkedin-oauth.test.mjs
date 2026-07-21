import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createStore } from "../lib/core.mjs";
import {
  DEFAULT_CONTEXTQUILL_OAUTH_BASE_URL,
  LinkedInOAuthError,
  connectLinkedInViaHostedOAuth,
  createHandoffProof,
  startHostedLinkedInOAuth,
} from "../lib/linkedin-oauth.mjs";

const OAUTH_BASE_URL = "https://oauth.contextquill.test";
const PRODUCTION_OAUTH_BASE_URL = "https://contextquill-oauth.jmvgzw276z.chatgpt.site";

async function withStore(run) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "contextquill-oauth-test-"));
  try {
    const store = createStore(dir);
    await store.init();
    await run(store);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function broker({ token = "secret-test-token", member = "member-one", name = "Member One", untrusted = false } = {}) {
  let startPayload;
  let redeemCalls = 0;
  const fetchImpl = async (url, init = {}) => {
    if (url === `${OAUTH_BASE_URL}/api/oauth/linkedin/start`) {
      startPayload = JSON.parse(init.body);
      assert.equal(init.method, "POST");
      assert.match(startPayload.callback_uri, /^http:\/\/127\.0\.0\.1:\d+\/linkedin\/callback$/);
      assert.ok(startPayload.local_state);
      assert.ok(startPayload.handoff_challenge);
      assert.equal(JSON.stringify(startPayload).includes("access_token"), false);
      return Response.json({
        authorization_url: untrusted
          ? "https://evil.example.test/steal"
          : "https://www.linkedin.com/oauth/v2/authorization?client_id=test",
      });
    }
    if (url === `${OAUTH_BASE_URL}/api/oauth/linkedin/redeem`) {
      redeemCalls += 1;
      const redemption = JSON.parse(init.body);
      assert.equal(redemption.handoff_code, "one-time-code");
      const challenge = createHash("sha256").update(redemption.handoff_verifier).digest("base64url");
      assert.equal(challenge, startPayload.handoff_challenge);
      return Response.json({
        access_token: token,
        member_urn: `urn:li:person:${member}`,
        member_name: name,
        token_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
        scopes: ["openid", "profile", "w_member_social"],
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  };
  return {
    fetchImpl,
    getStartPayload: () => startPayload,
    getRedeemCalls: () => redeemCalls,
  };
}

test("hosted handoff proof uses a high-entropy verifier and SHA-256 challenge", () => {
  const first = createHandoffProof();
  const second = createHandoffProof();
  assert.ok(first.verifier.length >= 64);
  assert.equal(first.challenge, createHash("sha256").update(first.verifier).digest("base64url"));
  assert.notEqual(first.verifier, second.verifier);
});

test("released plugin defaults to the production ContextQuill OAuth service", () => {
  assert.equal(DEFAULT_CONTEXTQUILL_OAUTH_BASE_URL, PRODUCTION_OAUTH_BASE_URL);
});

test("OAuth start sends only loopback and proof metadata and accepts only LinkedIn authorization", async () => {
  const trusted = broker();
  const started = await startHostedLinkedInOAuth({
    oauthBaseUrl: OAUTH_BASE_URL,
    callbackUri: "http://127.0.0.1:54321/linkedin/callback",
    localState: "local-state-value-abcdefghijklmnopqrstuvwxyz",
    handoffChallenge: "handoff-challenge-value-abcdefghijklmnopqrstuvwxyz",
    fetchImpl: trusted.fetchImpl,
  });
  assert.match(started.authorizationUrl, /^https:\/\/www\.linkedin\.com\/oauth\/v2\/authorization/);

  const untrusted = broker({ untrusted: true });
  await assert.rejects(
    () =>
      startHostedLinkedInOAuth({
        oauthBaseUrl: OAUTH_BASE_URL,
        callbackUri: "http://127.0.0.1:54321/linkedin/callback",
        localState: "local-state-value-abcdefghijklmnopqrstuvwxyz",
        handoffChallenge: "handoff-challenge-value-abcdefghijklmnopqrstuvwxyz",
        fetchImpl: untrusted.fetchImpl,
      }),
    (error) => error instanceof LinkedInOAuthError && error.code === "OAUTH_SERVICE_UNTRUSTED",
  );
});

test("one-click hosted OAuth stores the token locally but never returns or writes it to the profile", async () => {
  await withStore(async (store) => {
    const credentials = [];
    const service = broker();
    const result = await connectLinkedInViaHostedOAuth({
      store,
      oauthBaseUrl: OAUTH_BASE_URL,
      fetchImpl: service.fetchImpl,
      credentialStore: async (memberUrn, accessToken) => credentials.push({ memberUrn, accessToken }),
      openBrowser: async (authorizationUrl) => {
        assert.match(authorizationUrl, /^https:\/\/www\.linkedin\.com/);
        const started = service.getStartPayload();
        const callback = new URL(started.callback_uri);
        callback.searchParams.set("state", started.local_state);
        callback.searchParams.set("handoff_code", "one-time-code");
        const response = await globalThis.fetch(callback);
        assert.equal(response.status, 200);
      },
      timeoutMs: 5000,
    });
    assert.equal(result.connected, true);
    assert.equal(result.member_urn, "urn:li:person:member-one");
    assert.equal(result.oauth_mode, "hosted_authorization_code");
    assert.equal(JSON.stringify(result).includes("secret-test-token"), false);
    assert.deepEqual(credentials, [
      { memberUrn: "urn:li:person:member-one", accessToken: "secret-test-token" },
    ]);
    const profile = await store.getProfile();
    assert.equal(profile.linkedin_member_urn, "urn:li:person:member-one");
    assert.deepEqual(profile.linkedin_scopes, ["openid", "profile", "w_member_social"]);
    assert.equal(JSON.stringify(profile).includes("secret-test-token"), false);
  });
});

test("local OAuth callback rejects mismatched state before handoff redemption", async () => {
  await withStore(async (store) => {
    const service = broker();
    await assert.rejects(
      () =>
        connectLinkedInViaHostedOAuth({
          store,
          oauthBaseUrl: OAUTH_BASE_URL,
          fetchImpl: service.fetchImpl,
          credentialStore: async () => {},
          openBrowser: async () => {
            const started = service.getStartPayload();
            const callback = new URL(started.callback_uri);
            callback.searchParams.set("state", "attacker-state");
            callback.searchParams.set("handoff_code", "one-time-code");
            const response = await globalThis.fetch(callback);
            assert.equal(response.status, 401);
          },
          timeoutMs: 5000,
        }),
      (error) => error instanceof LinkedInOAuthError && error.code === "OAUTH_STATE_MISMATCH",
    );
    assert.equal(service.getRedeemCalls(), 0);
  });
});

test("different installations bind to independently authorized LinkedIn members", async () => {
  const runConnection = async ({ member, name, token }) => {
    let stored;
    let profile;
    await withStore(async (store) => {
      const service = broker({ member, name, token });
      await connectLinkedInViaHostedOAuth({
        store,
        oauthBaseUrl: OAUTH_BASE_URL,
        fetchImpl: service.fetchImpl,
        credentialStore: async (memberUrn, accessToken) => {
          stored = { memberUrn, accessToken };
        },
        openBrowser: async () => {
          const started = service.getStartPayload();
          const callback = new URL(started.callback_uri);
          callback.searchParams.set("state", started.local_state);
          callback.searchParams.set("handoff_code", "one-time-code");
          await globalThis.fetch(callback);
        },
        timeoutMs: 5000,
      });
      profile = await store.getProfile();
    });
    return { stored, profile };
  };
  const first = await runConnection({ member: "member-one", name: "Member One", token: "token-one" });
  const second = await runConnection({ member: "member-two", name: "Member Two", token: "token-two" });
  assert.equal(first.stored.memberUrn, "urn:li:person:member-one");
  assert.equal(first.stored.accessToken, "token-one");
  assert.equal(second.stored.memberUrn, "urn:li:person:member-two");
  assert.equal(second.stored.accessToken, "token-two");
  assert.notEqual(first.profile.linkedin_member_urn, second.profile.linkedin_member_urn);
});

test("switching accounts removes the previous local credential after storing the new one", async () => {
  await withStore(async (store) => {
    const events = [];
    const connect = async ({ member, name, token }) => {
      const service = broker({ member, name, token });
      return connectLinkedInViaHostedOAuth({
        store,
        oauthBaseUrl: OAUTH_BASE_URL,
        fetchImpl: service.fetchImpl,
        credentialStore: async (memberUrn) => events.push(`store:${memberUrn}`),
        credentialDelete: async (memberUrn) => events.push(`delete:${memberUrn}`),
        openBrowser: async () => {
          const started = service.getStartPayload();
          const callback = new URL(started.callback_uri);
          callback.searchParams.set("state", started.local_state);
          callback.searchParams.set("handoff_code", "one-time-code");
          await globalThis.fetch(callback);
        },
        timeoutMs: 5000,
      });
    };
    await connect({ member: "member-one", name: "Member One", token: "token-one" });
    await connect({ member: "member-two", name: "Member Two", token: "token-two" });
    assert.deepEqual(events, [
      "store:urn:li:person:member-one",
      "store:urn:li:person:member-two",
      "delete:urn:li:person:member-one",
    ]);
  });
});
