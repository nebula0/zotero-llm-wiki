/* Paper Chat bootstrap: loads the scripts into the plugin scope and hooks into Zotero windows. */

function install() {}
function uninstall() {}

// The plugin sandbox lacks some web globals the Anthropic SDK needs; borrow them from the main window
function provideWebGlobals() {
	const win = Zotero.getMainWindow() || Services.wm.getMostRecentWindow('navigator:browser');
	if (!win) return;
	for (const name of ['console', 'ReadableStream', 'AbortController', 'AbortSignal', 'Headers', 'Request', 'Response', 'FormData']) {
		if (typeof globalThis[name] === 'undefined' && win[name]) globalThis[name] = win[name];
	}
}

async function startup({ id, version, rootURI }) {
	await Zotero.initializationPromise;
	await Zotero.uiReadyPromise;
	provideWebGlobals();
	Services.scriptloader.loadSubScript(rootURI + 'lib/anthropic.js');
	Services.scriptloader.loadSubScript(rootURI + 'content/core.js');
	Services.scriptloader.loadSubScript(rootURI + 'content/claude.js');
	Services.scriptloader.loadSubScript(rootURI + 'content/claude-code.js');
	Services.scriptloader.loadSubScript(rootURI + 'content/paperchat.js');
	PaperChat.init({ id, version, rootURI });
	for (const win of Zotero.getMainWindows()) {
		if (win.ZoteroPane) PaperChat.addToWindow(win);
	}
}

function onMainWindowLoad({ window }) {
	if (typeof PaperChat !== 'undefined' && PaperChat) PaperChat.addToWindow(window);
}

function onMainWindowUnload({ window }) {
	if (typeof PaperChat !== 'undefined' && PaperChat) PaperChat.removeFromWindow(window);
}

function shutdown() {
	if (typeof PaperChat === 'undefined' || !PaperChat) return;
	for (const win of Zotero.getMainWindows()) PaperChat.removeFromWindow(win);
	PaperChat.shutdown();
	PaperChat = undefined;
}
