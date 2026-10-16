/* Paper Chat: the Zotero side. A section in the item pane (right side of the reader) where you ask
 * Claude about the open PDF. Each question gets its own highlight color; every citation in the answer
 * becomes a highlight in the PDF and a link that jumps to it.
 *
 * Depends on core.js (PaperChatCore), claude.js (PaperChatClaude) and lib/anthropic.js (Anthropic).
 */

// Errors whose message is already meant for the user
var UserError = class extends Error {};

var PaperChat = {
	id: null,
	version: null,
	rootURI: null,
	paneID: null,
	PREF: 'extensions.paper-chat.',
	TAG: 'paper-chat',
	LOGIN_HOST: 'chrome://paper-chat',
	LOGIN_REALM: 'Anthropic API Key',
	HTML_NS: 'http://www.w3.org/1999/xhtml',

	// The two ways to reach Claude; properties so the end-to-end test can stand in fakes
	claude: PaperChatClaude,
	claudeCode: PaperChatClaudeCode,
	ccInfo: null, // { binary, dirs } once detected
	sessions: new Map(), // attachment item ID -> session
	bodies: new Set(), // live section bodies

	STRINGS: {
		en: {
			placeholder: 'Ask about this paper… (Enter to send, Shift+Enter for a new line)',
			send: 'Ask', stop: 'Stop', newThread: 'New conversation', settings: 'Settings',
			threadDivider: 'New conversation',
			empty: 'Ask a question about this paper. Each question gets its own highlight color, and every quoted passage is highlighted in the PDF; click p.N in an answer to jump there.',
			openPDF: 'Open the PDF to ask questions', noPDF: 'This item has no PDF.',
			readingPDF: 'Reading the PDF text…', readingPage: 'Reading the PDF text… page {0}/{1}',
			thinking: 'Claude is thinking…', highlighting: 'Adding highlights…',
			noText: 'This PDF has no text layer (it may be a scan). Run OCR on it first.',
			tooLong: 'This PDF is too long to send in one request.',
			refusal: 'Claude declined to answer this question.',
			truncated: '(The answer was cut off at the length limit.)',
			deleteTurn: 'Remove', deleteConfirm: 'Remove Q{0} and its highlights?',
			tokens: 'in {0} (cached {1}) · out {2}',
			apiKey: 'Anthropic API key', apiKeySaved: 'saved — leave blank to keep it',
			getKey: 'Get an API key', clearKey: 'Remove the saved key', model: 'Model', effort: 'Effort', autoNote: 'Keep a note of the Q&A under the item',
			save: 'Save', saved: 'Saved', needKey: 'Add your Anthropic API key to start.',
			askSelection: 'Ask Claude', notEditable: 'This library is read-only, so no highlights were added.',
			errAuth: 'The API key was rejected. Check it in Settings.',
			errPermission: 'This API key cannot use that model.',
			errModel: 'Model not found. Check the model name in Settings.',
			errRate: 'Rate limited by the API. Wait a moment and try again.',
			errBadRequest: 'The API rejected the request.',
			errNetwork: 'Could not reach the Claude API. Check your connection.',
			stopped: 'Stopped.',
			noteTitle: 'AI Q&A', noteQuotes: 'Quoted passages',
			noteWarning: 'Written by Paper Chat; edits here are overwritten when you ask the next question.',
			noHighlight: 'Could not place this quote in the PDF',
			backend: 'Use', backendAuto: 'Automatic (Claude Code if installed, otherwise API key)',
			backendCC: 'Claude Code (your Claude subscription)', backendAPI: 'Anthropic API key (billed per use)',
			ccSection: 'Claude Code', apiSection: 'Anthropic API',
			ccFound: 'Found: {0}', ccMissing: 'Claude Code not found. Install it, or enter its path below.',
			ccPath: 'Path to claude (optional)', ccAccount: 'Account (config folder)', ccAccountDefault: 'Default (~/.claude)',
			ccModel: 'Model', modelDefault: 'Claude Code default',
			needSetup: 'Set up Claude Code or an API key to start.',
			ccNotFound: 'Claude Code was not found. Set its path in Settings, or switch to an API key.',
			ccNotLoggedIn: 'Claude Code is not logged in for this account. Run `claude` in a terminal and log in, or pick another account in Settings.',
			ccLimit: 'Your Claude usage limit was reached.', ccFailed: 'Claude Code failed:',
			viaCC: 'subscription', viaAPI: 'API',
		},
		zh: {
			placeholder: '問這篇論文的問題…（Enter 送出，Shift+Enter 換行）',
			send: '提問', stop: '停止', newThread: '開新對話', settings: '設定',
			threadDivider: '新對話',
			empty: '針對這篇論文提問。每個問題有自己的螢光筆顏色，回答引用的段落會在 PDF 上畫起來；點回答裡的 p.N 就會跳到那裡。',
			openPDF: '打開 PDF 才能提問', noPDF: '這個項目沒有 PDF。',
			readingPDF: '正在讀取 PDF 文字…', readingPage: '正在讀取 PDF 文字… 第 {0}/{1} 頁',
			thinking: 'Claude 思考中…', highlighting: '正在畫螢光筆…',
			noText: '這份 PDF 沒有文字層（可能是掃描檔），請先做 OCR。',
			tooLong: '這份 PDF 太長，無法一次送出。',
			refusal: 'Claude 拒絕回答這個問題。',
			truncated: '（回答超過長度上限，被截斷了。）',
			deleteTurn: '移除', deleteConfirm: '移除 Q{0} 和它的螢光筆？',
			tokens: '輸入 {0}（快取 {1}）· 輸出 {2}',
			apiKey: 'Anthropic API key', apiKeySaved: '已儲存，留空就沿用',
			getKey: '取得 API key', clearKey: '刪除已儲存的 key', model: '模型', effort: '思考程度', autoNote: '在項目下保存問答筆記',
			save: '儲存', saved: '已儲存', needKey: '先填入 Anthropic API key 才能開始。',
			askSelection: '問 Claude', notEditable: '這個文獻庫是唯讀的，所以沒有畫螢光筆。',
			errAuth: 'API key 無效，請到設定檢查。',
			errPermission: '這把 API key 不能使用這個模型。',
			errModel: '找不到這個模型，請到設定檢查模型名稱。',
			errRate: 'API 使用量達到上限，請稍後再試。',
			errBadRequest: 'API 拒絕了這個請求。',
			errNetwork: '連不到 Claude API，請檢查網路。',
			stopped: '已停止。',
			noteTitle: 'AI 問答', noteQuotes: '引用段落',
			noteWarning: '此筆記由 Paper Chat 自動產生，下次提問時會覆寫，手動修改會消失。',
			noHighlight: '這段引文無法對應到 PDF 位置',
			backend: '使用方式', backendAuto: '自動（有裝 Claude Code 就用它，否則用 API key）',
			backendCC: 'Claude Code（用你的 Claude 訂閱）', backendAPI: 'Anthropic API key（按用量計費）',
			ccSection: 'Claude Code', apiSection: 'Anthropic API',
			ccFound: '已找到：{0}', ccMissing: '找不到 Claude Code。請先安裝，或在下面填它的路徑。',
			ccPath: 'claude 的路徑（選填）', ccAccount: '帳號（設定資料夾）', ccAccountDefault: '預設（~/.claude）',
			ccModel: '模型', modelDefault: 'Claude Code 預設',
			needSetup: '先設定 Claude Code 或 API key 才能開始。',
			ccNotFound: '找不到 Claude Code。請到設定填入路徑，或改用 API key。',
			ccNotLoggedIn: '這個帳號的 Claude Code 還沒登入。請在終端機執行 `claude` 登入，或到設定選別的帳號。',
			ccLimit: 'Claude 用量已達上限。', ccFailed: 'Claude Code 執行失敗：',
			viaCC: '訂閱', viaAPI: 'API',
		},
	},

	t(key, ...args) {
		const lang = String(Zotero.locale || 'en').toLowerCase().startsWith('zh') ? 'zh' : 'en';
		const s = this.STRINGS[lang][key] ?? this.STRINGS.en[key] ?? key;
		return s.replace(/\{(\d)\}/g, (_, i) => args[i]);
	},

	// ---------------------------------------------------------------- lifecycle

	init({ id, version, rootURI }) {
		this.id = id;
		this.version = version;
		this.rootURI = rootURI;
		// Reachable from other code (and the end-to-end test) as Zotero.PaperChat
		Zotero.PaperChat = this;
		this.paneID = Zotero.ItemPaneManager.registerSection({
			paneID: 'paper-chat',
			pluginID: id,
			header: { l10nID: 'paper-chat-header', icon: rootURI + 'icons/chat16.svg' },
			sidenav: { l10nID: 'paper-chat-sidenav', icon: rootURI + 'icons/chat20.svg' },
			onItemChange: (props) => this.onItemChange(props),
			onRender: (props) => this.onRender(props),
			onAsyncRender: (props) => this.onAsyncRender(props),
			onDestroy: ({ body }) => this.bodies.delete(body),
		});
		this._selectionListener = (event) => this.onTextSelectionPopup(event);
		Zotero.Reader.registerEventListener('renderTextSelectionPopup', this._selectionListener, id);
	},

	shutdown() {
		for (const s of this.sessions.values()) s.abort?.abort();
		if (this.paneID) Zotero.ItemPaneManager.unregisterSection(this.paneID);
		Zotero.Reader.unregisterEventListener?.('renderTextSelectionPopup', this._selectionListener);
		this.sessions.clear();
		this.bodies.clear();
		delete Zotero.PaperChat;
	},

	addToWindow(win) {
		const doc = win.document;
		win.MozXULElement.insertFTLIfNeeded('paper-chat.ftl');
		const link = doc.createElementNS(this.HTML_NS, 'link');
		link.id = 'paper-chat-stylesheet';
		link.rel = 'stylesheet';
		link.href = this.rootURI + 'content/panel.css';
		doc.documentElement.appendChild(link);
	},

	removeFromWindow(win) {
		const doc = win.document;
		doc.getElementById('paper-chat-stylesheet')?.remove();
		doc.querySelector('[href="paper-chat.ftl"]')?.remove();
	},

	// ---------------------------------------------------------------- prefs and API key

	pref(name) {
		return Zotero.Prefs.get(this.PREF + name, true);
	},

	setPref(name, value) {
		Zotero.Prefs.set(this.PREF + name, value, true);
	},

	_findLogin() {
		try {
			const logins = Services.logins.findLogins(this.LOGIN_HOST, null, this.LOGIN_REALM);
			return logins.length ? logins[0] : null;
		}
		catch (e) {
			Zotero.logError(e);
			return null;
		}
	},

	getApiKey() {
		return this._findLogin()?.password || '';
	},

	async setApiKey(key) {
		const old = this._findLogin();
		if (!key) {
			if (old) Services.logins.removeLogin(old);
			return;
		}
		const LoginInfo = Components.Constructor('@mozilla.org/login-manager/loginInfo;1', Components.interfaces.nsILoginInfo, 'init');
		const info = new LoginInfo(this.LOGIN_HOST, null, this.LOGIN_REALM, 'api-key', key, '', '');
		if (old) Services.logins.modifyLogin(old, info);
		else await Services.logins.addLoginAsync(info);
	},

	// ---------------------------------------------------------------- items, readers, state

	attachmentFor({ item, tabType, doc }) {
		if (String(tabType).startsWith('reader')) {
			const win = doc?.defaultView;
			const reader = win?.Zotero_Tabs && Zotero.Reader.getByTabID(win.Zotero_Tabs.selectedID);
			const att = reader && Zotero.Items.get(reader.itemID);
			if (att?.isPDFAttachment()) return att;
		}
		if (!item) return null;
		if (item.isPDFAttachment?.()) return item;
		if (item.isRegularItem?.()) {
			for (const id of item.getAttachments()) {
				const a = Zotero.Items.get(id);
				if (a?.isPDFAttachment()) return a;
			}
		}
		return null;
	},

	session(att) {
		let s = this.sessions.get(att.id);
		if (!s) {
			s = { att, state: null, statePromise: null, doc: null, busy: false, pending: null, error: null, notice: null, abort: null, draft: '', showSettings: false };
			this.sessions.set(att.id, s);
		}
		return s;
	},

	statePath(att) {
		return PathUtils.join(Zotero.DataDirectory.dir, 'paper-chat', `${att.libraryID}-${att.key}.json`);
	},

	loadState(s) {
		if (s.state) return Promise.resolve(s.state);
		if (!s.statePromise) {
			s.statePromise = (async () => {
				let state = null;
				try {
					state = await IOUtils.readJSON(this.statePath(s.att));
				}
				catch (e) {
					if (e.name !== 'NotFoundError') Zotero.logError(e);
				}
				if (!state || state.version !== 1) {
					state = { version: 1, nextN: 1, activeThread: 't1', threads: [{ id: 't1', docHash: null, messages: [] }], turns: [], noteKey: null };
				}
				s.state = state;
				return state;
			})();
		}
		return s.statePromise;
	},

	async saveState(s) {
		const path = this.statePath(s.att);
		await IOUtils.makeDirectory(PathUtils.parent(path), { ignoreExisting: true });
		await IOUtils.writeJSON(path, s.state, { tmpPath: path + '.tmp' });
	},

	readerFor(att) {
		return Zotero.Reader._readers.find(r => r.itemID === att.id && r._internalReader) || null;
	},

	/** Read every page's text with positions through the reader's own PDF engine */
	async extractDocument(s, onProgress) {
		let reader = this.readerFor(s.att);
		// open() returns nothing when it just reloads an unloaded tab, so keep looking it up below
		if (!reader) reader = await Zotero.Reader.open(s.att.id, null, { openInBackground: true });
		let app = null;
		for (let i = 0; i < 300; i++) {
			reader = reader || Zotero.Reader._readers.find(r => r.itemID === s.att.id);
			app = reader?._internalReader?._primaryView?._iframeWindow?.PDFViewerApplication;
			if (app?.pdfDocument) break;
			await Zotero.Promise.delay(100);
		}
		if (!app?.pdfDocument) throw new Error('The PDF did not finish loading in the reader.');
		const iw = reader._internalReader._primaryView._iframeWindow;
		const toContent = o => iw.JSON.parse(JSON.stringify(o));
		const fromContent = o => JSON.parse(iw.JSON.stringify(o));
		const pdf = app.pdfDocument;
		const numPages = pdf.numPages;
		let labels = [];
		try {
			labels = fromContent(await pdf.getPageLabels2(toContent({}))) || [];
		}
		catch (e) {
			Zotero.debug('Paper Chat: no page labels: ' + e);
		}
		const pages = [];
		let charCount = 0;
		for (let i = 0; i < numPages; i++) {
			onProgress?.(i + 1, numPages);
			const data = fromContent(await pdf.getPageData(toContent({ pageIndex: i })));
			const chars = (data.chars || []).map(c => ({
				c: c.c, rect: c.rect, inlineRect: c.inlineRect,
				spaceAfter: !!c.spaceAfter, lineBreakAfter: !!c.lineBreakAfter,
				paragraphBreakAfter: !!c.paragraphBreakAfter, ignorable: !!c.ignorable,
			}));
			charCount += chars.length;
			pages.push({ pageIndex: i, label: labels[i] || String(i + 1), chars, viewBox: data.viewBox });
		}
		if (charCount < 100) throw new UserError(this.t('noText'));
		const doc = PaperChatCore.buildDocument(pages);
		if (doc.text.length > 2500000) throw new UserError(this.t('tooLong'));
		return { pages, doc, hash: PaperChatCore.hashText(doc.text) };
	},

	paperTitle(att) {
		const parent = att.parentItem;
		return (parent || att).getDisplayTitle();
	},

	// ---------------------------------------------------------------- choosing how to reach Claude

	async detectClaudeCode() {
		const binary = await this.claudeCode.findBinary(this.pref('ccPath') || '');
		const dirs = await this.claudeCode.listConfigDirs();
		this.ccInfo = { binary, dirs };
		return this.ccInfo;
	},

	/** @returns {Promise<{kind:'claude-code', binary}|{kind:'api', apiKey}|{kind:null, error}>} */
	async resolveBackend() {
		const choice = this.pref('backend') || 'auto';
		if (choice !== 'api') {
			const { binary } = await this.detectClaudeCode();
			if (binary) return { kind: 'claude-code', binary };
			if (choice === 'claude-code') return { kind: null, error: this.t('ccNotFound') };
		}
		const apiKey = this.getApiKey();
		if (apiKey) return { kind: 'api', apiKey };
		return { kind: null, error: this.t(choice === 'api' ? 'needKey' : 'needSetup') };
	},

	// ---------------------------------------------------------------- asking

	async ask(att, question) {
		const s = this.session(att);
		question = question.trim();
		if (!question || s.busy) return;
		// Claim the session before the first await, so a quick second Enter doesn't ask twice
		s.busy = true;
		const backend = await this.resolveBackend();
		if (!backend.kind) {
			s.busy = false;
			s.showSettings = true;
			await this.detectClaudeCode();
			s.error = backend.error;
			this.refresh(att);
			return;
		}
		const configDir = this.pref('ccConfigDir') || '';
		s.error = null;
		s.notice = null;
		s.draft = '';
		s.abort = new AbortController();
		s.pending = { question, text: '', status: this.t('readingPDF') };
		this.refresh(att);
		try {
			const state = await this.loadState(s);
			if (!s.doc) {
				s.doc = await this.extractDocument(s, (i, n) => this.setStatus(att, this.t('readingPage', i, n)));
			}
			let thread = state.threads.find(th => th.id === state.activeThread);
			const switched = thread.messages.length
				&& ((thread.backend || 'api') !== backend.kind || (backend.kind === 'claude-code' && thread.ccConfigDir !== configDir));
			if ((thread.docHash && thread.docHash !== s.doc.hash) || switched) {
				// Earlier context can't carry over: the extracted text changed (e.g. a Zotero update),
				// or the conversation lives with another backend or account
				thread = this.newThread(state);
			}
			thread.docHash = s.doc.hash;
			thread.backend = backend.kind;
			// Frozen per thread: the paper block must stay byte-identical for the cache and the replayed history
			thread.title ||= this.paperTitle(att);
			this.setStatus(att, this.t('thinking'));
			let msg;
			if (backend.kind === 'api') {
				msg = await this.claude.ask({
					apiKey: backend.apiKey, model: this.pref('model') || 'claude-opus-5-5', effort: this.pref('effort'),
					docText: s.doc.doc.text, title: thread.title,
					history: thread.messages, question, signal: s.abort.signal,
					onText: (delta) => {
						s.pending.text += delta;
						s.pending.status = null;
						this.updatePending(att);
					},
				});
				if (msg.stop_reason === 'refusal') {
					s.error = this.t('refusal');
					return;
				}
				msg.via = 'api';
			}
			else {
				thread.ccConfigDir = configDir;
				let raw = '';
				const r = await this.claudeCode.ask({
					binary: backend.binary, configDir,
					workdir: PathUtils.join(Zotero.DataDirectory.dir, 'paper-chat', 'claude-code'),
					model: this.pref('ccModel') || '', effort: this.pref('effort'),
					docText: s.doc.doc.text, title: thread.title,
					sessionId: thread.ccSessionId, question, signal: s.abort.signal,
					onText: (delta) => {
						raw += delta;
						s.pending.text = PaperChatCore.streamingDisplay(raw);
						s.pending.status = null;
						this.updatePending(att);
					},
				});
				thread.ccSessionId = r.sessionId;
				s.doc.index ||= PaperChatCore.buildMatchIndex(s.doc.doc);
				msg = {
					content: PaperChatCore.quotedAnswerToContent(r.text, s.doc.doc, s.doc.index),
					model: r.model, usage: r.usage, stop_reason: r.stopReason || 'end_turn', via: 'claude-code',
				};
			}
			s.pending = null;
			await this.recordAnswer(s, thread, question, msg);
		}
		catch (e) {
			if (!(e instanceof UserError)) Zotero.logError(e);
			const tr = k => this.t(k);
			s.error = e instanceof UserError ? e.message
				: e instanceof this.claudeCode.ClaudeCodeError ? this.claudeCode.describeError(e, tr)
				: this.claude.describeError(e, tr);
			if (s.pending && !s.draft) s.draft = question;
		}
		finally {
			s.busy = false;
			s.pending = null;
			s.abort = null;
			this.refresh(att);
		}
	},

	/** Turn a finished answer into a turn: highlights in the PDF, the saved conversation, the note */
	async recordAnswer(s, thread, question, msg) {
		const state = s.state;
		const n = state.nextN++;
		const { markdown, cites } = PaperChatCore.collectAnswer(msg.content);
		for (const cite of cites) {
			cite.highlights = cite.start >= 0 ? PaperChatCore.rangeToHighlights(s.doc.doc, s.doc.pages, cite.start, cite.end) : [];
		}
		const turn = {
			n, color: PaperChatCore.colorFor(n), threadId: thread.id, question,
			answerMarkdown: markdown + (msg.stop_reason === 'max_tokens' ? '\n\n' + this.t('truncated') : ''),
			cites, model: msg.model, usage: msg.usage, via: msg.via || 'api', time: Date.now(),
		};
		thread.messages.push({ role: 'user', content: question }, { role: 'assistant', content: msg.content });
		state.turns.push(turn);
		await this.saveState(s);
		this.refresh(s.att);
		await this.addHighlights(s, turn);
		await this.saveState(s);
		if (this.pref('autoNote')) {
			await this.writeNote(s);
			await this.saveState(s);
		}
		this.refresh(s.att);
		return turn;
	},

	newThread(state) {
		const id = 't' + (state.threads.length + 1);
		const thread = { id, docHash: null, messages: [] };
		state.threads.push(thread);
		state.activeThread = id;
		return thread;
	},

	async startNewThread(att) {
		const s = this.session(att);
		const state = await this.loadState(s);
		const active = state.threads.find(th => th.id === state.activeThread);
		if (active?.messages.length) {
			this.newThread(state);
			await this.saveState(s);
		}
		s.notice = this.t('threadDivider');
		this.refresh(att);
	},

	// ---------------------------------------------------------------- highlights, note, navigation

	async addHighlights(s, turn) {
		const att = s.att;
		if (!Zotero.Libraries.get(att.libraryID).editable) {
			s.notice = this.t('notEditable');
			return;
		}
		const comment = `Q${turn.n}: ${turn.question}`.slice(0, 1000);
		for (const cite of turn.cites) {
			for (const hl of cite.highlights) {
				const key = Zotero.DataObjectUtilities.generateKey();
				try {
					await Zotero.Annotations.saveFromJSON(att, {
						key, type: 'highlight', text: hl.text, comment, color: turn.color,
						pageLabel: hl.pageLabel, sortIndex: hl.sortIndex,
						position: { pageIndex: hl.pageIndex, rects: hl.rects },
						tags: [{ name: this.TAG }],
					});
					hl.annotationKey = key;
				}
				catch (e) {
					Zotero.logError(e);
				}
			}
		}
	},

	async removeTurn(att, n) {
		const s = this.session(att);
		const state = await this.loadState(s);
		const turn = state.turns.find(tn => tn.n === n);
		if (!turn) return;
		const win = Zotero.getMainWindow();
		if (!win.confirm(this.t('deleteConfirm', n))) return;
		const ids = [];
		for (const cite of turn.cites) {
			for (const hl of cite.highlights || []) {
				const ann = hl.annotationKey && Zotero.Items.getByLibraryAndKey(att.libraryID, hl.annotationKey);
				// Only remove highlights that are still ours
				if (ann && ann.hasTag(this.TAG)) ids.push(ann.id);
			}
		}
		if (ids.length) await Zotero.Items.erase(ids);
		// Kept in the thread so the conversation sent to Claude stays append-only; only hidden here
		turn.hidden = true;
		await this.saveState(s);
		if (this.pref('autoNote')) {
			await this.writeNote(s);
			await this.saveState(s);
		}
		this.refresh(att);
	},

	linkFor(att, cite) {
		const lib = Zotero.Libraries.get(att.libraryID);
		const base = lib.libraryType === 'group'
			? `zotero://open-pdf/groups/${Zotero.Groups.getGroupIDFromLibraryID(att.libraryID)}/items/${att.key}`
			: `zotero://open-pdf/library/items/${att.key}`;
		const hl = cite.highlights?.[0];
		if (!hl) return base;
		return `${base}?page=${hl.pageIndex + 1}` + (hl.annotationKey ? `&annotation=${hl.annotationKey}` : '');
	},

	async writeNote(s) {
		const att = s.att;
		if (!Zotero.Libraries.get(att.libraryID).editable) return;
		const state = s.state;
		const html = PaperChatCore.buildNoteHTML({
			title: this.paperTitle(att),
			turns: state.turns,
			linkFor: (turn, cite) => this.linkFor(att, cite),
			strings: { noteTitle: this.t('noteTitle'), noteQuotes: this.t('noteQuotes') },
		}).replace('</h1>', `</h1>\n<p><em>${PaperChatCore.escapeHTML(this.t('noteWarning'))}</em></p>`);
		let note = state.noteKey && Zotero.Items.getByLibraryAndKey(att.libraryID, state.noteKey);
		if (note && note.deleted) note = null;
		if (!note) {
			note = new Zotero.Item('note');
			note.libraryID = att.libraryID;
			if (att.parentID) note.parentID = att.parentID;
		}
		note.setNote(html);
		// Lets other tools (e.g. zotero-llm-wiki's reading progress) tell this note from the user's own
		note.addTag(this.TAG);
		await note.saveTx({ skipSelect: true });
		state.noteKey = note.key;
	},

	async jumpTo(att, cite) {
		const hl = cite.highlights?.[0];
		if (!hl) return;
		const ann = hl.annotationKey && Zotero.Items.getByLibraryAndKey(att.libraryID, hl.annotationKey);
		const location = ann && !ann.deleted
			? { annotationID: hl.annotationKey }
			: { position: { pageIndex: hl.pageIndex, rects: hl.rects } };
		await Zotero.Reader.open(att.id, location);
	},

	onTextSelectionPopup({ reader, doc, params, append }) {
		const text = params?.annotation?.text;
		if (!text) return;
		const button = doc.createElement('button');
		button.textContent = this.t('askSelection');
		button.className = 'paper-chat-ask-selection';
		button.style.cssText = 'margin: 4px 6px; padding: 2px 8px; cursor: pointer;';
		button.addEventListener('click', () => {
			const att = Zotero.Items.get(reader.itemID);
			if (att) this.quoteIntoDraft(att, text);
		});
		append(button);
	},

	quoteIntoDraft(att, text) {
		const s = this.session(att);
		const quote = text.replace(/\s+/g, ' ').trim();
		s.draft = `> ${quote}\n\n${s.draft || ''}`;
		for (const body of this.liveBodies(att)) {
			const ta = body.querySelector('.pc-input');
			if (ta) {
				ta.value = s.draft;
				ta.focus();
				ta.setSelectionRange(ta.value.length, ta.value.length);
			}
		}
	},

	// ---------------------------------------------------------------- item pane section

	onItemChange({ item, tabType, doc, body, setEnabled }) {
		const att = this.attachmentFor({ item, tabType, doc });
		body.dataset.attId = att ? String(att.id) : '';
		body.dataset.inReader = String(tabType).startsWith('reader') ? '1' : '';
		setEnabled(!!att);
	},

	onRender({ body }) {
		this.bodies.add(body);
		const att = body.dataset.attId && Zotero.Items.get(Number(body.dataset.attId));
		this.renderBody(body, att || null);
	},

	async onAsyncRender({ body }) {
		const att = body.dataset.attId && Zotero.Items.get(Number(body.dataset.attId));
		if (!att) return;
		await this.loadState(this.session(att));
		this.renderBody(body, att);
	},

	*liveBodies(att) {
		for (const body of this.bodies) {
			if (!body.isConnected) {
				this.bodies.delete(body);
				continue;
			}
			if (body.dataset.attId === String(att.id)) yield body;
		}
	},

	refresh(att) {
		for (const body of this.liveBodies(att)) this.renderBody(body, att);
	},

	setStatus(att, status) {
		const s = this.session(att);
		if (s.pending) s.pending.status = status;
		this.updatePending(att);
	},

	updatePending(att) {
		const s = this.session(att);
		for (const body of this.liveBodies(att)) {
			const box = body.querySelector('.pc-pending');
			if (!box) {
				this.renderBody(body, att);
				continue;
			}
			box.querySelector('.pc-a').textContent = s.pending?.text || '';
			const status = box.querySelector('.pc-status');
			status.textContent = s.pending?.status || '';
			status.hidden = !s.pending?.status;
			this.scrollToEnd(body);
		}
	},

	scrollToEnd(body) {
		const list = body.querySelector('.pc-list');
		if (list) list.scrollTop = list.scrollHeight;
	},

	el(doc, tag, attrs, ...children) {
		const node = doc.createElementNS(this.HTML_NS, tag);
		for (const [k, v] of Object.entries(attrs || {})) {
			if (v === undefined || v === null || v === false) continue;
			if (k === 'class') node.className = v;
			else if (k === 'style') node.style.cssText = v;
			else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
			else node.setAttribute(k, v === true ? '' : v);
		}
		for (const c of children.flat()) {
			if (c === null || c === undefined || c === false) continue;
			node.append(typeof c === 'string' ? doc.createTextNode(c) : c);
		}
		return node;
	},

	renderBody(body, att) {
		const doc = body.ownerDocument;
		const el = (...a) => this.el(doc, ...a);
		if (!att) {
			body.replaceChildren(el('div', { class: 'pc-root' }, el('div', { class: 'pc-hint' }, this.t('noPDF'))));
			return;
		}
		const s = this.session(att);
		// Keep the draft if the user was typing
		const oldInput = body.querySelector('.pc-input');
		if (oldInput && body.dataset.renderedFor === String(att.id)) s.draft = oldInput.value;
		body.dataset.renderedFor = String(att.id);

		const toolbar = el('div', { class: 'pc-toolbar' },
			el('button', { class: 'pc-btn', title: this.t('newThread'), disabled: s.busy, onclick: () => this.startNewThread(att) }, '＋ ' + this.t('newThread')),
			el('span', { class: 'pc-spacer' }),
			el('button', { class: 'pc-btn', title: this.t('settings'), onclick: () => this.toggleSettings(att) }, '⚙︎'));

		const list = el('div', { class: 'pc-list' });
		const state = s.state;
		const visible = (state?.turns || []).filter(tn => !tn.hidden);
		if (!visible.length && !s.pending) list.append(el('div', { class: 'pc-hint' }, this.t('empty')));
		let lastThread = null;
		for (const turn of visible) {
			if (lastThread && turn.threadId !== lastThread) list.append(el('div', { class: 'pc-divider' }, this.t('threadDivider')));
			lastThread = turn.threadId;
			list.append(this.renderTurn(doc, att, turn, s.busy));
		}
		if (s.pending) {
			list.append(el('div', { class: 'pc-turn pc-pending' },
				el('div', { class: 'pc-q' }, el('span', { class: 'pc-badge' }, '…'), s.pending.question),
				el('div', { class: 'pc-a pc-streaming' }, s.pending.text),
				el('div', { class: 'pc-status', hidden: !s.pending.status }, s.pending.status || '')));
		}
		if (s.notice) list.append(el('div', { class: 'pc-notice' }, s.notice));
		if (s.error) list.append(el('div', { class: 'pc-error' }, s.error));

		const input = el('textarea', { class: 'pc-input', rows: '3', placeholder: this.t('placeholder') });
		input.value = s.draft || '';
		input.addEventListener('input', () => { s.draft = input.value; });
		input.addEventListener('keydown', (ev) => {
			if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) {
				ev.preventDefault();
				ev.stopPropagation();
				this.ask(att, input.value);
			}
		});
		const sendBtn = s.busy
			? el('button', { class: 'pc-btn pc-send', onclick: () => s.abort?.abort() }, this.t('stop'))
			: el('button', { class: 'pc-btn pc-send pc-primary', onclick: () => this.ask(att, input.value) }, this.t('send'));
		const composer = el('div', { class: 'pc-composer' }, input, sendBtn);

		body.replaceChildren(el('div', { class: 'pc-root' },
			toolbar,
			s.showSettings ? this.renderSettings(doc, att) : null,
			list,
			composer));
		this.scrollToEnd(body);
	},

	renderTurn(doc, att, turn, busy) {
		const el = (...a) => this.el(doc, ...a);
		const answer = el('div', { class: 'pc-a' });
		for (const block of PaperChatCore.parseMarkdown(turn.answerMarkdown)) {
			if (block.type === 'p') answer.append(el('p', null, this.renderInline(doc, att, turn, block.inline)));
			else if (block.type === 'h') answer.append(el('p', null, el('strong', null, this.renderInline(doc, att, turn, block.inline))));
			else answer.append(el(block.type, null, block.items.map(it => el('li', null, this.renderInline(doc, att, turn, it)))));
		}
		const u = turn.usage || {};
		const k = v => (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : String(v || 0));
		const inTokens = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
		return el('div', { class: 'pc-turn', style: `--pc-color: ${turn.color}` },
			el('div', { class: 'pc-q' }, el('span', { class: 'pc-badge' }, 'Q' + turn.n), turn.question),
			answer,
			el('div', { class: 'pc-meta' },
				el('span', null, `${turn.model || ''} (${this.t(turn.via === 'claude-code' ? 'viaCC' : 'viaAPI')}) · ${this.t('tokens', k(inTokens), k(u.cache_read_input_tokens), k(u.output_tokens))}`),
				el('span', { class: 'pc-spacer' }),
				el('button', { class: 'pc-link', disabled: busy, onclick: () => this.removeTurn(att, turn.n) }, this.t('deleteTurn'))));
	},

	renderInline(doc, att, turn, nodes) {
		const el = (...a) => this.el(doc, ...a);
		const out = [];
		for (const n of nodes) {
			if (n.t === 'text') {
				n.v.split('\n').forEach((line, i) => {
					if (i) out.push(el('br'));
					if (line) out.push(line);
				});
			}
			else if (n.t === 'b') out.push(el('strong', null, this.renderInline(doc, att, turn, n.c)));
			else if (n.t === 'i') out.push(el('em', null, this.renderInline(doc, att, turn, n.c)));
			else if (n.t === 'code') out.push(el('code', null, n.v));
			else if (n.t === 'cite') {
				const cite = turn.cites.find(c => c.n === n.n);
				if (!cite) continue;
				const hl = cite.highlights?.[0];
				const tip = (hl ? `p.${hl.pageLabel} · ` : this.t('noHighlight') + ' · ') + (cite.citedText || '').trim();
				out.push(el('button', {
					class: 'pc-cite' + (hl ? '' : ' pc-cite-missing'),
					style: `--pc-color: ${turn.color}`,
					title: tip,
					onclick: () => this.jumpTo(att, cite),
				}, hl ? `p.${hl.pageLabel}` : `[${n.n}]`));
			}
		}
		return out;
	},

	async toggleSettings(att) {
		const s = this.session(att);
		s.showSettings = !s.showSettings;
		if (s.showSettings) await this.detectClaudeCode();
		this.refresh(att);
	},

	renderSettings(doc, att) {
		const el = (...a) => this.el(doc, ...a);
		const s = this.session(att);
		const select = (value, options) => {
			const node = el('select', { class: 'pc-field' }, options.map(([v, label]) => el('option', { value: v }, label)));
			node.value = value;
			return node;
		};

		const backend = select(this.pref('backend') || 'auto', [
			['auto', this.t('backendAuto')], ['claude-code', this.t('backendCC')], ['api', this.t('backendAPI')]]);

		const info = this.ccInfo || { binary: null, dirs: [] };
		const ccPath = el('input', { type: 'text', class: 'pc-field', placeholder: info.binary || '/path/to/claude' });
		ccPath.value = this.pref('ccPath') || '';
		const currentDir = this.pref('ccConfigDir') || '';
		const dirs = [...new Set([...info.dirs, currentDir].filter(Boolean))];
		const ccAccount = select(currentDir, [['', this.t('ccAccountDefault')], ...dirs.map(d => [d, d.replace(/^.*[\\/]/, '~/')])]);
		const ccModel = select(this.pref('ccModel') || '', [
			['', this.t('modelDefault')], ['opus', 'Opus'], ['sonnet', 'Sonnet'], ['haiku', 'Haiku'], ['fable', 'Fable']]);

		const hasKey = !!this.getApiKey();
		const key = el('input', { type: 'password', class: 'pc-field', placeholder: hasKey ? this.t('apiKeySaved') : 'sk-ant-…' });
		const model = el('input', { type: 'text', class: 'pc-field', list: 'pc-models' });
		model.value = this.pref('model') || 'claude-opus-5-5';
		const models = el('datalist', { id: 'pc-models' },
			['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-1'].map(m => el('option', { value: m })));

		const effort = select(this.pref('effort') || 'medium', ['low', 'medium', 'high', 'xhigh', 'max'].map(v => [v, v]));
		const autoNote = el('input', { type: 'checkbox' });
		autoNote.checked = !!this.pref('autoNote');

		const save = async () => {
			this.setPref('backend', backend.value);
			this.setPref('ccPath', ccPath.value.trim());
			this.setPref('ccConfigDir', ccAccount.value);
			this.setPref('ccModel', ccModel.value);
			if (key.value.trim()) await this.setApiKey(key.value.trim());
			this.setPref('model', model.value.trim() || 'claude-opus-5-5');
			this.setPref('effort', effort.value);
			this.setPref('autoNote', autoNote.checked);
			s.error = null;
			s.showSettings = false;
			this.refresh(att);
		};
		const clearKey = async () => {
			await this.setApiKey('');
			this.refresh(att);
		};
		return el('div', { class: 'pc-settings' },
			el('label', null, this.t('backend'), backend),
			el('div', { class: 'pc-group' }, this.t('ccSection')),
			el('div', { class: 'pc-hint' }, info.binary ? this.t('ccFound', info.binary) : this.t('ccMissing')),
			el('label', null, this.t('ccAccount'), ccAccount),
			el('label', null, this.t('ccModel'), ccModel),
			el('label', null, this.t('ccPath'), ccPath),
			el('div', { class: 'pc-group' }, this.t('apiSection')),
			el('label', null, this.t('apiKey'), key),
			hasKey ? el('button', { class: 'pc-link', onclick: clearKey }, this.t('clearKey')) : null,
			el('button', { class: 'pc-link', onclick: () => Zotero.launchURL('https://platform.claude.com/settings/keys') }, this.t('getKey')),
			el('label', null, this.t('model'), model, models),
			el('div', { class: 'pc-group' }),
			el('label', null, this.t('effort'), effort),
			el('label', { class: 'pc-check' }, autoNote, this.t('autoNote')),
			el('div', { class: 'pc-row' }, el('button', { class: 'pc-btn pc-primary', onclick: save }, this.t('save'))));
	},
};

