/**
 * Publish `codent`, deriving the npm dist-tag from the package version.
 *
 * npm refuses a prerelease without an explicit `--tag` ("You must specify a tag
 * using --tag when publishing a prerelease version"), and the danger of getting
 * it wrong is asymmetric: passing `--tag latest` for a beta would promote it to
 * the default `npm install -g codent` for every user. So the tag is computed,
 * never typed — `0.0.1-beta.1` → `beta`, `1.2.3` → `latest`.
 *
 * One implementation shared by `pnpm publish:codent` and the release workflow,
 * so the two cannot disagree.
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const pkgPath = fileURLToPath(new URL("../package.json", import.meta.url));
const { version, name } = JSON.parse(readFileSync(pkgPath, "utf8"));

/**
 * `0.0.1-beta.1` → `beta`; `0.0.1-rc.2` → `rc`; `1.2.3` → `latest`.
 * The prerelease identifier is everything between the first `-` and the next `.`.
 */
function distTagFor(version) {
  if (!version.includes("-")) return "latest";
  return version.split("-")[1].split(".")[0];
}

const tag = distTagFor(version);
// Mirror what the release workflow does so a local run and CI agree.
const args = ["--filter", name, "publish", "--no-git-checks", "--tag", tag];
if (process.argv.includes("--dry-run")) args.push("--dry-run");

console.log(`[publish] ${name}@${version} → dist-tag "${tag}"`);
if (tag === "latest" && version.includes("-")) {
  console.error("[publish] refusing to publish a prerelease as `latest`");
  process.exit(1);
}

const child = spawn("pnpm", args, { stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 1));
