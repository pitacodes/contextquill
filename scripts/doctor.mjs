#!/usr/bin/env node
import { createStore, resolveDataDir } from "../lib/core.mjs";

const store = createStore();
await store.init();

const [dashboard, connection] = await Promise.all([store.dashboard(), store.connectionStatus()]);
let liveVerification = null;
if (connection.connected) {
  try {
    liveVerification = await store.verifyLinkedInConnection();
  } catch (error) {
    liveVerification = { connected: false, error: error.code || "LINKEDIN_VERIFICATION_FAILED", message: error.message };
  }
}

const result = {
  contextquill: "0.2.0",
  node: process.version,
  node_supported: Number(process.versions.node.split(".")[0]) >= 20,
  data_dir: resolveDataDir(),
  profile_configured: dashboard.profile_configured,
  auto_publish_enabled: dashboard.auto_publish_enabled,
  linkedin: { ...connection, live_verification: liveVerification },
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
const linkedinConfigured = connection.member_urn_configured || connection.token_available;
const linkedinHealthy = !linkedinConfigured || (connection.connected && liveVerification?.connected);
process.exitCode = result.node_supported && linkedinHealthy ? 0 : 1;
