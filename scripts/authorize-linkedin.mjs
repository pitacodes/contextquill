#!/usr/bin/env node
import { createStore } from "../lib/core.mjs";
import { connectLinkedInViaHostedOAuth } from "../lib/linkedin-oauth.mjs";

const store = createStore();
await store.init();

process.stdout.write(
  "Opening LinkedIn in your default browser. Authorize the account you want ContextQuill to publish as.\n",
);

try {
  const result = await connectLinkedInViaHostedOAuth({ store });
  process.stdout.write(
    `LinkedIn connected as ${result.member_name || result.member_urn}. Reauthorization is expected by ${result.token_expires_at}.\n`,
  );
} catch (error) {
  process.stderr.write(`LinkedIn connection failed: ${error.message}\n`);
  process.exitCode = 1;
}
