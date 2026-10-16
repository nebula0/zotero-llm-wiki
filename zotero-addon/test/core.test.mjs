import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync(new URL('../addon/content/core.js', import.meta.url), 'utf8');
const ctx = {};
vm.runInNewContext(src + '\nthis.PaperChatCore = PaperChatCore;', ctx);
const C = ctx.PaperChatCore;

// Fake structured chars: one char per letter, 6pt wide, lines 12pt apart, like the reader's getPageData()
function page(pageIndex, lines, { label, top = 700 } = {}) {
	const chars = [];
	lines.forEach((line, li) => {
		const y = top - li * 12;
		const words = line.split(' ');
		let x = 50;
		words.forEach((w, wi) => {
			[...w].forEach((c, ci) => {
				const rect = [x, y, x + 6, y + 10];
				const ch = { c, rect, inlineRect: [x, y - 1, x + 6, y + 11] };
				if (ci === w.length - 1) {
					if (wi === words.length - 1) {
						ch.lineBreakAfter = true;
						if (c === '-') ch.ignorable = true;
					}
					else ch.spaceAfter = true;
				}
				chars.push(ch);
				x += 6;
			});
			x += 3;
		});
	});
	if (chars.length) chars[chars.length - 1].paragraphBreakAfter = true;
	return { pageIndex, label, chars, viewBox: [0, 0, 612, 792] };
}

test('buildDocument joins hyphenated words and maps text back to chars', () => {
	const pages = [page(0, ['The experi-', 'mental setup.'], { label: '12' }), page(1, ['Second page.'])];
	const doc = C.buildDocument(pages);
	assert.match(doc.text, /^\[Page 12\]\nThe experimental setup\.\n\n\n\n\[Page 2\]\nSecond page\.\n\n$/);
	assert.equal(doc.text.length, doc.pageOf.length);
	const k = doc.text.indexOf('mental');
	assert.equal(doc.pageOf[k], 0);
	assert.equal(pages[0].chars[doc.charOf[k]].c, 'm');
	assert.equal(doc.pageOf[doc.text.indexOf('[Page 2]')], -1);
});

test('rangeToHighlights gives one rect per line and splits across pages', () => {
	const pages = [page(0, ['Alpha beta gamma', 'delta epsilon']), page(1, ['zeta eta theta'])];
	const doc = C.buildDocument(pages);
	const start = doc.text.indexOf('gamma');
	const end = doc.text.indexOf('eta theta') + 3;
	const hls = C.rangeToHighlights(doc, pages, start, end);
	assert.equal(hls.length, 2);
	assert.equal(hls[0].pageIndex, 0);
	assert.equal(hls[0].rects.length, 2);
	assert.equal(hls[0].text, 'gamma delta epsilon');
	assert.equal(hls[1].pageIndex, 1);
	assert.equal(hls[1].text, 'zeta eta');
	// Rect of "gamma" line starts at gamma's x, ends at the end of the line
	const gamma = pages[0].chars.find(c => c.c === 'g');
	assert.equal(hls[0].rects[0][0], gamma.inlineRect[0]);
	assert.match(hls[0].sortIndex, /^00000\|\d{6}\|\d{5}$/);
	assert.equal(hls[1].sortIndex.slice(0, 5), '00001');
});

test('a range covering only inserted text yields no highlight', () => {
	const pages = [page(0, ['One.'])];
	const doc = C.buildDocument(pages);
	assert.deepEqual([...C.rangeToHighlights(doc, pages, 0, 8)], []);
});

test('collectAnswer numbers distinct citations and moves markers before spaces', () => {
	const content = [
		{ type: 'thinking', thinking: '' },
		{ type: 'text', text: 'The model is small ' , citations: [{ type: 'char_location', start_char_index: 5, end_char_index: 20, cited_text: 'x' }] },
		{ type: 'text', text: 'and fast.', citations: [
			{ type: 'char_location', start_char_index: 30, end_char_index: 40, cited_text: 'y' },
			{ type: 'char_location', start_char_index: 5, end_char_index: 20, cited_text: 'x' },
		] },
	];
	const { markdown, cites } = C.collectAnswer(content);
	assert.equal(cites.length, 2);
	assert.equal(markdown, 'The model is small1 and fast.21');
});

test('parseMarkdown handles lists, headings, emphasis and citations', () => {
	const md = '## Result\nIt **works**1 well.\n\n- one *a*\n- two `x`\n\n1. first\n2. second';
	const blocks = C.parseMarkdown(md);
	assert.deepEqual([...blocks.map(b => b.type)], ['h', 'p', 'ul', 'ol']);
	const p = blocks[1].inline;
	assert.equal(p[1].t, 'b');
	assert.deepEqual({ ...p[2] }, { t: 'cite', n: 1 });
	assert.equal(blocks[2].items.length, 2);
	assert.equal(blocks[2].items[0][1].t, 'i');
	assert.equal(blocks[3].items[1][0].v, 'second');
});

