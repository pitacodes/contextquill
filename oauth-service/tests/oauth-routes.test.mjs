import test from "node:test";
import assert from "node:assert/strict";

class FakeStatement {
  constructor(database, sql) {
    this.database = database;
    this.sql = sql.replace(/\s+/g, " ").trim();
    this.args = [];
  }

  bind(...args) {
    this.args = args;
    return this;
  }

  async first() {
    if (this.sql.startsWith("SELECT COUNT(*) AS total")) {
      const [fingerprint, after] = this.args;
      return {
        total: this.database.rows.filter(
          (row) => row.client_fingerprint === fingerprint && row.created_at > after,
        ).length,
      };
    }
    if (this.sql.includes("WHERE handoff_code_hash = ? AND status = 'READY'")) {
      return this.database.rows.find(
        (row) => row.handoff_code_hash === this.args[0] && row.status === "READY",
      ) || null;
    }
    return null;
  }

  async run() {
    if (this.sql.startsWith("CREATE ")) return { meta: { changes: 0 } };
    if (this.sql.startsWith("DELETE FROM oauth_sessions")) {
      const before = this.database.rows.length;
      this.database.rows = this.database.rows.filter((row) => row.expires_at >= this.args[0]);
      return { meta: { changes: before - this.database.rows.length } };
    }
    if (this.sql.startsWith("INSERT INTO oauth_sessions")) {
      const [id, oauthStateHash, localState, callbackUri, handoffChallenge, clientFingerprint, createdAt, expiresAt] = this.args;
      this.database.rows.push({
        id,
        oauth_state_hash: oauthStateHash,
        local_state: localState,
        callback_uri: callbackUri,
        handoff_challenge: handoffChallenge,
        client_fingerprint: clientFingerprint,
        status: "PENDING",
        created_at: createdAt,
        expires_at: expiresAt,
        handoff_code_hash: null,
      });
      return { meta: { changes: 1 } };
    }
    return { meta: { changes: 0 } };
  }
}

class FakeD1 {
  constructor() {
    this.rows = [];
  }

  prepare(sql) {
    return new FakeStatement(this, sql);
  }

  async batch(statements) {
    return Promise.all(statements.map((statement) => statement.run()));
  }
}

async function worker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("oauth-test", `${process.pid}-${Date.now()}`);
  return (await import(workerUrl.href)).default;
}

function runtime(db) {
  return {
    DB: db,
    CONTEXTQUILL_LINKEDIN_CLIENT_SECRET: "local-test-secret",
    CONTEXTQUILL_OAUTH_ENCRYPTION_KEY: "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE",
    CONTEXTQUILL_OAUTH_SIGNING_SECRET: "local-test-signing-secret",
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  };
}

const context = { waitUntil() {}, passThroughOnException() {} };

test("OAuth service validates loopback starts and creates trusted LinkedIn authorization URLs", async () => {
  const app = await worker();
  const db = new FakeD1();
  const homepage = await app.fetch(new Request("https://oauth.contextquill.test/"), runtime(db), context);
  assert.equal(homepage.status, 200);
  assert.match(await homepage.text(), /LinkedIn authorization, without shared accounts\./);

  const invalid = await app.fetch(
    new Request("https://oauth.contextquill.test/api/oauth/linkedin/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callback_uri: "https://attacker.example/callback",
        local_state: "abcdefghijklmnopqrstuvwxyzABCDEFGH123456",
        handoff_challenge: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi1234567890_-",
      }),
    }),
    runtime(db),
    context,
  );
  const invalidBody = await invalid.json();
  assert.equal(invalid.status, 400, JSON.stringify(invalidBody));
  assert.equal(invalidBody.error, "INVALID_CALLBACK_URI");

  const started = await app.fetch(
    new Request("https://oauth.contextquill.test/api/oauth/linkedin/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callback_uri: "http://127.0.0.1:49152/linkedin/callback",
        local_state: "abcdefghijklmnopqrstuvwxyzABCDEFGH123456",
        handoff_challenge: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi1234567890_-",
      }),
    }),
    runtime(db),
    context,
  );
  assert.equal(started.status, 200);
  const startBody = await started.json();
  const authorization = new URL(startBody.authorization_url);
  assert.equal(authorization.origin + authorization.pathname, "https://www.linkedin.com/oauth/v2/authorization");
  assert.equal(authorization.searchParams.get("client_id"), "86z5t5sel4czpt");
  assert.equal(authorization.searchParams.get("scope"), "openid profile w_member_social");
  assert.equal(
    authorization.searchParams.get("redirect_uri"),
    "https://oauth.contextquill.test/api/oauth/linkedin/callback",
  );
  assert.equal(JSON.stringify(startBody).includes("client_secret"), false);
  assert.equal(db.rows.length, 1);

  const replay = await app.fetch(
    new Request("https://oauth.contextquill.test/api/oauth/linkedin/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        handoff_code: "abcdefghijklmnopqrstuvwxyzABCDEFGH123456",
        handoff_verifier: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi1234567890_-",
      }),
    }),
    runtime(db),
    context,
  );
  assert.equal(replay.status, 410);
  assert.equal((await replay.json()).error, "HANDOFF_EXPIRED");
});
