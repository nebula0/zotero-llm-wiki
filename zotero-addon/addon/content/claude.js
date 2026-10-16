/* Paper Chat: talking to the Claude API through the bundled Anthropic SDK (lib/anthropic.js). */
var PaperChatClaude = (function () {
	const SYSTEM = `You are a reading assistant inside Zotero. The user has a paper open and asks about it; the paper is the attached document.

Ground your answer in the paper and cite the passages that support each claim. When the paper does not answer the question, say so plainly; if you add background knowledge, label it as not from the paper.

Reply in the language the user writes in. Lead with the direct answer, then the supporting detail; keep it short unless the user asks for depth. Use light Markdown (short paragraphs, bullet lists, bold), no tables.

Lines like "[Page 5]" in the document mark where each PDF page begins and give that page's label, so you can mention page numbers.`;

	// Server-side refusal fallback only exists for these models
	const FALLBACK_MODELS = /^claude-(opus-5|fable-5|sonnet-5-5)/;
	// Models that take output_config.effort
	const EFFORT_MODELS = /^claude-(opus-(4-[5-9]|5)|fable|mythos|sonnet-(4-6|5)|haiku-5)/;

	function documentBlock(docText, title) {
		return {
			type: 'document',
			source: { type: 'text', media_type: 'text/plain', data: docText },
			title: title || 'Paper',
			citations: { enabled: true },
			cache_control: { type: 'ephemeral', ttl: '1h' },
		};
	}

	/**
	 * Build the messages array. The document always sits at the start of the thread's first user
	 * message, so the prefix stays byte-identical and cached across questions.
	 * @param {Array} history earlier [{role, content}] of this thread, stored exactly as returned
	 */
	function buildMessages({ docText, title, history, question }) {
		const messages = history.map(m => ({ role: m.role, content: m.content }));
		if (messages.length) {
			const first = messages[0];
			const rest = typeof first.content === 'string' ? [{ type: 'text', text: first.content }] : first.content;
			messages[0] = { role: 'user', content: [documentBlock(docText, title), ...rest] };
			messages.push({ role: 'user', content: question });
		}
		else {
			messages.push({ role: 'user', content: [documentBlock(docText, title), { type: 'text', text: question }] });
		}
		return messages;
	}

	function buildRequest({ model, effort, docText, title, history, question }) {
		const req = {
			model,
			max_tokens: 64000,
			system: SYSTEM,
			messages: buildMessages({ docText, title, history, question }),
			cache_control: { type: 'ephemeral' },
		};
		if (effort && EFFORT_MODELS.test(model)) req.output_config = { effort };
		if (FALLBACK_MODELS.test(model)) {
			req.betas = ['server-side-fallback-2026-07-01'];
			req.fallbacks = 'default';
		}
		return req;
	}

	/**
	 * Ask a question and stream the answer.
	 * @param {Object} opts { apiKey, model, effort, docText, title, history, question, onText, signal }
	 * @returns {Promise<Object>} the final message
	 */
	async function ask(opts) {
		const client = new Anthropic({ apiKey: opts.apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
		const stream = client.beta.messages.stream(buildRequest(opts), { signal: opts.signal });
		if (opts.onText) stream.on('text', opts.onText);
		return stream.finalMessage();
	}

	/** Short user-facing explanation of an API error */
	function describeError(e, t) {
		if (e instanceof Anthropic.AuthenticationError) return t('errAuth');
		if (e instanceof Anthropic.PermissionDeniedError) return t('errPermission');
		if (e instanceof Anthropic.NotFoundError) return t('errModel');
		if (e instanceof Anthropic.RateLimitError) return t('errRate');
		if (e instanceof Anthropic.BadRequestError) return t('errBadRequest') + ' ' + (e.message || '');
		if (e instanceof Anthropic.APIUserAbortError) return t('stopped');
		if (e instanceof Anthropic.APIConnectionError) return t('errNetwork');
		if (e instanceof Anthropic.APIError) return `API ${e.status || ''}: ${e.message}`;
		return String(e && e.message || e);
	}

	return { ask, buildRequest, buildMessages, describeError, SYSTEM };
})();
