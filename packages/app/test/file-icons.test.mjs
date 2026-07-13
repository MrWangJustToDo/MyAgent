/**
 * Validates file icon badge helpers.
 *
 * Run: node packages/app/test/file-icons.test.mjs
 */
import assert from "node:assert/strict";

import {
  formatIconGlyph,
  getFileIconStyle,
  getFolderIconStyle,
  setNerdIconsEnabledForTesting,
} from "../dist/utils/file-icons.mjs";

setNerdIconsEnabledForTesting(false);

assert.deepEqual(getFileIconStyle("/src/app/Agent.tsx"), { glyph: "TS", color: "#3178C6" });
assert.deepEqual(getFileIconStyle("/package.json"), { glyph: "PKG", color: "#CB3837" });
assert.deepEqual(getFileIconStyle("/README.md"), { glyph: "MD", color: "#519ABA" });
assert.deepEqual(getFileIconStyle("/Dockerfile"), { glyph: "DKR", color: "#2496ED" });
assert.equal(getFileIconStyle("/Makefile").glyph, "MK");
assert.equal(getFileIconStyle("/notes").glyph, "FILE");
assert.equal(formatIconGlyph({ glyph: "TS", color: "#3178C6" }), "TS  ");
assert.equal(formatIconGlyph({ glyph: "\uE628", color: "#3178C6", nerd: true }), "\uE628 ");

setNerdIconsEnabledForTesting(false);

const collapsed = getFolderIconStyle(false, "src");
assert.equal(collapsed.chevron, "▸");
assert.equal(collapsed.glyph, "DIR+");

const expanded = getFolderIconStyle(true, "src");
assert.equal(expanded.chevron, "▾");
assert.equal(expanded.glyph, "DIR-");
assert.equal(expanded.color, "#58A6FF");

setNerdIconsEnabledForTesting(true);

const nerdCollapsed = getFolderIconStyle(false, "src");
assert.equal(nerdCollapsed.chevron, "▸");
assert.equal(nerdCollapsed.nerd, true);
assert.ok(nerdCollapsed.glyph.length >= 1);

const nerdExpanded = getFolderIconStyle(true, "src");
assert.equal(nerdExpanded.chevron, "▾");
assert.notEqual(nerdCollapsed.glyph, nerdExpanded.glyph);

const gitFolder = getFolderIconStyle(false, ".git");
assert.equal(gitFolder.nerd, true);
assert.equal(gitFolder.color, "#F05032");

setNerdIconsEnabledForTesting(true);

const nerdTs = getFileIconStyle("/src/app/Agent.tsx");
assert.equal(nerdTs.nerd, true);
assert.ok(nerdTs.glyph.length >= 1);
assert.ok(nerdTs.color.startsWith("#"));

setNerdIconsEnabledForTesting(undefined);

console.log("file-icons validation passed");
