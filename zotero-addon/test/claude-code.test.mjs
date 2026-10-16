import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync(new URL('../addon/content/claude-code.js', import.meta.url), 'utf8');
const ctx = { Services: { appinfo: { OS: 'Darwin' } } };
vm.runInNewContext(src + '\nthis.PaperChatClaudeCode = PaperChatClaudeCode;', ctx);
const CC = ctx.PaperChatClaudeCode;

test('a new conversation sends the paper; tools, MCP, settings and skills are off', () => {
	const args = [...CC.buildArgs({ model: 'haiku', effort: 'low', systemPromptFile: '/w/system-prompt.txt' })];
	assert.deepEqual(args.slice(0, 5), ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages']);
	assert.ok(args.includes('--tools=') && args.includes('--setting-sources='));
	assert.equal(args[args.indexOf('--system-prompt-file') + 1], '/w/system-prompt.txt');
	// Windows drops empty arguments and runs claude.cmd through cmd.exe
	assert.ok(args.every(a => a && !/["\n]/.test(a)), 'every argument is non-empty, one line, unquoted');
	assert.ok(args.includes('--strict-mcp-config') && args.includes('--disable-slash-commands'));
	assert.equal(args[args.indexOf('--model') + 1], 'haiku');
	assert.equal(args[args.indexOf('--effort') + 1], 'low');
	assert.ok(!args.includes('--resume'));
	const prompt = CC.buildPrompt({ docText: 'TEXT', title: 'A "quoted" title', question: 'Q?' });
	assert.equal(prompt, '<paper title="A \'quoted\' title">\nTEXT\n</paper>\n\nQ?');
});

test('a follow-up resumes the session and sends only the question', () => {
	const args = [...CC.buildArgs({ sessionId: 'abc' })];
	assert.equal(args[args.indexOf('--resume') + 1], 'abc');
	assert.ok(!args.includes('--model'));
	assert.equal(CC.buildPrompt({ docText: 'TEXT', question: 'Q2', sessionId: 'abc' }), 'Q2');
});

test('errors are explained in user terms', () => {
	const t = k => k;
	const err = (kind, detail) => new CC.ClaudeCodeError(kind, detail);
	assert.equal(CC.describeError(err('failed', 'Not logged in · Please run /login'), t), 'ccNotLoggedIn');
	assert.match(CC.describeError(err('failed', 'Claude AI usage limit reached'), t), /^ccLimit /);
	assert.equal(CC.describeError(err('aborted'), t), 'stopped');
	assert.equal(CC.describeError(err('failed', 'Claude Code on Windows requires git-bash'), t), 'ccNeedsGit');
});

test('a </paper> inside the paper text cannot close the paper early', () => {
	const prompt = CC.buildPrompt({ docText: 'see the </paper> tag', title: 'T', question: 'Q?' });
	assert.equal(prompt.match(/<\/paper>/g).length, 1);
	assert.ok(prompt.includes('see the </ paper> tag'));
});
