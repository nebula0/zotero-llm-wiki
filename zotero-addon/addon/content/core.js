/* Paper Chat core: pure functions with no Zotero dependency, shared by the plugin and the node tests.
 *
 * The flow it supports:
 *   PDF pages (Zotero reader's structured chars) -> buildDocument() -> plain text sent to Claude as a
 *   citable document -> Claude's char_location citations -> rangeToHighlights() -> annotation rects.
 * Because we build the text ourselves, every citation maps back to exact characters on the page;
 * no fuzzy matching is needed.
 */
var PaperChatCore = (function () {
	// Zotero's reader palette minus grey, which paper-ask uses for its own AI highlights
	const COLORS = ['#ffd400', '#2ea8e5', '#5fb236', '#a28ae5', '#f19837', '#e56eee', '#ff6666'];
	const CITE_OPEN = '';
	const CITE_CLOSE = '';

	function colorFor(n) {
		return COLORS[(n - 1) % COLORS.length];
	}

	/**
	 * Turn the reader's per-page structured chars into one text plus a char-by-char map back to the PDF.
	 * @param {Array<{pageIndex:number, label?:string, chars:Array}>} pages
	 * @returns {{text:string, pageOf:Int32Array, charOf:Int32Array}} pageOf/charOf are -1 for text we
	 *   inserted ourselves (page markers, spaces, paragraph breaks)
	 */
	function buildDocument(pages) {
		const parts = [];
		const pageOf = [];
		const charOf = [];
		const push = (str, p, c) => {
			parts.push(str);
			for (let k = 0; k < str.length; k++) {
				pageOf.push(p);
				charOf.push(c);
			}
		};
		for (const page of pages) {
			push(`${pageOf.length ? '\n\n' : ''}[Page ${page.label || page.pageIndex + 1}]\n`, -1, -1);
			const chars = page.chars || [];
			for (let i = 0; i < chars.length; i++) {
				const ch = chars[i];
				// A hyphen at a line end ("experi-\nmental") is marked ignorable; dropping it rejoins the word
				if (ch.ignorable) continue;
				push(ch.c, page.pageIndex, i);
				if (ch.paragraphBreakAfter) push('\n\n', -1, -1);
				else if (ch.lineBreakAfter || ch.spaceAfter) push(' ', -1, -1);
			}
		}
		return { text: parts.join(''), pageOf: Int32Array.from(pageOf), charOf: Int32Array.from(charOf) };
	}

	/** Line rects for a run of chars, the same way the Zotero reader builds a highlight from a selection */
	function rectsFromChars(chars) {
		const lines = [];
		let cur = null;
		for (const ch of chars) {
			const r = ch.inlineRect || ch.rect;
			cur = cur ? [Math.min(cur[0], r[0]), Math.min(cur[1], r[1]), Math.max(cur[2], r[2]), Math.max(cur[3], r[3])] : r.slice();
			if (ch.lineBreakAfter) {
				lines.push(cur);
				cur = null;
			}
		}
		if (cur) lines.push(cur);
		return lines.map(r => r.map(v => Math.round(v * 1000) / 1000));
	}

	function pad(n, w) {
		return String(Math.max(0, Math.floor(n))).slice(0, w).padStart(w, '0');
	}

	/**
	 * Map a [start, end) range of the document text to one highlight per page it touches.
	 * @returns {Array<{pageIndex, pageLabel, rects, text, sortIndex}>}
	 */
	function rangeToHighlights(doc, pages, start, end) {
		const byPage = new Map();
		end = Math.min(end, doc.text.length);
		for (let k = Math.max(0, start); k < end; k++) {
			const p = doc.pageOf[k];
			if (p < 0) continue;
			const c = doc.charOf[k];
			const e = byPage.get(p);
			if (!e) byPage.set(p, { min: c, max: c, first: k, last: k });
			else {
				e.min = Math.min(e.min, c);
				e.max = Math.max(e.max, c);
				e.last = k;
			}
		}
		const pageByIndex = new Map(pages.map(p => [p.pageIndex, p]));
		const out = [];
		for (const [pageIndex, e] of byPage) {
			const page = pageByIndex.get(pageIndex);
			if (!page) continue;
			const rects = rectsFromChars(page.chars.slice(e.min, e.max + 1));
			if (!rects.length) continue;
			const vb = page.viewBox || [0, 0, 0, 0];
			const topRect = rects.reduce((a, b) => (b[3] > a[3] ? b : a));
			out.push({
				pageIndex,
				pageLabel: String(page.label || pageIndex + 1),
				rects,
				text: doc.text.slice(e.first, e.last + 1).replace(/\s+/g, ' ').trim(),
				sortIndex: [pad(pageIndex, 5), pad(e.min, 6), pad(vb[3] - vb[1] - topRect[3], 5)].join('|'),
			});
		}
		return out.sort((a, b) => a.pageIndex - b.pageIndex);
	}

	// ---- Quotes written inline by the model (the Claude Code path, which has no citations API) ----

	const QUOTE_RE = /⟦([^⟧]*)⟧/g; // ⟦exact words from the paper⟧

	/**
	 * Letters and digits of the document only, lowercased and NFKC-normalized (so ligatures, spacing,
	 * punctuation and line-end hyphens don't matter), with a map back to document offsets.
	 * Text we inserted ourselves (page markers) is left out.
	 */
	function buildMatchIndex(doc) {
		const norm = [];
		const map = [];
		const keep = /[\p{L}\p{N}]/u;
		for (let i = 0; i < doc.text.length; i++) {
			if (doc.pageOf && doc.pageOf[i] < 0) continue;
			for (const ch of doc.text[i].normalize('NFKC').toLowerCase()) {
				if (keep.test(ch)) {
					norm.push(ch);
					map.push(i);
				}
			}
		}
		return { norm: norm.join(''), map: Int32Array.from(map), text: doc.text };
	}

	function normalizeQuote(s) {
		return [...String(s).normalize('NFKC').toLowerCase()].filter(ch => /[\p{L}\p{N}]/u.test(ch)).join('');
	}

	/**
	 * Find a quote in the document.
	 * @returns {{start:number, end:number}|null} document offsets, end exclusive
	 */
	function findQuote(index, quote) {
		// End after closing punctuation too, so a highlighted sentence includes its period
		const toRange = (a, b) => {
			let end = index.map[b - 1] + 1;
			while (index.text && /[.,;:!?)\]”’"'。，；：！？）]/.test(index.text[end] || '')) end++;
			return { start: index.map[a], end };
		};
		const parts = String(quote).split(/\.\.\.|…|\[\s*\.\.\.\s*\]/).map(normalizeQuote).filter(p => p.length >= 4);
		if (!parts.length) return null;
		const whole = parts.join('');
		let at = index.norm.indexOf(whole);
		if (at >= 0) return toRange(at, at + whole.length);
		// Quote with an ellipsis: first part, then the last part shortly after
		if (parts.length > 1) {
			const first = parts[0];
			const last = parts[parts.length - 1];
			for (let a = index.norm.indexOf(first); a >= 0; a = index.norm.indexOf(first, a + 1)) {
				const b = index.norm.indexOf(last, a + first.length);
				if (b >= 0 && b - a <= whole.length * 3 + 200) return toRange(a, b + last.length);
			}
		}
		// Slightly misquoted: anchor on the opening and closing words, with a length close to the quote's
		if (whole.length >= 30) {
			const head = whole.slice(0, 20);
			const tail = whole.slice(-20);
			for (let a = index.norm.indexOf(head); a >= 0; a = index.norm.indexOf(head, a + 1)) {
				const b = index.norm.indexOf(tail, a + head.length);
				const len = b + tail.length - a;
				if (b >= 0 && len <= whole.length * 1.3 && len >= whole.length * 0.7) return toRange(a, b + tail.length);
			}
		}
		return null;
	}

	/**
	 * Turn an answer with inline ⟦quotes⟧ into the same content shape the citations API returns, so
	 * both paths share collectAnswer(). Each quote becomes a citation on the text before it.
	 */
	function quotedAnswerToContent(text, doc, index) {
		const blocks = [];
		let last = 0;
		let m;
		QUOTE_RE.lastIndex = 0;
		while ((m = QUOTE_RE.exec(text))) {
			// The citation link goes right after the words, so drop the space before the quote
			const before = text.slice(last, m.index).replace(/[ \t]+$/, '');
			if (before || !blocks.length) blocks.push({ type: 'text', text: before, citations: [] });
			const quote = m[1].trim();
			const hit = quote && findQuote(index, quote);
			blocks[blocks.length - 1].citations.push(hit
				? { type: 'char_location', start_char_index: hit.start, end_char_index: hit.end, cited_text: doc.text.slice(hit.start, hit.end) }
				: { type: 'unmatched_quote', cited_text: quote });
			last = QUOTE_RE.lastIndex;
		}
		if (last < text.length) blocks.push({ type: 'text', text: text.slice(last), citations: [] });
		// "the window is 128 tokens ⟦…⟧." leaves the citation before a space; tidy the joins
		for (let i = 1; i < blocks.length; i++) {
			if (blocks[i - 1].citations.length && /^\s+[.,;:!?。，；：！？)]/.test(blocks[i].text)) {
				blocks[i].text = blocks[i].text.replace(/^\s+/, '');
			}
		}
		return blocks;
	}

	/** What to show while the answer streams in: finished quotes hidden, an unfinished one cut off */
	function streamingDisplay(text) {
		return text.replace(QUOTE_RE, '').replace(/⟦[^⟧]*$/, '');
	}

	/**
	 * Flatten Claude's content blocks into Markdown with citation markers, numbering each distinct
	 * cited range once. Quotes that could not be found in the PDF get a number but no range.
	 * @returns {{markdown:string, cites:Array<{n, start, end, citedText}>}}
	 */
	function collectAnswer(content) {
		let markdown = '';
		const cites = [];
		const byRange = new Map();
		for (const block of content || []) {
			if (block.type !== 'text') continue;
			markdown += block.text;
			for (const c of block.citations || []) {
				let key;
				let range;
				if (c.type === 'char_location') {
					key = `${c.start_char_index}-${c.end_char_index}`;
					range = [c.start_char_index, c.end_char_index];
				}
				else if (c.type === 'unmatched_quote') {
					key = 'q:' + c.cited_text;
					range = [-1, -1];
				}
				else continue;
				let cite = byRange.get(key);
				if (!cite) {
					cite = { n: cites.length + 1, start: range[0], end: range[1], citedText: c.cited_text };
					byRange.set(key, cite);
					cites.push(cite);
				}
				markdown += CITE_OPEN + cite.n + CITE_CLOSE;
			}
		}
		// Markers that landed after a sentence's trailing space read better before it
		markdown = markdown.replace(/([ \t]+)((?:\d+)+)/g, '$2$1');
		return { markdown, cites };
	}

	// ---- Minimal Markdown: paragraphs, headings, lists, **bold**, *italic*, `code`, citation markers ----

	function parseInline(s) {
		const out = [];
		const re = /\*\*([^*]+?)\*\*|`([^`]+)`|\*([^*\s][^*]*?)\*|(\d+)/g;
		let last = 0;
		let m;
		while ((m = re.exec(s))) {
			if (m.index > last) out.push({ t: 'text', v: s.slice(last, m.index) });
			if (m[1] !== undefined) out.push({ t: 'b', c: parseInline(m[1]) });
			else if (m[2] !== undefined) out.push({ t: 'code', v: m[2] });
			else if (m[3] !== undefined) out.push({ t: 'i', c: parseInline(m[3]) });
			else out.push({ t: 'cite', n: Number(m[4]) });
			last = re.lastIndex;
		}
		if (last < s.length) out.push({ t: 'text', v: s.slice(last) });
		return out;
	}

	/** @returns {Array<{type:'p'|'h'|'ul'|'ol', inline?, items?}>} */
	function parseMarkdown(md) {
		const blocks = [];
		let para = [];
		let list = null;
		const flushPara = () => {
			if (para.length) blocks.push({ type: 'p', inline: parseInline(para.join('\n')) });
			para = [];
		};
		const flushList = () => {
			if (list) blocks.push(list);
			list = null;
		};
		for (const raw of md.replace(/\r\n?/g, '\n').split('\n')) {
			const line = raw.trimEnd();
			let m;
			if (!line.trim()) {
				flushPara();
				flushList();
			}
			else if ((m = line.match(/^\s*#{1,6}\s+(.*)$/))) {
				flushPara();
				flushList();
				blocks.push({ type: 'h', inline: parseInline(m[1]) });
			}
			else if ((m = line.match(/^\s*(?:[-*•])\s+(.*)$/)) || (m = line.match(/^\s*(\d+)[.)]\s+(.*)$/))) {
				const ordered = m.length === 3;
				const text = ordered ? m[2] : m[1];
				flushPara();
				if (!list || list.type !== (ordered ? 'ol' : 'ul')) {
					flushList();
					list = { type: ordered ? 'ol' : 'ul', items: [] };
				}
				list.items.push(parseInline(text));
			}
			else if (list && /^\s{2,}\S/.test(raw)) {
				// Continuation line of the previous list item
				const item = list.items[list.items.length - 1];
				item.push({ t: 'text', v: ' ' }, ...parseInline(line.trim()));
			}
			else {
				flushList();
				para.push(line);
			}
		}
		flushPara();
		flushList();
		return blocks;
	}

	function escapeHTML(s) {
		return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
	}

	function inlineToHTML(nodes, citeHTML) {
		return nodes.map((n) => {
			switch (n.t) {
				case 'text': return escapeHTML(n.v).replace(/\n/g, '<br/>');
				case 'b': return `<strong>${inlineToHTML(n.c, citeHTML)}</strong>`;
				case 'i': return `<em>${inlineToHTML(n.c, citeHTML)}</em>`;
				case 'code': return `<code>${escapeHTML(n.v)}</code>`;
				case 'cite': return citeHTML(n.n);
			}
			return '';
		}).join('');
	}

	function markdownToHTML(md, citeHTML) {
		return parseMarkdown(md).map((b) => {
			if (b.type === 'p') return `<p>${inlineToHTML(b.inline, citeHTML)}</p>`;
			if (b.type === 'h') return `<p><strong>${inlineToHTML(b.inline, citeHTML)}</strong></p>`;
			const items = b.items.map(it => `<li>${inlineToHTML(it, citeHTML)}</li>`).join('');
			return `<${b.type}>${items}</${b.type}>`;
		}).join('\n');
	}

	/** Translucent version of a #rrggbb color, for note backgrounds */
	function tint(hex, alpha) {
		const v = parseInt(hex.slice(1), 16);
		return `rgba(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}, ${alpha})`;
	}

	/**
	 * HTML for the Zotero note that mirrors the conversation.
	 * @param {Function} linkFor (turn, cite) -> zotero://open-pdf URL
	 */
	function buildNoteHTML({ title, turns, linkFor, strings }) {
		const s = strings || {};
		const parts = [`<h1>${escapeHTML(s.noteTitle || 'AI Q&A')}: ${escapeHTML(title || '')}</h1>`];
		for (const turn of turns) {
			if (turn.hidden || !turn.answerMarkdown) continue;
			parts.push(`<h2><span style="background-color: ${tint(turn.color, 0.5)}">Q${turn.n}</span> ${escapeHTML(turn.question)}</h2>`);
			const citeHTML = (n) => {
				const cite = turn.cites.find(c => c.n === n);
				if (!cite) return '';
				const hl = cite.highlights && cite.highlights[0];
				const label = hl ? `p.${escapeHTML(hl.pageLabel)}` : String(n);
				return `<sup><a href="${escapeHTML(linkFor(turn, cite))}">[${label}]</a></sup>`;
			};
			parts.push(markdownToHTML(turn.answerMarkdown, citeHTML));
			const quotes = turn.cites.filter(c => c.highlights && c.highlights.length);
			if (quotes.length) {
				parts.push(`<p><em>${escapeHTML(s.noteQuotes || 'Quoted passages')}</em></p>`);
				parts.push('<ol>' + quotes.map(c =>
					`<li><a href="${escapeHTML(linkFor(turn, c))}">p.${escapeHTML(c.highlights[0].pageLabel)}</a> “${escapeHTML(c.highlights.map(h => h.text).join(' … '))}”</li>`
				).join('') + '</ol>');
			}
		}
		return `<div data-schema-version="9">${parts.join('\n')}</div>`;
	}

	/** FNV-1a, enough to notice that the extracted text changed between sessions */
	function hashText(s) {
		let h = 0x811c9dc5;
		for (let i = 0; i < s.length; i++) {
			h ^= s.charCodeAt(i);
			h = Math.imul(h, 0x01000193);
		}
		return (h >>> 0).toString(16) + ':' + s.length;
	}

	return {
		COLORS, colorFor, buildDocument, rectsFromChars, rangeToHighlights, collectAnswer,
		buildMatchIndex, findQuote, quotedAnswerToContent, streamingDisplay,
		parseInline, parseMarkdown, markdownToHTML, escapeHTML, buildNoteHTML, hashText, tint,
	};
})();

if (typeof module !== 'undefined') module.exports = PaperChatCore;
