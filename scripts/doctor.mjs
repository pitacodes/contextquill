#!/usr/bin/env node
import { createStore, resolveDataDir } from "../lib/core.mjs";

const store = createStore();
await store.init();

const [dashboard, connection] = await Promise.all([store.dashboard(), store.connectionStatus()]);

const result = {
  contextquill: "0.1.0",
  node: process.version,
  node_supported: Number(process.versions.node.split(".")[0]) >= 20,
  data_dir: resolveDataDir(),
  profile_configured: dashboard.profile_configured,
  auto_publish_enabled: dashboard.auto_publish_enabled,
  linkedin: connection,
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
process.exitCode = result.node_supported ? 0 : 1;
