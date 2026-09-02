import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const readJson = async (path) => JSON.parse(await readFile(new URL(path, root), "utf8"));
const readText = async (path) => readFile(new URL(path, root), "utf8");

test("public distribution metadata stays on one release version", async () => {
  const [pkg, codex, claude, claudeMarketplace, server, doctor, changelog] = await Promise.all([
    readJson("package.json"),
    readJson(".codex-plugin/plugin.json"),
    readJson(".claude-plugin/plugin.json"),
    readJson(".claude-plugin/marketplace.json"),
    readText("mcp/server.mjs"),
    readText("scripts/doctor.mjs"),
    readText("CHANGELOG.md"),
  ]);

  assert.equal(pkg.version, "0.3.0");
  assert.equal(codex.version, pkg.version);
  assert.equal(claude.version, pkg.version);
  assert.equal(claudeMarketplace.metadata.version, pkg.version);
  assert.equal(claudeMarketplace.plugins[0].version, pkg.version);
  assert.match(server, new RegExp(`version: ["']${pkg.version.replaceAll(".", "\\.")}["']`));
  assert.match(doctor, new RegExp(`contextquill: ["']${pkg.version.replaceAll(".", "\\.")}["']`));
  assert.match(changelog, new RegExp(`## ${pkg.version.replaceAll(".", "\\.")}`));
});

test("Codex and Claude marketplaces point to the public repository", async () => {
  const [codexMarketplace, claudeMarketplace, claudePlugin] = await Promise.all([
    readJson(".agents/plugins/marketplace.json"),
    readJson(".claude-plugin/marketplace.json"),
    readJson(".claude-plugin/plugin.json"),
  ]);

  assert.equal(codexMarketplace.plugins[0].source.url, "https://github.com/pitacodes/contextquill.git");
  assert.equal(claudeMarketplace.plugins[0].source.repo, "pitacodes/contextquill");
  assert.equal(claudePlugin.mcpServers.contextquill.command, "node");
  assert.deepEqual(claudePlugin.mcpServers.contextquill.args, ["${CLAUDE_PLUGIN_ROOT}/mcp/server.mjs"]);
});

test("public onboarding, safety, and automation documents are present", async () => {
  const required = [
    "README.md",
    "INSTALL.md",
    "SECURITY.md",
    "PRIVACY.md",
    "TERMS.md",
    "docs/WORK_AGENTS.md",
    "docs/AUTOMATION_PLAYBOOK.md",
    "docs/ROADMAP.md",
  ];

  for (const path of required) {
    const content = await readText(path);
    assert.ok(content.trim().length > 100, `${path} should contain useful public documentation`);
  }
});
