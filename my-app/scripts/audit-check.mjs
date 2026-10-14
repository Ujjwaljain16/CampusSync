#!/usr/bin/env node
/**
 * Dependency audit gate for CI.
 *
 * Runs `npm audit --omit=dev --json` and fails when any HIGH or CRITICAL advisory remains that is not
 * explicitly accepted in `audit-allowlist.json`. Every accepted advisory carries a written reason and a
 * review-by date; once the date passes the entry stops being honoured and the build fails again, so an
 * exception cannot be forgotten.
 *
 * Usage: node scripts/audit-check.mjs [--level=high|critical]
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const levelArg = process.argv.find((a) => a.startsWith('--level='));
const level = levelArg ? levelArg.split('=')[1] : 'high';
const RANK = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };
if (!(level in RANK)) {
  console.error(`Unknown --level=${level}`);
  process.exit(2);
}

const allowlistPath = join(root, 'audit-allowlist.json');
const allowlist = existsSync(allowlistPath) ? JSON.parse(readFileSync(allowlistPath, 'utf8')) : { accepted: [] };
const today = new Date().toISOString().slice(0, 10);

const accepted = new Map();
let expired = 0;
for (const entry of allowlist.accepted ?? []) {
  if (!entry.id || !entry.reason || !entry.reviewBy) {
    console.error(`audit-allowlist.json: entry needs id, reason and reviewBy: ${JSON.stringify(entry)}`);
    process.exit(2);
  }
  if (entry.reviewBy < today) {
    expired += 1;
    console.error(`EXPIRED exception ${entry.id} (review-by ${entry.reviewBy}): ${entry.reason}`);
    continue;
  }
  accepted.set(entry.id, entry);
}

const run = spawnSync('npm', ['audit', '--omit=dev', '--json'], { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' });
let report;
try {
  report = JSON.parse(run.stdout);
} catch {
  console.error('Could not parse `npm audit --json` output:');
  console.error(run.stdout || run.stderr);
  process.exit(2);
}
if (report.error) {
  console.error(`npm audit failed: ${report.error.summary ?? JSON.stringify(report.error)}`);
  process.exit(2);
}

// Collect every advisory object referenced by any vulnerable package.
const advisories = new Map();
for (const [pkg, vuln] of Object.entries(report.vulnerabilities ?? {})) {
  for (const via of vuln.via ?? []) {
    if (typeof via !== 'object') continue; // string = "depends on another vulnerable package"
    const id = String(via.url ?? '').split('/').pop() || String(via.source);
    if (!advisories.has(id)) advisories.set(id, { id, pkg: via.name ?? pkg, severity: via.severity, title: via.title, url: via.url });
  }
}

const blocking = [];
const waived = [];
for (const adv of advisories.values()) {
  if (RANK[adv.severity] < RANK[level]) continue;
  if (accepted.has(adv.id)) waived.push(adv);
  else blocking.push(adv);
}

for (const adv of waived) {
  const e = accepted.get(adv.id);
  console.log(`accepted  ${adv.severity.padEnd(8)} ${adv.id}  ${adv.pkg}: ${adv.title}\n          reason: ${e.reason}\n          review by: ${e.reviewBy}`);
}
for (const adv of blocking) {
  console.error(`BLOCKING  ${adv.severity.padEnd(8)} ${adv.id}  ${adv.pkg}: ${adv.title}\n          ${adv.url}`);
}

if (blocking.length > 0 || expired > 0) {
  console.error(`\naudit gate FAILED: ${blocking.length} unaccepted ${level}+ advisories, ${expired} expired exceptions.`);
  process.exit(1);
}
console.log(`\naudit gate passed: no unaccepted ${level}+ advisories (${waived.length} accepted with review dates).`);
