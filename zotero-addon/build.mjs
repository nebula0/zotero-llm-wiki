// Builds the Zotero plugin: bundles the Anthropic SDK into addon/lib, then zips addon/ into build/paper-chat.xpi
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

const { version } = JSON.parse(fs.readFileSync('addon/manifest.json', 'utf8'));
fs.mkdirSync('build', { recursive: true });
const xpi = `build/paper-chat-${version}.xpi`;
fs.rmSync(xpi, { force: true });
execFileSync('zip', ['-qr', '-X', `../${xpi}`, '.', '-x', '.*'], { cwd: 'addon' });
console.log(`Built ${xpi}`);
