# Paper Chat (Zotero plugin) — notes for agents

## Before changing anything

`node_modules/`, `build/` and `addon/lib/` are gitignored, so a fresh checkout cannot run or package the plugin. Run once:

```bash
cd zotero-addon && npm install && npm run build
```

`npm run build` bundles the Anthropic SDK into `addon/lib/anthropic.js` and writes `build/paper-chat-<version>.xpi`. Rebuild after every change; the user installs the `.xpi` in Zotero (Tools → Plugins → gear → Install Plugin From File), and Zotero keeps its own copy in the profile.

## Checking a change

- `npm test` — unit tests for the Zotero-free code (`core.js`, `claude.js`, `claude-code.js`).
- `npm run e2e` — starts an isolated Zotero (own profile and data dir in a temp folder; the user's library is never touched), runs every step and saves screenshots. A Zotero window opens for about a minute. Read the screenshots to check the UI.
- `PAPERCHAT_E2E_CC_CONFIG=<claude config dir> npm run e2e` — adds one real question through that Claude Code account (uses a little subscription quota; ask first).

## Things that bit us (Zotero 9.0.6)

- The installed Zotero is newer than most docs. Read its real source instead of guessing: unzip `/Applications/Zotero.app/Contents/Resources/app/omni.ja` (Zotero code, reader in `resource/reader/`) and `.../Resources/omni.ja` (Firefox modules) into a scratch folder.
- `manifest.json` needs `applications.zotero.update_url`, or Zotero silently refuses the plugin.
- Zotero awaits each plugin's `startup()` in turn; a plugin that waits for another one there blocks it.
- The plugin sandbox has no `console`, `ReadableStream`, `AbortController`, `Headers`, `Response`…; `bootstrap.js` copies them from the main window before loading the SDK.
- PDF text with positions comes from the reader's own engine: `reader._internalReader._primaryView._iframeWindow.PDFViewerApplication.pdfDocument.getPageData({pageIndex})`. Pass arguments and read results through the iframe's `JSON` (content/chrome compartments).
- Claude Code from a GUI app: the child process needs `USER` in its environment or it can't read the macOS keychain login ("Not logged in"). `CLAUDE_CONFIG_DIR` picks the account.
- History sent to Claude must stay append-only (the document block and earlier turns byte-identical), or the cache misses and replayed thinking blocks can be rejected. That is why removed questions are only hidden and the paper title is frozen per thread.
