#!/bin/bash
# End-to-end test in a real, isolated Zotero: its own profile and data directory in a temp folder,
# so your normal Zotero library is never touched. A Zotero window opens for about a minute.
#
#   test/e2e/run.sh            # results + screenshots land in $PAPERCHAT_E2E_DIR (default: a new temp dir)
#   PAPERCHAT_E2E_CC_CONFIG=~/.claude test/e2e/run.sh   # also ask one real question through that
#                              # Claude Code account (uses a little of its subscription quota)
#
# Needs Python with PyMuPDF (to make the test PDF) and Zotero 7+ installed.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ADDON="$(cd "$HERE/../../addon" && pwd)"
E="${PAPERCHAT_E2E_DIR:-$(mktemp -d -t paper-chat-e2e)}"
ZOT="${ZOTERO_BIN:-/Applications/Zotero.app/Contents/MacOS/zotero}"
mkdir -p "$E/plugin"

[ -f "$ADDON/lib/anthropic.js" ] || { echo "Run 'npm run build' first"; exit 1; }
python3 "$HERE/make_pdf.py" "$E/test-paper.pdf" || exit 1
rm -rf "$E/fakecc" && python3 "$HERE/make_fake_cc.py" "$E/fakecc" || exit 1
cp "$HERE/plugin/manifest.json" "$E/plugin/"
sed -e "s#__OUT__#$E/result.json#" -e "s#__PDF__#$E/test-paper.pdf#" -e "s#__SHOT__#$E/shot.png#" -e "s#__FAKE_CC__#$E/fakecc#" \
	"$HERE/plugin/bootstrap.js.in" > "$E/plugin/bootstrap.js"

launch() { "$ZOT" -no-remote -profile "$E/profile" > "$E/zotero.log" 2>&1 & PID=$!; }

# First launch creates the profile; Zotero only scans the profile's extensions folder on a later start
rm -rf "$E/profile" "$E/data" "$E/result.json"
mkdir -p "$E/profile/extensions" "$E/data"
cat > "$E/profile/user.js" <<PREFS
user_pref("extensions.autoDisableScopes", 0);
user_pref("extensions.enabledScopes", 15);
user_pref("extensions.zotero.dataDir", "$E/data");
user_pref("extensions.zotero.useDataDir", true);
user_pref("extensions.zotero.firstRunGuidance", false);
user_pref("extensions.zotero.sync.autoSync", false);
user_pref("extensions.zotero.httpServer.enabled", false);
user_pref("app.update.enabled", false);
PREFS
launch
for _ in $(seq 1 60); do grep -q lastAppBuildId "$E/profile/prefs.js" 2>/dev/null && break; sleep 1; done
sleep 3; kill $PID 2>/dev/null; wait $PID 2>/dev/null

grep -v 'lastAppBuildId\|lastAppVersion' "$E/profile/prefs.js" > "$E/prefs.tmp" && mv "$E/prefs.tmp" "$E/profile/prefs.js"
rm -f "$E/profile/extensions.json" "$E/profile/addonStartup.json.lz4"
printf '%s' "$ADDON" > "$E/profile/extensions/paper-chat@zotero-llm-wiki"
printf '%s' "$E/plugin" > "$E/profile/extensions/paper-chat-e2e@test"
launch
for _ in $(seq 1 300); do [ -f "$E/result.json" ] && break; sleep 1; done
sleep 2; kill $PID 2>/dev/null; wait $PID 2>/dev/null

if [ ! -f "$E/result.json" ]; then
	echo "No result; see $E/zotero.log"
	exit 1
fi
python3 "$HERE/show.py" "$E/result.json"
echo "Screenshots: $E/shot*.png"
