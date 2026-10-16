# Paper Chat: ask Claude about papers inside Zotero

**English** ｜ [繁體中文](README.zh-TW.md)

A Zotero plugin. Open a PDF and ask Claude about it in the right-hand pane:

- **Each question gets its own highlight color**: Q1 yellow, Q2 blue, Q3 green, and so on.
- **Answers cite the paper**: every quoted sentence is highlighted in the PDF in that question's color.
- **Click `p.5` in an answer to jump there**: the PDF scrolls to the page and selects the highlight.
- **The Q&A is kept**: reopening the PDF brings the conversation back, and an "AI Q&A" note under the item has the same links.
- **Ask about a selection**: select text in the PDF and choose "Ask Claude" in the popup to quote it in your question.

There are two ways to reach Claude; switch in Settings:

| | Claude Code (subscription) | Anthropic API key |
|---|---|---|
| Cost | Included in your Claude Pro/Max subscription | Billed per use |
| Needs | [Claude Code](https://claude.com/claude-code) installed and logged in | An API key from [platform.claude.com](https://platform.claude.com/settings/keys) |
| Citations | Claude quotes the paper word for word and the plugin finds each quote; quotes it can't find show as `[n]` with no highlight | The citations API returns exact positions |

The default, "Automatic", uses Claude Code when it is installed and the API key otherwise.

## Install

1. Download `paper-chat-<version>.xpi`, or build it (see Development).
2. In Zotero: Tools → Plugins → gear icon → **Install Plugin From File**, and pick the `.xpi`.
3. Open a PDF. An "Ask Claude" section appears at the bottom of the right-hand pane, with a chat-bubble icon in the strip of icons beside it.
   **Click the chat bubble to pin "Ask Claude" to the top of the pane**; Zotero remembers this.

Works with Zotero 7–9.

## Settings

Open settings with ⚙︎:

| Setting | Notes |
|---|---|
| Use | Automatic, Claude Code, or API key. |
| Claude Code account | If you have several Claude Code accounts (`~/.claude`, `~/.claude-work`, …), pick one. Default: `~/.claude`. |
| Claude Code model | Claude Code's default, or Opus, Sonnet, Haiku. |
| Path to claude | Found automatically in the usual places; fill it in if not. |
| Anthropic API key | Create one at [platform.claude.com](https://platform.claude.com/settings/keys). Stored in Zotero's password manager, not in the prefs file. |
| API model | `claude-opus-5-5` by default; `claude-sonnet-5-5` or `claude-haiku-5-5` cost less. |
| Effort | `low` to `max`, default `medium`. Higher is more thorough, slower and more expensive. |
| Keep a note | On by default. The plugin rewrites the whole note on every question, so edits made there are lost. |

## How it works

1. On the first question, the plugin reads every page's text through the Zotero reader's own PDF engine, keeping each character's position.
2. The text goes to Claude:
   - **API**: as a document with citations enabled, so the answer says exactly which characters it quotes.
   - **Claude Code**: through `claude -p` in the background, with tools, MCP servers and user settings turned off, so it can only read the paper. Claude writes quotes inside ⟦ ⟧ and the plugin finds them in the text, ignoring case, spacing, punctuation, hyphenation and ligatures, and handling "…" ellipses.
3. Because the plugin built that text, citations map back to characters on the page. The highlights are ordinary Zotero annotations, tagged `paper-chat`, with "Q3: question" as the comment.

Follow-up questions carry the earlier Q&A of the conversation (Claude Code resumes its session); "＋ New conversation" starts over, and switching backend or account starts a new one automatically. Repeat questions on the same paper hit the cache, which is cheaper and uses less of a subscription's limits.

## Where things are stored

| What | Where | Synced |
|---|---|---|
| Highlights | Zotero database (the PDF's annotations) | Yes |
| Q&A note | Zotero database (child note of the item) | Yes |
| Full conversation shown in the pane | `<Zotero data directory>/paper-chat/<libraryID>-<attachmentKey>.json` | No, this computer only |

"Remove" on a question deletes its highlights and drops it from the note and the pane. It stays in the history sent to Claude, so later follow-ups keep the same context.

## Privacy and cost

- **The full text of the PDF is sent to Anthropic** either way. Don't use it on documents that must stay private.
- Each answer shows its input and output tokens. On a subscription every question reads the whole paper (often 20–40k tokens), so Pro limits run out sooner.
- Claude Code sessions live in the working folder `<Zotero data directory>/paper-chat/claude-code`, so they stay out of your other projects' `claude --resume` lists.

## Limitations

- Only text is sent, so **Claude does not see figures**. Tables are readable when they are text in the PDF.
- Scanned PDFs have no text layer; run OCR first.
- PDF only; EPUB and web snapshots are not supported yet.
- The conversation in the pane is local; on another computer you see the note and highlights only.

## Development

```bash
cd zotero-addon
npm install
npm run build   # bundles the Anthropic SDK and writes build/paper-chat-<version>.xpi
npm test        # unit tests: text mapping, citations to highlights, Markdown, API request shape
npm run e2e     # full run in an isolated Zotero instance; your library is not touched
# also ask one real question through your own Claude Code account (uses a little quota):
PAPERCHAT_E2E_CC_CONFIG=~/.claude npm run e2e
```

To load the source folder directly while developing, create a text file named `paper-chat@zotero-llm-wiki` in the `extensions/` folder of your Zotero profile, containing the absolute path to `addon/`.

| File | Contents |
|---|---|
| `addon/bootstrap.js` | Plugin entry point; loads the files below |
| `addon/content/core.js` | Zotero-free logic: document text, citations and quote matching to rects, Markdown, note HTML |
| `addon/content/claude.js` | API path: builds the request and streams the answer |
| `addon/content/claude-code.js` | Claude Code path: finds `claude`, runs it, reads its stream |
| `addon/content/paperchat.js` | Zotero side: pane UI, PDF text, annotations, note, navigation |
| `src/anthropic-entry.js` | The official SDK, bundled into `addon/lib/anthropic.js` |
