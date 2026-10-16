/* Paper Chat: asking through the local Claude Code CLI, so the user's Claude subscription is used
 * instead of an API key. Claude Code has no citations API, so the model quotes the paper inline as
 * ⟦exact words⟧ and core.js finds each quote in the text we sent.
 */
var PaperChatClaudeCode = (function () {
	const SYSTEM = `You are a reading assistant inside Zotero. The user has a paper open and asks about it; the paper's full text is inside <paper> tags in the first message.

Ground your answer in the paper. Support each claim with a quote copied word for word from the paper inside ⟦ ⟧, placed right after the claim, for example: The model uses a 512-token window ⟦a sliding window of 512 tokens recovers ninety-four percent of full attention accuracy⟧. Copy quotes exactly as they appear, in the paper's own language (never translate a quote), one or two sentences each, and never quote the [Page N] markers. The app turns each quote into a highlight in the PDF and shows it as a small page link instead of the quote text, so write your sentences so they read well without the quotes.

When the paper does not answer the question, say so plainly; if you add background knowledge, label it as not from the paper.

Reply in the language the user writes in. Lead with the direct answer, then the supporting detail; keep it short unless the user asks for depth. Use light Markdown (short paragraphs, bullet lists, bold), no tables.

Lines like "[Page 5]" in the paper mark where each PDF page begins and give that page's label, so you can mention page numbers.`;

	const IS_WIN = Services.appinfo.OS === 'WINNT';

	function home() {
		return Services.dirsvc.get('Home', Components.interfaces.nsIFile).path;
	}

	/** Where Claude Code is usually installed; GUI apps don't see the shell's PATH */
	function candidatePaths() {
		const h = home();
		if (IS_WIN) {
			const appData = Services.env.get('APPDATA');
			return [
				PathUtils.join(h, '.local', 'bin', 'claude.exe'),
				appData && PathUtils.join(appData, 'npm', 'claude.cmd'),
			].filter(Boolean);
		}
		return [
			PathUtils.join(h, '.local', 'bin', 'claude'),
			PathUtils.join(h, '.claude', 'local', 'claude'),
			'/opt/homebrew/bin/claude',
			'/usr/local/bin/claude',
			PathUtils.join(h, '.npm-global', 'bin', 'claude'),
			PathUtils.join(h, '.bun', 'bin', 'claude'),
		];
	}

	async function findBinary(override) {
		if (override) return (await IOUtils.exists(override)) ? override : null;
		for (const p of candidatePaths()) {
			if (await IOUtils.exists(p)) return p;
		}
		return null;
	}

	/** Claude Code config folders in the home directory (~/.claude, ~/.claude-work, …), one per account */
	async function listConfigDirs() {
		const out = [];
		try {
			for (const p of await IOUtils.getChildren(home())) {
				const name = PathUtils.filename(p);
				if (!/^\.claude/.test(name)) continue;
				const info = await IOUtils.stat(p);
				if (info.type === 'directory') out.push(p);
			}
		}
		catch (e) {
			Zotero.logError(e);
		}
		return out.sort();
	}

	function buildArgs({ model, effort, sessionId }) {
		const args = [
			'-p',
			'--output-format', 'stream-json', '--verbose', '--include-partial-messages',
			// No tools, MCP servers, settings or skills: it only reads the paper we send
			'--tools', '',
			'--strict-mcp-config',
			'--setting-sources', '',
			'--disable-slash-commands',
			'--system-prompt', SYSTEM,
		];
		if (model) args.push('--model', model);
		if (effort) args.push('--effort', effort);
		if (sessionId) args.push('--resume', sessionId);
		return args;
	}

	function buildPrompt({ docText, title, question, sessionId }) {
		if (sessionId) return question;
		const safeTitle = String(title || '').replace(/"/g, "'");
		// A literal </paper> in the paper's text would end the paper early
		const safeText = String(docText).replace(/<\/paper>/gi, '</ paper>');
		return `<paper title="${safeTitle}">\n${safeText}\n</paper>\n\n${question}`;
	}

	/**
	 * Ask one question. A new conversation sends the paper; a follow-up resumes the session.
	 * @returns {Promise<{text, sessionId, model, usage, stopReason}>}
	 */
	async function ask({ binary, configDir, workdir, model, effort, docText, title, sessionId, question, onText, signal }) {
		const { Subprocess } = ChromeUtils.importESModule('resource://gre/modules/Subprocess.sys.mjs');
		await IOUtils.makeDirectory(workdir, { ignoreExisting: true });
		const sep = IS_WIN ? ';' : ':';
		const extraPath = [PathUtils.parent(binary), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin'];
		const environment = { PATH: [...extraPath, Services.env.get('PATH')].filter(Boolean).join(sep) };
		if (configDir) environment.CLAUDE_CONFIG_DIR = configDir;

		const proc = await Subprocess.call({
			command: binary,
			arguments: buildArgs({ model, effort, sessionId }),
			environment,
			environmentAppend: true,
			workdir,
			stderr: 'pipe',
		});
		let aborted = false;
		const onAbort = () => {
			aborted = true;
			proc.kill();
		};
		signal?.addEventListener('abort', onAbort);
		try {
			await proc.stdin.write(buildPrompt({ docText, title, question, sessionId }));
			await proc.stdin.close();

			let stderr = '';
			const stderrDone = (async () => {
				for (let s; (s = await proc.stderr.readString());) stderr += s;
			})();
			let buffer = '';
			let result = null;
			let initModel = null;
			let streamed = '';
			let stopReason = null;
			const handle = (line) => {
				if (!line.trim()) return;
				let ev;
				try {
					ev = JSON.parse(line);
				}
				catch (e) {
					return;
				}
				if (ev.type === 'system' && ev.subtype === 'init') initModel = ev.model;
				else if (ev.type === 'stream_event' && ev.event?.type === 'content_block_delta' && ev.event.delta?.type === 'text_delta') {
					streamed += ev.event.delta.text;
					onText?.(ev.event.delta.text);
				}
				else if (ev.type === 'stream_event' && ev.event?.type === 'message_delta' && ev.event.delta?.stop_reason) {
					stopReason = ev.event.delta.stop_reason;
				}
				else if (ev.type === 'result') result = ev;
			};
			for (let chunk; (chunk = await proc.stdout.readString());) {
				buffer += chunk;
				let nl;
				while ((nl = buffer.indexOf('\n')) >= 0) {
					handle(buffer.slice(0, nl));
					buffer = buffer.slice(nl + 1);
				}
			}
			handle(buffer);
			await stderrDone;
			const { exitCode } = await proc.wait();
			if (aborted) throw new ClaudeCodeError('aborted');
			if (!result) throw new ClaudeCodeError('noResult', (stderr || `exit ${exitCode}`).trim().slice(0, 500));
			if (result.is_error) throw new ClaudeCodeError('failed', String(result.result || result.subtype || '').slice(0, 500));
			const modelUsed = Object.keys(result.modelUsage || {})[0] || initModel;
			return { text: result.result ?? streamed, sessionId: result.session_id, model: modelUsed, usage: result.usage, stopReason: result.stop_reason || stopReason };
		}
		finally {
			signal?.removeEventListener('abort', onAbort);
		}
	}

	class ClaudeCodeError extends Error {
		constructor(kind, detail) {
			super(detail || kind);
			this.kind = kind;
			this.detail = detail || '';
		}
	}

	function describeError(e, t) {
		if (!(e instanceof ClaudeCodeError)) return String(e && e.message || e);
		if (e.kind === 'aborted') return t('stopped');
		if (/log ?in|\/login|not logged/i.test(e.detail)) return t('ccNotLoggedIn');
		if (/usage limit|rate limit|limit reached/i.test(e.detail)) return t('ccLimit') + ' ' + e.detail;
		return t('ccFailed') + ' ' + e.detail;
	}

	return { ask, findBinary, listConfigDirs, buildArgs, buildPrompt, describeError, ClaudeCodeError, SYSTEM };
})();
