# Paper Chat 安裝指南（Windows／macOS）

[English](paper-chat-install.md) ｜ **繁體中文**

Paper Chat 是一個 Zotero 外掛：打開 PDF，在右側欄問 Claude 這篇論文的問題。回答引用的句子會畫成螢光筆，點回答裡的 `p.N` 就跳到那一頁。

![Paper Chat：左邊是畫好螢光筆的 PDF，右邊是附頁碼連結的回答](images/paper-chat/demo.png)

<sub>範例論文：M. Becker, D. Drees, F. Brückerhoff-Plückelmann, C. Schuck, W. Pernice, B. Risse, “Activation Functions in Non-Negative Neural Networks,” *IEEE Access* 13 (2025), [doi:10.1109/ACCESS.2025.3622408](https://doi.org/10.1109/ACCESS.2025.3622408)，以 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 授權。圖為該論文 PDF 在 Zotero 裡的截圖，經裁切，螢光筆由 Paper Chat 加上。</sub>

整個安裝分三步，大約 10 分鐘：

1. [裝 Zotero](#1-裝-zotero)
2. [選一種方式連到 Claude](#2-選一種方式連到-claude)：Claude Code（用訂閱）或 API key（按用量計費）
3. [下載並安裝 Paper Chat](#3-下載並安裝-paper-chat)

---

## 1. 裝 Zotero

已經有 Zotero 7 以上就跳過這步。（看版本：Zotero 選單 → 說明 → 關於 Zotero；macOS 是 Zotero → 關於 Zotero。）

到 <https://www.zotero.org/download/> 下載安裝。Windows 和 macOS 都一樣，照安裝程式的預設選項就好。

---

## 2. 選一種方式連到 Claude

| | A. Claude Code（用訂閱） | B. Anthropic API key |
|---|---|---|
| 費用 | 算在你的 Claude Pro／Max 訂閱裡，不另外收費 | 按用量計費，每題的 token 數會顯示在回答下方 |
| 需要 | Claude 付費訂閱 | 在 Anthropic 開發者平台儲值 |
| 引用位置 | 外掛在全文裡比對 Claude 寫出的原句，少數比對不到的會顯示成 `[n]` | API 直接回傳位置，最精準 |

**已經有 Pro 或 Max 訂閱就選 A。** 兩種都設定好也可以，預設會優先用 Claude Code。

### A. 安裝 Claude Code

已經在用 Claude Code 的話，確認它登入了就好，直接跳到[第 3 步](#3-下載並安裝-paper-chat)。

#### Windows

> ⚠️ Windows 版的 Paper Chat 還沒在真的 Windows 電腦上測過。遇到問題請[開 issue](https://github.com/nebula0/zotero-llm-wiki/issues)，附上側欄顯示的錯誤訊息。

1. **先裝 Git for Windows**：<https://git-scm.com/downloads/win>，選項全部用預設。Claude Code 在 Windows 上需要它。
2. 按開始鍵，搜尋「PowerShell」並打開。
3. 貼上這一行，按 Enter，等它裝完：
   ```
   irm https://claude.ai/install.ps1 | iex
   ```
4. 輸入 `claude` 按 Enter，照畫面指示登入你的 Claude 帳號。
5. 出現輸入框就代表登入成功。輸入 `/exit` 離開，關掉 PowerShell。

#### macOS

1. 按 `Cmd+Space`，輸入「終端機」（Terminal）並打開。
2. 貼上這一行，按 Enter，等它裝完：
   ```
   curl -fsSL https://claude.ai/install.sh | bash
   ```
3. 輸入 `claude` 按 Enter，照畫面指示登入你的 Claude 帳號。（如果顯示 `command not found`，關掉終端機、開一個新視窗再試一次。）
4. 出現輸入框就代表登入成功。輸入 `/exit` 離開，關掉終端機。

> 裝完 Claude Code 之後，如果 Zotero 本來就開著，**請把 Zotero 完全關掉再打開**，外掛才找得到它。

### B. 建立 Anthropic API key

1. 到 <https://platform.claude.com/settings/keys> 登入（沒有帳號就註冊一個），在 Billing 儲值。
2. 按 **Create Key**，取個名字（例如 `paper-chat`），複製產生的 key（`sk-ant-` 開頭）。
3. 先把 key 放在手邊，第 3 步裝好外掛後要貼進設定。

> 🔑 API key 等於密碼，會直接扣你的儲值金額。只貼進 Paper Chat 的設定欄位，不要貼到其他地方。Paper Chat 把它存在 Zotero 的密碼管理器裡，不會寫進設定檔。

---

## 3. 下載並安裝 Paper Chat

1. 下載 **[paper-chat.xpi](https://github.com/nebula0/zotero-llm-wiki/releases/latest/download/paper-chat.xpi)**。
   - 用 **Chrome 或 Edge** 下載最省事。
   - **Safari** 可能會自動把它解壓縮成資料夾，這樣就不能用了，請改用 Chrome 下載。
   - **Firefox** 會以為這是給 Firefox 的擴充套件、想直接安裝。請改成在連結上按右鍵 →「另存連結」。
2. 打開 Zotero，上方選單 **工具 → 外掛**（Tools → Plugins）。
3. 按視窗右上角的 **齒輪** → **從檔案安裝外掛…**（Install Plugin From File…），選剛剛下載的 `paper-chat.xpi`。
4. 清單裡出現 **Paper Chat** 就裝好了，不用重開 Zotero。

### 第一次使用

1. 在 Zotero 裡雙擊一篇有 PDF 的文獻，打開 PDF。
2. 右側欄最下面會多一個 **「問 Claude」** 區塊。
   **點最右邊那排小圖示裡的對話泡泡**，就能把它固定在右側欄最上面，Zotero 會記住這個設定。
3. 選了 B（API key）的話：按區塊裡的 **⚙︎**，把 key 貼進「Anthropic API key」，按「儲存」。
   選了 A（Claude Code）的話：通常不用設定，直接問就好。
4. 在下面的輸入框打問題，按 Enter 送出（Shift+Enter 換行）。

第一次提問時，外掛要先讀整篇 PDF 的文字，會比較久；同一篇之後的問題就快了。

---

## 怎麼用

- **每個問題有自己的顏色**：Q1 黃、Q2 藍、Q3 綠……回答引用的句子會用同一個顏色畫在 PDF 上，註解寫著「Q1：問題」。
- **點回答裡的 `p.N`**：PDF 捲到那一頁，並選取那段螢光筆。滑鼠停在上面會顯示原句。
- **選取文字直接問**：在 PDF 上選一段文字，跳出的小選單裡按「問 Claude」，那段文字會引用進輸入框。
- **追問**：同一個對話裡的追問會帶著前面的問答。按「＋ 開新對話」可以重新開始。
- **移除某一題**：按那題右下角的「移除」，會刪掉它的螢光筆，並從筆記和側欄拿掉。
- **問答筆記**：項目底下會自動產生一篇「AI 問答」筆記，裡面的頁碼連結點了一樣會跳到 PDF。這篇筆記每次提問都會整篇重寫，**不要在裡面寫自己的東西**。

### 設定（⚙︎）

| 欄位 | 說明 |
|---|---|
| 使用方式 | 自動（有 Claude Code 就用它，否則用 API key）／只用 Claude Code／只用 API key |
| 帳號 | 有好幾個 Claude Code 帳號（`~/.claude`、`~/.claude-work`…）時選要用哪一個 |
| 模型 | Claude Code 和 API 各自可以選模型 |
| claude 的路徑 | 通常會自動找到；找不到時才要填 |
| 思考程度 | `low` 到 `max`，預設 `medium`。越高越仔細，也越慢、越耗額度 |
| 保存問答筆記 | 不想在項目底下產生筆記就取消勾選 |

---

## 常見問題

**Q：側欄說「找不到 Claude Code」或「先設定 Claude Code 或 API key 才能開始」。**
先確認 Claude Code 裝好了，並且**完全關掉 Zotero 再打開**。還是找不到的話，查出它的路徑，貼到 ⚙︎ →「claude 的路徑」：
- Windows：在 PowerShell 執行 `where.exe claude`
- macOS：在終端機執行 `which claude`（通常是 `/Users/<你>/.local/bin/claude`）

**Q：側欄說「這個帳號的 Claude Code 還沒登入」。**
在 PowerShell（Windows）或終端機（macOS）執行 `claude`，照指示登入。有好幾個帳號的話，到 ⚙︎ →「帳號」確認選的是登入的那一個。

**Q：（Windows）側欄說需要 Git for Windows。**
到 <https://git-scm.com/downloads/win> 安裝（選項用預設），再把 Zotero 完全關掉重開。

**Q：側欄說用量已達上限。**
你的 Claude 訂閱這段時間的額度用完了。等額度恢復，或到 ⚙︎ 改用 API key。Paper Chat 每題都會讀整篇論文（常見 2–4 萬 token），Pro 的額度會用得比較快。

**Q：側欄說這份 PDF 沒有文字層。**
這是掃描檔，沒有文字層，要先做 OCR（例如用 Adobe Acrobat 或 macOS 的「預覽程式」）再匯入 Zotero。

**Q：回答裡有些引用是 `[n]`，不是 `p.N`。**
Claude 引用的句子在 PDF 文字裡比對不到（例如跨頁、或抄錯幾個字），所以沒辦法畫螢光筆。滑鼠停在 `[n]` 上可以看 Claude 引用的原文。

**Q：群組文獻庫裡沒有畫螢光筆。**
你在那個群組沒有編輯權限，Paper Chat 不能新增標註，只會在側欄顯示回答。

**Q：怎麼更新？**
Zotero 會自動檢查外掛更新。想手動更新的話，下載新的 `paper-chat.xpi`，照[第 3 步](#3-下載並安裝-paper-chat)再裝一次就好，舊的問答都會保留。

**Q：怎麼移除？**
工具 → 外掛 → Paper Chat 右邊的「…」→ 移除。已經畫好的螢光筆和筆記會留著；想一起刪掉，在 Zotero 左下角的標籤欄點 `paper-chat` 標籤，就能找到它們。

**Q：我的論文會被傳到哪裡？**
整篇 PDF 的**文字**會送到 Anthropic（兩種方式都一樣），圖片不會送。不要用在不能外傳的文件上。側欄的完整問答紀錄只存在你這台電腦：`<Zotero 資料夾>/paper-chat/`。

更多細節（運作方式、資料存在哪裡、開發）見 [Paper Chat 完整說明](../zotero-addon/README.zh-TW.md)。
