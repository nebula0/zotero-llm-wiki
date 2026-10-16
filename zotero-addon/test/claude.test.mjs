import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync(new URL('../addon/content/claude.js', import.meta.url), 'utf8');
const ctx = {};
vm.runInNewContext(src + '\nthis.PaperChatClaude = PaperChatClaude;', ctx);
const C = ctx.PaperChatClaude;
const plain = o => JSON.parse(JSON.stringify(o));

test('first question puts the cached, citable document before the question', () => {
	const req = plain(C.buildRequest({ model: 'claude-opus-5-5', effort: 'medium', docText: 'DOC', title: 'T', history: [], question: 'Q1' }));
	assert.equal(req.messages.length, 1);
	const [docBlock, q] = req.messages[0].content;
	assert.deepEqual(docBlock, {
		type: 'document', source: { type: 'text', media_type: 'text/plain', data: 'DOC' }, title: 'T',
		citations: { enabled: true }, cache_control: { type: 'ephemeral', ttl: '1h' },
	});
	assert.deepEqual(q, { type: 'text', text: 'Q1' });
	assert.deepEqual(req.output_config, { effort: 'medium' });
	assert.deepEqual(req.betas, ['server-side-fallback-2026-07-01']);
	assert.equal(req.fallbacks, 'default');
	assert.equal(req.max_tokens, 64000);
});

test('follow-ups replay history unchanged with the document still first', () => {
	const assistant = [{ type: 'thinking', thinking: '', signature: 'sig' }, { type: 'text', text: 'A1', citations: [] }];
	const history = [{ role: 'user', content: 'Q1' }, { role: 'assistant', content: assistant }];
	const req = plain(C.buildRequest({ model: 'claude-opus-5-5', docText: 'DOC', history, question: 'Q2' }));
	assert.equal(req.messages.length, 3);
	assert.equal(req.messages[0].content[0].type, 'document');
	assert.deepEqual(req.messages[0].content[1], { type: 'text', text: 'Q1' });
	assert.deepEqual(req.messages[1].content, assistant);
	assert.deepEqual(req.messages[2], { role: 'user', content: 'Q2' });
	// The stored history itself is not modified
	assert.equal(history[0].content, 'Q1');
	// Same document prefix as the first request, so the cache hits
	const first = plain(C.buildRequest({ model: 'claude-opus-5-5', docText: 'DOC', history: [], question: 'Q1' }));
	assert.deepEqual(req.messages[0].content[0], first.messages[0].content[0]);
});

test('fallbacks and effort only go to models that accept them', () => {
	const haiku = plain(C.buildRequest({ model: 'claude-haiku-4-5', effort: 'high', docText: 'D', history: [], question: 'q' }));
	assert.equal(haiku.fallbacks, undefined);
	assert.equal(haiku.betas, undefined);
	assert.equal(haiku.output_config, undefined);
	const sonnet = plain(C.buildRequest({ model: 'claude-sonnet-5-5', effort: 'low', docText: 'D', history: [], question: 'q' }));
	assert.equal(sonnet.fallbacks, 'default');
	assert.deepEqual(sonnet.output_config, { effort: 'low' });
	const haiku55 = plain(C.buildRequest({ model: 'claude-haiku-5-5', effort: 'low', docText: 'D', history: [], question: 'q' }));
	assert.equal(haiku55.fallbacks, undefined);
	assert.deepEqual(haiku55.output_config, { effort: 'low' });
});
