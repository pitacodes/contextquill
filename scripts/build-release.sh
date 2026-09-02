#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
STAGE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/contextquill-release.XXXXXX")"

cleanup() {
  rm -rf "$STAGE_DIR"
}
trap cleanup EXIT

PLUGIN_DIR="$STAGE_DIR/contextquill"
mkdir -p "$PLUGIN_DIR" "$DIST_DIR"

copy_into_plugin() {
  for item in "$@"; do
    cp -R "$ROOT_DIR/$item" "$PLUGIN_DIR/$item"
  done
}

copy_into_plugin \
  .codex-plugin \
  .claude-plugin \
  .mcp.json \
  assets \
  skills \
  mcp \
  lib \
  scripts \
  packaging \
  docs \
  package.json \
  README.md \
  INSTALL.md \
  LICENSE \
  PRIVACY.md \
  SECURITY.md \
  SUPPORT.md \
  TERMS.md \
  CHANGELOG.md

# Keep release archives free of empty internal directories left by removed files.
find "$PLUGIN_DIR" -type d -empty -delete

rm -f "$DIST_DIR/contextquill-plugin.zip" "$DIST_DIR/contextquill-codex-marketplace.zip"
(
  cd "$STAGE_DIR"
  zip -qr "$DIST_DIR/contextquill-plugin.zip" contextquill
)

CODEX_MARKETPLACE_DIR="$STAGE_DIR/contextquill-marketplace"
mkdir -p "$CODEX_MARKETPLACE_DIR/.agents/plugins" "$CODEX_MARKETPLACE_DIR/plugins"
cp "$ROOT_DIR/packaging/codex-marketplace.json" "$CODEX_MARKETPLACE_DIR/.agents/plugins/marketplace.json"
cp -R "$PLUGIN_DIR" "$CODEX_MARKETPLACE_DIR/plugins/contextquill"
(
  cd "$STAGE_DIR"
  zip -qr "$DIST_DIR/contextquill-codex-marketplace.zip" contextquill-marketplace
)

printf 'Built:\n  %s\n  %s\n' \
  "$DIST_DIR/contextquill-plugin.zip" \
  "$DIST_DIR/contextquill-codex-marketplace.zip"
