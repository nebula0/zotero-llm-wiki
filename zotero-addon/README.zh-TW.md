# Paper Chat：在 Zotero 裡問 Claude 論文問題

[English](README.md) ｜ **繁體中文**

一個 Zotero 外掛。打開 PDF，在右側欄問 Claude 這篇論文的問題：

- **每個問題有自己的螢光筆顏色**：Q1 黃、Q2 藍、Q3 綠……
- **回答會引用原文**：引用的句子會直接畫在 PDF 上，顏色和問題一致。
- **點回答裡的 `p.5` 就跳過去**：左邊的 PDF 會捲到那一頁，並選取那段螢光筆。
- **問答會留下紀錄**：重開 PDF 時側欄會載回過去的問答；也會在項目底下寫一篇「AI 問答」筆記，裡面的連結點了同樣會跳到 PDF。
- **選取文字就能問**：在 PDF 上選一段文字，跳出的小選單裡有「問 Claude」，會把那段文字引用進提問框。

連到 Claude 有兩種方式，在設定裡切換：

| | Claude Code（訂閱） | Anthropic API key |
|---|---|---|
| 費用 | 算在你的 Claude Pro/Max 訂閱裡 | 按用量另外計費 |
| 需要 | 電腦上裝好並登入 [Claude Code](https://claude.com/claude-code) | 到 [platform.claude.com](https://platform.claude.com/settings/keys) 建立 API key |
| 引用定位 | Claude 逐字引用原文，外掛在全文裡比對；比對不到的引用顯示成 `[n]`，不畫螢光筆 | API 內建的引用功能直接回傳位置，最精準 |

預設是「自動」：有裝 Claude Code 就用訂閱，沒有才用 API key。

## 安裝

1. 下載 `paper-chat-<版本>.xpi`，或自己建置（見下方「開發」）。
2. Zotero → 工具 → 外掛 → 右上齒輪 → **從檔案安裝外掛**，選這個 `.xpi`。
3. 打開任一篇 PDF。右側欄最下面會多一個「問 Claude」區塊；右邊那排小圖示裡也多一個對話泡泡。
   **點那個對話泡泡，就能把「問 Claude」固定在右側欄最上面**，Zotero 會記住這個設定。

支援 Zotero 7–9。

## 設定

按 ⚙︎ 打開設定：

| 欄位 | 說明 |
|---|---|
| 使用方式 | 自動／Claude Code／API key。 |
| Claude Code 帳號 | 如果你有好幾個 Claude Code 帳號（`~/.claude`、`~/.claude-work`…），選要用哪一個。預設是 `~/.claude`。 |
| Claude Code 模型 | 預設跟 Claude Code 的設定一樣；也可以選 Opus、Sonnet、Haiku。 |
| claude 的路徑 | 通常會自動找到；找不到時再填。 |
| Anthropic API key | 到 [platform.claude.com](https://platform.claude.com/settings/keys) 建立。存在 Zotero 的密碼管理器裡，不會寫進設定檔。 |
| API 模型 | 預設 `claude-opus-5-5`。想省錢可以改 `claude-sonnet-5-5` 或 `claude-haiku-5-5`。 |
| 思考程度 | `low` 到 `max`，預設 `medium`。越高越仔細，也越慢、越貴。 |
| 保存問答筆記 | 預設開啟。筆記由外掛自動產生，每次提問都會整篇重寫，手動修改會消失。 |

## 運作方式

1. 第一次提問時，外掛用 Zotero 閱讀器內建的 PDF 引擎讀出每一頁的文字，並記下每個字在頁面上的位置。
2. 全文送給 Claude：
   - **API**：以「文件」形式送出並開啟 citations 功能，Claude 會標出引用的是全文中的哪幾個字元。
   - **Claude Code**：在背景執行 `claude -p`，關掉所有工具、MCP 和使用者設定，所以它只讀得到這篇論文。Claude 把引文逐字寫在 ⟦ ⟧ 裡，外掛在全文中比對，比對時忽略大小寫、空白、標點、斷字與連字，也能處理「…」省略。
3. 因為全文是外掛自己組出來的，引用位置都能對回 PDF 上的字；接著用 Zotero 的標準方法建立螢光筆畫記，並加上 `paper-chat` 標籤，註解寫「Q3：問題」。

同一個對話裡的追問會帶著前面的問答（Claude Code 會接續同一個 session）；按「＋ 開新對話」可以重新開始，換使用方式或帳號時也會自動開新對話。同一篇論文連續提問時，全文會走快取，比較省錢，也比較不佔訂閱額度。

## 資料存在哪裡

| 內容 | 位置 | 會同步嗎 |
|---|---|---|
| 螢光筆畫記 | Zotero 資料庫（PDF 的畫記） | 會 |
| 問答筆記 | Zotero 資料庫（項目底下的子筆記） | 會 |
| 側欄的完整問答紀錄 | `<Zotero 資料夾>/paper-chat/<文獻庫ID>-<附件key>.json` | 不會，只在這台電腦 |

按某題的「移除」會刪掉那題的螢光筆，並從筆記和側欄拿掉；但為了讓後續追問的上下文不變，送給 Claude 的對話紀錄裡仍保留那一題。

## 隱私和費用

- **整篇 PDF 的文字會送到 Anthropic**，兩種方式都一樣。不要用在不能外傳的文件上。
- 每題的輸入／輸出 token 數會顯示在回答下方。用訂閱時，每題都要讀整篇論文（常見 2–4 萬 token），Pro 的額度會比較快用完。
- Claude Code 的對話紀錄存在 `<Zotero 資料夾>/paper-chat/claude-code` 這個工作目錄底下，不會混進你其他專案的 `claude --resume` 清單。

## 限制

- 只送文字，**Claude 看不到圖片**。表格只要是 PDF 裡的文字就讀得到。
- 掃描檔沒有文字層，要先做 OCR。
- EPUB 和網頁快照還不支援，只支援 PDF。
- 側欄的問答紀錄存在本機，換電腦只看得到筆記和螢光筆。

## 開發

```bash
cd zotero-addon
npm install
npm run build   # 打包 Anthropic SDK，產生 build/paper-chat-<版本>.xpi
npm test        # 單元測試（文字對應、引用轉螢光筆、Markdown、API 請求格式）
npm run e2e     # 在獨立的 Zotero 實例裡跑完整流程，不會動到你的文獻庫
# 再加上用你自己的 Claude Code 帳號真的問一題（會用掉一點訂閱額度）：
PAPERCHAT_E2E_CC_CONFIG=~/.claude npm run e2e
```

開發時可以讓 Zotero 直接讀原始碼資料夾：在 Zotero 設定檔的 `extensions/` 底下建立一個名為 `paper-chat@zotero-llm-wiki` 的文字檔，內容是 `addon/` 的絕對路徑。

| 檔案 | 內容 |
|---|---|
| `addon/bootstrap.js` | 外掛進入點，載入下面幾個檔案 |
| `addon/content/core.js` | 不依賴 Zotero 的邏輯：組全文、引用與引文比對轉座標、Markdown、筆記 HTML |
| `addon/content/claude.js` | API 路徑：組請求、串流回答 |
| `addon/content/claude-code.js` | Claude Code 路徑：找到 `claude`、執行、讀串流輸出 |
| `addon/content/paperchat.js` | Zotero 端：側欄介面、讀 PDF、畫記、筆記、跳頁 |
| `src/anthropic-entry.js` | 打包進 `addon/lib/anthropic.js` 的官方 SDK |
