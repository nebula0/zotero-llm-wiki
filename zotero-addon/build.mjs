// Builds the Zotero plugin: bundles the Anthropic SDK into addon/lib, then zips addon/ into build/paper-chat.xpi.
// Also writes build/paper-chat-updates.json, the manifest's update_url; both go on the GitHub release.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

await build({
	entryPoints: ['src/anthropic-entry.js'],
	bundle: true,
	format: 'iife',
	platform: 'browser',
	target: 'firefox128',
	outfile: 'addon/lib/anthropic.js',
	logLevel: 'warning',
});

const manifest = JSON.parse(fs.readFileSync('addon/manifest.json', 'utf8'));
const { version } = manifest;
const { id, strict_min_version } = manifest.applications.zotero;
fs.rmSync('build', { recursive: true, force: true });
fs.mkdirSync('build');
// A fixed name, so the README can link to releases/latest/download/paper-chat.xpi
const xpi = 'build/paper-chat.xpi';
execFileSync('zip', ['-qr', '-X', `../${xpi}`, '.', '-x', '.*'], { cwd: 'addon' });

// Zotero checks this for updates; the link names the release tag (pass it as RELEASE_TAG)
const tag = process.env.RELEASE_TAG;
const link = tag
	? `https://github.com/nebula0/zotero-llm-wiki/releases/download/${tag}/paper-chat.xpi`
	: 'https://github.com/nebula0/zotero-llm-wiki/releases/latest/download/paper-chat.xpi';
const updates = { addons: { [id]: { updates: [{ version, update_link: link, applications: { zotero: { strict_min_version } } }] } } };
fs.writeFileSync('build/paper-chat-updates.json', JSON.stringify(updates, null, 2) + '\n');
console.log(`Built ${xpi} (version ${version})`);