test('markdownToHTML escapes text and renders citation links', () => {
	const html = C.markdownToHTML('a < b1', n => `<sup>[${n}]</sup>`);
	assert.equal(html, '<p>a &lt; b<sup>[1]</sup></p>');
});

test('buildNoteHTML lists questions with colored labels and links', () => {
	const turns = [{
		n: 1, color: '#ffd400', question: 'What <is> it?', answerMarkdown: 'It is X1.',
		cites: [{ n: 1, highlights: [{ pageLabel: '3', text: 'X is defined', annotationKey: 'ABCD2345' }] }],
	}, { n: 2, hidden: true, color: '#2ea8e5', question: 'gone', answerMarkdown: 'z', cites: [] }];
	const html = C.buildNoteHTML({ title: 'Paper', turns, linkFor: () => 'zotero://open-pdf/library/items/K?annotation=A' });
	assert.match(html, /What &lt;is&gt; it\?/);
	assert.match(html, /rgba\(255, 212, 0, 0.5\)/);
	assert.match(html, /<a href="zotero:\/\/open-pdf\/library\/items\/K\?annotation=A">\[p\.3\]<\/a>/);
	assert.doesNotMatch(html, /gone/);
});

test('colorFor cycles and hashText changes with content', () => {
	assert.equal(C.colorFor(1), '#ffd400');
	assert.equal(C.colorFor(8), '#ffd400');
	assert.notEqual(C.hashText('a'), C.hashText('b'));
});

test('findQuote ignores spacing, case, punctuation, hyphenation and ligatures', () => {
	const pages = [page(0, ['The ﬁnal experi-', 'mental results, shown here,', 'are strong.'])];
	const doc = C.buildDocument(pages);
	const index = C.buildMatchIndex(doc);
	const hit = C.findQuote(index, 'the final experimental results shown here are strong');
	assert.ok(hit);
	assert.equal(doc.text.slice(hit.start, hit.end), 'The ﬁnal experimental results, shown here, are strong.');
	assert.equal(C.findQuote(index, 'something the paper never says at all'), null);
});

test('findQuote handles an ellipsis and a slightly misquoted middle', () => {
	const pages = [page(0, ['We train each model for 100k steps with a batch size of 64 on eight GPUs for two weeks.'])];
	const doc = C.buildDocument(pages);
	const index = C.buildMatchIndex(doc);
	const a = C.findQuote(index, 'We train each model … on eight GPUs');
	assert.equal(doc.text.slice(a.start, a.end), 'We train each model for 100k steps with a batch size of 64 on eight GPUs');
	const b = C.findQuote(index, 'We train each model for 100,000 steps with a batch size of 64 on eight GPUs');
	assert.equal(doc.text.slice(b.start, b.end), 'We train each model for 100k steps with a batch size of 64 on eight GPUs');
});

test('page markers are not matched as paper text', () => {
	const pages = [page(0, ['Alpha.'], { label: '7' })];
	const doc = C.buildDocument(pages);
	assert.equal(C.findQuote(C.buildMatchIndex(doc), 'Page 7 Alpha'), null);
});

test('quotedAnswerToContent turns inline quotes into citations, unmatched ones flagged', () => {
	const pages = [page(0, ['Cats sleep sixteen hours a day.', 'Dogs sleep twelve.'])];
	const doc = C.buildDocument(pages);
	const index = C.buildMatchIndex(doc);
	const text = '貓一天睡 16 小時 ⟦Cats sleep sixteen hours a day.⟧。狗不一定 ⟦Dogs never sleep⟧';
	const content = C.quotedAnswerToContent(text, doc, index);
	assert.equal(content[0].text, '貓一天睡 16 小時');
	assert.equal(content[0].citations[0].type, 'char_location');
	assert.equal(content[0].citations[0].cited_text, 'Cats sleep sixteen hours a day.');
	assert.equal(content[1].citations[0].type, 'unmatched_quote');
	const { markdown, cites } = C.collectAnswer(content);
	assert.equal(markdown, '貓一天睡 16 小時\uE0001\uE001。狗不一定\uE0002\uE001');
	assert.equal(cites[1].start, -1);
	assert.equal(C.rangeToHighlights(doc, pages, -1, -1).length, 0);
});

test('streamingDisplay hides quotes, including one still being written', () => {
	assert.equal(C.streamingDisplay('A ⟦quote one⟧ and B ⟦half a quo'), 'A  and B ');
});
