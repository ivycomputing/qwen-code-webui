#!/usr/bin/env node
/**
 * Adds (or no-ops for) one release section in CHANGELOG.md.
 *
 * Used two ways:
 *  - CI: the release workflow runs this for the tag being released, then
 *    commits the file. Idempotent — exits without changes if the section
 *    already exists.
 *  - Backfill: run repeatedly to reconstruct history from git tags (see the
 *    release-automation PR). Insertion is version-ordered, so backfilling an
 *    old version lands it in the right place, not at the top.
 *
 * Usage: node scripts/update-changelog.mjs v0.2.44
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const changelogPath = fileURLToPath(new URL("../CHANGELOG.md", import.meta.url));

const tag = process.argv[2];
if (!tag || !/^v\d+\.\d+\.\d+$/.test(tag)) {
  console.error("usage: node scripts/update-changelog.mjs vX.Y.Z");
  process.exit(1);
}
const version = tag.slice(1);

if (!existsSync(changelogPath)) {
  console.error("CHANGELOG.md not found");
  process.exit(1);
}

const git = (args) =>
  execFileSync("git", args, { encoding: "utf8" }).trim();

const changelog = readFileSync(changelogPath, "utf8");
if (changelog.includes(`## [${version}]`)) {
  console.log(`CHANGELOG already documents ${version}; nothing to do`);
  process.exit(0);
}

// Previous release tag in semver order (git's version sort), excluding pre-
// release-ish oddities this repo never used.
const allTags = git(["tag", "--sort=-v:refname"])
  .split("\n")
  .filter((t) => /^v\d+\.\d+\.\d+$/.test(t));
const currentIndex = allTags.indexOf(tag);
if (currentIndex === -1) {
  console.error(`tag ${tag} not found locally`);
  process.exit(1);
}
const previousTag = allTags[currentIndex + 1];

// Commit subjects between the two tags, minus version-bump noise. Merge
// commits are dropped: non-squashed PRs list their real commits anyway, and
// squash merges appear once with their (#N) subject.
const range = previousTag ? `${previousTag}..${tag}` : tag;
const subjects = git(["log", "--format=%s", range])
  .split("\n")
  .filter(Boolean)
  .filter(
    (subject) =>
      !/^(chore|fix\(release\))(\([a-z]+\))?: (bump version to|publish) /.test(
        subject,
      ),
  )
  .filter((subject) => !/^Merge (pull request |main\b|branch )/.test(subject))
  .reverse(); // oldest first, reading order

const date = git(["log", "-1", "--format=%as", tag]);

const bullets = subjects.length > 0
  ? subjects.map((subject) => `- ${subject}`)
  : ["- Version bump only."];

const section = [
  `## [${version}] - ${date}`,
  "",
  ...bullets,
  "",
].join("\n");

// Insert above the first section whose version is older than ours (keep the
// file in descending version order); above the newest section as a fallback.
const parseVersion = (header) =>
  header.slice(1).split(".").map(Number);
const compareVersions = (a, b) =>
  a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

const sectionPattern = /^## \[(\d+\.\d+\.\d+)\] .*$/gm;
let insertAt = -1;
for (const match of changelog.matchAll(sectionPattern)) {
  if (compareVersions(parseVersion(version), parseVersion(match[1])) > 0) {
    insertAt = match.index;
    break;
  }
}
if (insertAt === -1) {
  const firstSection = changelog.search(/^## \[/m);
  if (firstSection === -1) {
    console.error("CHANGELOG.md has no release section to insert before");
    process.exit(1);
  }
  insertAt = firstSection;
}

const updated =
  changelog.slice(0, insertAt) + section + "\n" + changelog.slice(insertAt);

writeFileSync(changelogPath, updated);
console.log(`documented ${version}: ${subjects.length} entries (${range})`);
