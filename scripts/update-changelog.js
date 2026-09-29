#!/usr/bin/env node
/**
 * Adds (or refreshes nothing for) one release section in CHANGELOG.md.
 *
 * Used two ways:
 *  - CI: the release workflow runs this for the tag being released, then
 *    commits the file. Idempotent — exits without changes if the section
 *    already exists.
 *  - Backfill: run repeatedly in ascending version order to reconstruct
 *    history from git tags (see the release-automation PR).
 *
 * Usage: node scripts/update-changelog.js v0.2.44
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const changelogPath = new URL("../CHANGELOG.md", import.meta.url).pathname;

const tag = process.argv[2];
if (!tag || !/^v\d+\.\d+\.\d+$/.test(tag)) {
  console.error("usage: node scripts/update-changelog.js vX.Y.Z");
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
  .filter((subject) => !/^chore: bump version to /.test(subject))
  .filter((subject) => !/^Merge pull request /.test(subject))
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

// Insert directly above the newest existing release section.
const firstSection = changelog.search(/^## \[/m);
if (firstSection === -1) {
  console.error("CHANGELOG.md has no release section to insert before");
  process.exit(1);
}
const updated =
  changelog.slice(0, firstSection) +
  section +
  "\n" +
  changelog.slice(firstSection);

writeFileSync(changelogPath, updated);
console.log(`documented ${version}: ${subjects.length} entries (${range})`);
