# zotero-llm-wiki：在 Zotero 裡問 Claude 論文問題

**Zotero + Claude** · 在 Zotero 裡問論文，引用直接畫在 PDF 上 · 搜尋文獻 · Obsidian 裡自動更新的文獻庫

[English](README.md) ｜ **繁體中文**

一組讓 Claude 處理你 Zotero 文獻的工具。主力是 **Paper Chat**：一個 Zotero 外掛，打開 PDF 就能在旁邊問 Claude，回答引用的句子會畫在 PDF 上，點頁碼就跳過去。另外有兩個給 [Claude Code](https://claude.com/claude-code) 用的 skill（問論文、找文獻），以及一個搭配 Obsidian 的完整版文獻庫。

<!-- TODO: 示範 GIF，例如 ![demo](docs/demo.gif) -->

---

## 選一個開始

| | 做什麼 | 需要什麼 | 怎麼安裝 |
|---|---|---|---|
| **[Paper Chat](#paper-chat在-zotero-裡直接問-claude)**（主力） | 在 Zotero 右側欄問打開的 PDF；引用的句子畫成螢光筆，點 `p.5` 就跳過去；問答存成筆記 | Zotero，加上 Claude Code 或 Anthropic API key | 下載 `.xpi`，在 Zotero 裡安裝 |
| **[paper-ask](#skillpaper-ask問-zotero-裡的論文)**（skill） | 在 Claude Code 對話裡問 Zotero 裡任何一篇論文，附頁碼與原句，在 PDF 上畫灰色標註 | Claude Code、Zotero、Python | 下載 zip |
| **[paper-search](#skillpaper-search找文獻)**（skill） | 用 OpenAlex 搜尋論文，標出你已經有的，把你選的加進 Zotero | Claude Code、Python（Zotero 選用） | 下載 zip |
| **[完整版 zotero-llm-wiki](#完整版zotero-llm-wiki需要-obsidian)** | 兩個 skill 的功能，再加上 Obsidian 文獻庫：一篇一頁、搜尋紀錄、閱讀進度、AI 筆記 | Claude Code、Zotero、Better BibTeX、Obsidian、Python | Claude Code 外掛 |

**不知道選哪個？先裝 Paper Chat。** 它只要 Zotero，不用開終端機、不用裝 Python。之後想讓 Claude 跨好幾篇論文工作或幫你找新文獻，再加裝 skill 或完整版。

- Paper Chat 可以和其他任何一個一起用。
- paper-ask 和 paper-search 可以一起裝。完整版已經包含這兩個的功能，所以「兩個 skill」和「完整版」選一種就好，不要同時裝。
- 除了「Paper Chat 用 API key」以外，都需要 Claude 付費訂閱（Pro 或 Max）和 Claude Code。還沒裝 Claude Code 的話，[第 1 步](#第-1-步安裝軟體)裡有安裝方法。

---

## Paper Chat：在 Zotero 裡直接問 Claude

一個 Zotero 外掛。打開 PDF，在右側欄問 Claude 這篇論文的問題：

- **每個問題有自己的螢光筆顏色**：Q1 黃、Q2 藍、Q3 綠……
- **回答會引用原文**：引用的句子直接畫在 PDF 上，顏色和問題一致。
- **點回答裡的 `p.5` 就跳過去**：PDF 捲到那一頁，並選取那段螢光筆。
- **問答會留下紀錄**：重開 PDF 時側欄會載回過去的問答；項目底下也會有一篇「AI 問答」筆記，裡面的連結點了同樣會跳到 PDF。
- **選取文字就能問**：在 PDF 上選一段文字，跳出的小選單裡有「問 Claude」。

**需要**：Zotero 7–9，加上下面其中一個：

- **Claude Code（用訂閱）**：電腦上裝好並登入 [Claude Code](https://claude.com/claude-code)，費用算在你的 Pro/Max 訂閱裡。安裝方法見[第 1 步](#第-1-步安裝軟體)最後一項。
- **Anthropic API key（按用量計費）**：到 [platform.claude.com](https://platform.claude.com/settings/keys) 建立，不需要訂閱。

**安裝**

1. 下載 [paper-chat.xpi](https://github.com/nebula0/zotero-llm-wiki/releases/latest/download/paper-chat.xpi)。（如果 Safari 自動把它解壓縮，改用 Chrome 或 Firefox 下載。）
2. Zotero → 工具 → 外掛 → 右上齒輪 → **從檔案安裝外掛**，選這個 `.xpi`。
3. 打開任一篇 PDF。右側欄最下面會多一個「問 Claude」區塊；**點右邊那排小圖示裡的對話泡泡，就能把它固定在最上面**。
4. 有裝 Claude Code 的話直接問就好。有好幾個 Claude Code 帳號、或要用 API key，按區塊裡的 ⚙︎ 設定。

**要知道的事**

- **整篇 PDF 的文字會送到 Anthropic**，兩種方式都一樣。不要用在不能外傳的文件上。
- 只送文字，Claude 看不到圖片；掃描檔要先做 OCR。
- 在 **macOS** 上測過。Windows 應該可以用，但還沒實際測過；Windows 上的 Claude Code 另外需要 [Git for Windows](https://git-scm.com/downloads/win)。在 Windows 上遇到問題，歡迎[開 issue](https://github.com/nebula0/zotero-llm-wiki/issues)。

設定、運作方式、資料存在哪裡：見 [Paper Chat 完整說明](zotero-addon/README.zh-TW.md)。

---

## Skill：paper-ask，問 Zotero 裡的論文

問 Claude 你 Zotero 裡任何一篇論文。它會找到 PDF、讀相關的頁面，回答附頁碼與原句。它不會上網搜尋，也不會憑記憶回答：論文不在 Zotero 裡，它會請你先加進去。

和 Paper Chat 的差別：Paper Chat 在 Zotero 裡問「正在看的這一篇」；paper-ask 在 Claude Code 的對話裡用，可以一次比較好幾篇、跨整個文獻庫提問。

- **灰色標註**：設定好 Zotero API 金鑰後，Claude 會把引用的段落在 PDF 上畫成灰色，你在 Zotero 裡就能對照原文。
- **筆記，需要才存**：說一次「存成筆記」，或說「以後都把筆記存到 ○○ 資料夾」，每次回答都會存成 Markdown 檔。
- **跟著你的語言**：用中文問就用中文答，用英文問就用英文答。

**安裝**

1. 下載 [paper-ask.zip](https://github.com/nebula0/zotero-llm-wiki/releases/latest/download/paper-ask.zip)，存到「下載」資料夾。
2. 解壓縮到 Claude Code 的 skills 資料夾：
   - macOS（終端機）：
     ```
     mkdir -p ~/.claude/skills/paper-ask && unzip -o ~/Downloads/paper-ask.zip -d ~/.claude/skills/paper-ask
     ```
   - Windows（PowerShell）：
     ```
     Expand-Archive -Force "$HOME\Downloads\paper-ask.zip" "$HOME\.claude\skills\paper-ask"
     ```
   解完 `.claude/skills/paper-ask/` 裡面應該直接看到 `SKILL.md`。
3. 打開 Claude Code，說：
   > 設定 paper-ask

   Claude 會檢查 Python、找到你的 Zotero 資料夾。畫灰色標註用的 API 金鑰是選用的，Claude 會打開[圖解說明](docs/zotero-api-key.md)帶你建立。

**使用**

> 我 Zotero 裡那篇 Smith 2023 的主要貢獻是什麼？

要更新的話，重新下載 zip，再執行一次同樣的解壓縮指令。skill 資料夾裡的 `VERSION` 檔會顯示你目前的版本。

---

## Skill：paper-search，找文獻

請 Claude 依主題找論文。標題、作者、年份、期刊、DOI 一律從 [OpenAlex](https://openalex.org) 查證，不會憑記憶編造；推薦之前也會先讀過摘要。

- **知道你有哪些**：先查你的 Zotero，已經有的標 ★，你排除過的標 ✗ 並跳過。
- **引用追蹤**：「這篇引用了哪些？」「誰引用了這篇？」，是找你這個小領域新文章最快的方法。
- **加進 Zotero**：說「把第 1、3 篇加進 Zotero」，就會加到你在 Zotero 裡選取的資料夾，有免費全文時順便附上 PDF。只要 Zotero 開著就好，不需要 API 金鑰。
- **選用的紀錄**：指定一個資料夾，每次搜尋和找到的論文都會存成 CSV，之後再搜就不會重複。

Zotero 是選用的：沒有 Zotero，paper-search 一樣能搜尋，在對話裡回答。

**安裝**

1. 下載 [paper-search.zip](https://github.com/nebula0/zotero-llm-wiki/releases/latest/download/paper-search.zip)，存到「下載」資料夾。
2. 解壓縮到 Claude Code 的 skills 資料夾：
   - macOS（終端機）：
     ```
     mkdir -p ~/.claude/skills/paper-search && unzip -o ~/Downloads/paper-search.zip -d ~/.claude/skills/paper-search
     ```
   - Windows（PowerShell）：
     ```
     Expand-Archive -Force "$HOME\Downloads\paper-search.zip" "$HOME\.claude\skills\paper-search"
     ```
3. 打開 Claude Code，說：
   > 設定 paper-search

**使用**

> 幫我找矽微環共振器熱調控的近期文獻，先從綜述開始。

paper-search 和 paper-ask 很適合一起用：用一個找論文，再用另一個問論文內容。

---

## 完整版：zotero-llm-wiki（需要 Obsidian）

這是給 Claude Code 用的外掛，把你的 Zotero 文獻變成一個**由 AI 維護、放在 Obsidian 裡的 wiki**。裝好之後，你可以在 Obsidian 裡直接跟 Claude 說「幫我找 ○○ 的文獻」、「這篇的實驗怎麼做的？」，Claude 會去搜尋、讀你 Zotero 裡的 PDF，回答附頁碼與原句，再把結果整理成一個會自動更新的文獻庫。

這個做法來自 Andrej Karpathy 的 [LLM Wiki 構想](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)，用在學術文獻上。適合正在做**文獻回顧**、想要一個「做的事情都查得到依據」的 AI 研究助理的研究生與研究者。

### 它解決什麼問題

| 以前 | 用了之後 |
|---|---|
| 每次請 AI 找文獻都重新搜一次，格式每次不同，還會重複推薦 | 搜過的查詢、收過的文章都有紀錄，再搜時已在庫內的標 ★、排除過的標 ✗ |
| AI 給的 DOI、年份、期刊有時是編的 | 書目一律從 OpenAlex 資料庫抓，程式會擋掉沒有來源的資料 |
| 看過的、下載過的、還沒看的文章混在一起 | 一篇一頁，表格裡看得到「AI 讀到哪」、「你讀到哪」（依你在 Zotero 的畫記自動判斷）、有沒有 PDF |
| 問 AI 論文內容，不知道它是讀了原文還是在猜 | 回答附頁碼與原句，並在 PDF 上畫灰色標註，你在 Zotero 裡就能對照原文 |
| 和 AI 討論過的內容散在對話裡，下次就找不到 | 每篇論文有一份 AI 筆記，問答會一直累積在裡面 |
| 不記得當初為什麼收這篇 | 每篇都記錄「為何收錄」、「主要貢獻」，以及判斷依據是全文、摘要還是只有書目 |

### 它長什麼樣

```
你：在 Zotero 存文章、畫重點          你：跟 Claude 說話
        │                                     │
        ▼                                     ▼
   Zotero（PDF＋畫記）  ◀── 讀取、寫灰色標註 ──  Claude Code ＋ zotero-llm-wiki
        │                                     │
        └──────────────┬──────────────────────┘
                       ▼  自動重建
           Obsidian 文獻庫（一篇一頁＋表格）
           ├─ 文章頁：書目、主要貢獻、為何收錄、你和 AI 的閱讀程度
           ├─ 任務頁：每次搜尋找了什麼、收了什麼、排除了什麼與理由
           └─ AI 筆記：Claude 讀每篇論文的問答紀錄（附頁碼）
```

你平常只會打開兩個軟體：
- **Zotero**：存 PDF、畫重點（你本來可能就在用）
- **Obsidian**：看整理好的文獻庫，也在這裡跟 Claude 對話（透過 Claudian 外掛，畫面右側會多一個聊天面板）

---

## 安裝完整版

> 💡 **不需要下載檔案。** 完整版是 Claude Code 外掛，第 3 步的指令會直接從 GitHub 安裝。照下面的步驟做就好。

第 1 步分成 Windows 和 macOS 兩種做法，第 2～4 步兩邊都一樣。

### 需要的東西

- Claude 付費訂閱（Pro 或 Max）
- Zotero 帳號（免費），用來同步 AI 標註

### 每個軟體是做什麼的

| 軟體 | 做什麼 | 你會直接用到嗎 |
|---|---|---|
| **Zotero** | 文獻管理軟體：存 PDF 和書目、在 PDF 上畫重點、寫筆記。所有論文都放這裡 | ✅ 每天用：讀論文、畫重點 |
| **Zotero Connector** | 瀏覽器外掛：在期刊網頁按一下，就把書目和 PDF 存進 Zotero | ✅ 存新文章時用 |
| **Better BibTeX** | Zotero 的外掛：給每篇文章一個固定代碼（例如 `smithThermalTuning2023`），檔名和連結都用它；寫 LaTeX 時也能用來引用 | ❌ 裝好就不用管 |
| **Obsidian** | 筆記軟體：用來看整理好的文獻庫（表格、卡片牆、文章頁），也可以寫自己的筆記 | ✅ 每天用 |
| **Claudian** | Obsidian 的外掛：在 Obsidian 右側開一個聊天面板，讓你在這裡跟 Claude 說話 | ✅ 每天用：跟 Claude 說話 |
| **Claude Code** | Claude 的 AI 助理程式，真正做事的是它：搜尋、讀 PDF、寫筆記、整理文獻庫。Claudian 會在背景呼叫它 | ❌ 只在安裝時用一次 PowerShell（Windows）或終端機（macOS）登入，之後不用打開 |
| **Python** | 程式語言：外掛的工具程式（讀 Zotero、重建文獻庫、畫標註）是用 Python 寫的 | ❌ Claude 會自己執行，你不用學 |
| **Git for Windows** | 只有 Windows 要裝。Claude Code 在 Windows 上執行指令需要它 | ❌ 裝好就不用管 |

### 第 1 步：安裝軟體

照順序安裝，已經裝過的就跳過。

#### Windows

1. **Git for Windows**：https://git-scm.com/downloads/win（安裝選項全部用預設）
2. **Python**：https://www.python.org/downloads/
   ⚠️ 安裝第一個畫面**一定要勾「Add python.exe to PATH」**
3. **Zotero 7**＋瀏覽器的 **Zotero Connector**：https://www.zotero.org/download/
4. **Better BibTeX**：
   到 https://retorque.re/zotero-better-bibtex/installation/ 下載 `.xpi` 檔 → Zotero「工具」→「外掛程式」→ 右上角齒輪 →「從檔案安裝外掛」
5. **Obsidian**：https://obsidian.md/download
6. **Claude Code**（要用 PowerShell 的地方只有這裡，和第 4 步存金鑰時貼一行指令）：
   1. 按開始鍵，搜尋「PowerShell」並打開。
   2. 貼上下面這行，按 Enter，等它裝完：
      ```
      irm https://claude.ai/install.ps1 | iex
      ```
   3. 輸入 `claude` 按 Enter，照畫面登入你的 Claude 帳號。
   4. 看到可以輸入的畫面就代表登入成功，輸入 `/exit` 離開，關掉 PowerShell。之後都不用再開。

#### macOS

1. **Python**：到 https://www.python.org/downloads/ 下載 macOS 安裝檔並安裝。
   裝完會跳出一個 Finder 視窗，雙擊裡面的 **Install Certificates.command**（讓 Python 能安全連線）。
   （macOS 內建的 `python3` 可能版本太舊，用 python.org 的版本比較不會出問題。）
2. **Zotero 7**＋瀏覽器的 **Zotero Connector**：https://www.zotero.org/download/
3. **Better BibTeX**：
   到 https://retorque.re/zotero-better-bibtex/installation/ 下載 `.xpi` 檔 → Zotero「工具」→「外掛程式」→ 右上角齒輪 →「從檔案安裝外掛」
   （如果 Safari 自動把 `.xpi` 解壓縮了，改用 Chrome 或 Firefox 下載。）
4. **Obsidian**：https://obsidian.md/download
5. **Claude Code**（要用終端機的地方只有這裡，和第 4 步存金鑰時貼一行指令）：
   1. 按 `Cmd+空白鍵`，輸入「終端機」並打開。
   2. 貼上下面這行，按 Enter，等它裝完：
      ```
      curl -fsSL https://claude.ai/install.sh | bash
      ```
   3. 輸入 `claude` 按 Enter，照畫面登入你的 Claude 帳號。（如果出現 `command not found`，關掉終端機、開一個新視窗再試一次。）
   4. 看到可以輸入的畫面就代表登入成功，輸入 `/exit` 離開，關掉終端機。之後都不用再開。

### 第 2 步：建立筆記庫並裝 Claudian

1. 在「文件」裡建一個資料夾當研究筆記庫，例如 `研究筆記`。
2. 打開 Obsidian →「開啟資料夾作為 vault」→ 選這個資料夾。
3. Obsidian 左下角齒輪「設定」→「第三方外掛」→ 關閉「限制模式」→「瀏覽」→ 搜尋 **Claudian** → 安裝 → 啟用。
   （搜不到的話，照 Claudian 的 GitHub 頁面說明手動安裝：https://github.com/YishenTu）
4. 點左側欄的 Claudian 圖示，打開聊天面板，打一句「你好」測試。Claude 有回應就成功了。

### 第 3 步：請 Claude 安裝外掛

1. 在 Claudian 面板裡說：
   > 幫我安裝 Claude Code 外掛：執行 `claude plugin marketplace add nebula0/zotero-llm-wiki`，再執行 `claude plugin install zotero-llm-wiki@zotero-llm-wiki`
2. Claude 說安裝成功後，**完全關掉 Obsidian 再重開**，讓外掛生效。

<details>
<summary>不能連 GitHub？用壓縮檔安裝</summary>

在本頁右上角「Code」→「Download ZIP」下載，解壓縮放在固定的地方（例如 `C:\Users\你的名字\zotero-llm-wiki`，之後不要移動），把上面指令裡的 `nebula0/zotero-llm-wiki` 換成這個資料夾路徑（前後加引號）。
</details>

### 第 4 步：跑設定精靈

在 Claudian 面板裡說：

> 設定 zotero-llm-wiki

Claude 會一步一步帶你完成：檢查 Python 和 Zotero、存 Zotero 金鑰、建立資料夾、填你的研究主題與分類標籤、設定 Obsidian。中間會請你重開一次 Obsidian，重開後打開 Claudian 說「繼續設定 zotero-llm-wiki」。

> 🔑 **金鑰等於密碼**：設定時 Claude 會打開建立金鑰的[圖解說明](docs/zotero-api-key.md)，再給你一行指令，貼到 PowerShell（Windows）或終端機（macOS），把金鑰直接存進電腦。**不要把金鑰貼進對話。**

---

## 完整版日常怎麼用

**打開 Obsidian，在右側的 Claudian 面板跟 Claude 說話。** 直接用中文說就好，不用記指令。

### 找文獻

> 幫我找「○○」的文獻，這是新主題，先找綜述

Claude 會先讀幾篇綜述、整理出這個領域有哪些做法，再一個方向一個方向搜。每篇找到的文章都先讀過摘要才收，排除的也會列出理由。搜完它會給你一個「待匯入」頁面，**你看過、說哪些要，才會正式加進文獻庫**。

### 問論文內容

> 我 Zotero 裡那篇 Smith 2023，它的樣品怎麼做的？

Claude 會讀 PDF 回答，附上頁碼和原句，同時：
- 在 PDF 上把引用的段落畫成**灰色**（評論開頭寫 `〔問：…〕`）
- 把這次問答存進這篇的 AI 筆記

### 改文章狀態

> 這篇排除，跟我的題目無關
> Chen 2024 我引言要引用

### 更新文獻庫

在 Zotero 存了新文章或畫了重點之後：

> 重建文獻庫

Claude 會更新文章頁，並幫新文章讀摘要、寫主要貢獻、分類。

---

## 在 Zotero 裡畫重點

照這個顏色畫，系統會依顏色統計，Obsidian 閱讀卡也會依顏色分區：

| 顏色 | 意思 |
|---|---|
| 🟡 黃 | 核心論述、要引用的句子 |
| 🔴 紅 | 懷疑、不同意 |
| 🟢 綠 | 方法值得參考 |
| 🔵 藍 | 關鍵數據 |
| 🟣 紫 | 還需要查資料（＝待辦） |
| ⚪ 灰 | **只有 Claude 用**，你不要用灰色 |

**看到灰色的 AI 標註：**
- 同意 → 改成你的顏色（＝採納）
- 不同意 → 直接刪掉
- 不處理也可以

**Zotero 筆記第一行寫一句主張**（例如「本文證明了 X」），會變成閱讀卡上的一句話摘要。

**閱讀程度不用自己填**：系統依你畫了幾頁判斷。判斷錯的話，在 Zotero 對那篇打 tag：`閱讀/沒看`、`閱讀/看過摘要`、`閱讀/略讀`、`閱讀/精讀`。

---

## 在 Obsidian 裡看

打開 `2_paper/文獻庫.base`，左上角可以切換檢視：

| 檢視 | 看什麼 |
|---|---|
| 總表 | 全部文章 |
| 最近新增 | 最新收錄的在最上面 |
| 卡片牆 | 有封面圖的卡片（自動從 PDF 截圖；想換就在 Zotero 用「選擇區域」框一張圖，評論打 `cover`） |
| 你還沒讀 | AI 讀得越深的排越上面，適合挑下一篇讀什麼 |
| 需要你下載 | 不在 Zotero 或沒有 PDF 的 |
| 有待查項 | 有紫色畫記的 |
| 候選與排除 | Claude 找到但還沒決定、或已排除的 |
| 本團隊 | 作者有你的指導教授或合作對象的 |

把 Zotero 畫記匯成閱讀卡：Obsidian 按 `Ctrl+P`（macOS 是 `Cmd+P`） →「Zotero Integration: 文獻卡片」→ 選文章。

⚠️ **`2_paper/文獻庫/` 和 `2_paper/任務/` 裡的頁面不要手動編輯**，它們是程式產生的，下次重建會被覆蓋。想改什麼跟 Claude 說；自己的想法寫在 Zotero 筆記或閱讀卡。

---

## 資料夾說明

```
研究筆記/
├─ 2_paper/
│  ├─ 文獻庫/          文章頁（自動產生，不要改）
│  ├─ 任務/            每次搜尋的紀錄頁（自動產生，不要改）
│  ├─ AI筆記/          Claude 讀每篇論文的筆記
│  ├─ notes/           你的閱讀卡（從 Zotero 匯入）
│  ├─ 文獻庫資料/       所有紀錄與設定（設定.json：研究主題、標籤、本團隊名單）
│  └─ 文獻庫.base       表格檢視
├─ 1_attachment/封面/  卡片牆的封面圖
└─ 筆記/               其他筆記（例如 Claude 整理的領域地圖）
```

建議用 Git 或雲端硬碟備份 `研究筆記` 資料夾；`文獻庫資料/` 是唯一無法重建的部分。

---

## 常見問題

**Q：Claudian 說找不到 Claude Code。**
Claudian 找不到 Claude Code 程式的位置。先找出路徑，再貼到 Obsidian「設定」→「Claudian」裡的 Claude CLI 路徑欄位：
- Windows：打開 PowerShell 輸入 `where.exe claude`
- macOS：打開終端機輸入 `which claude`（通常是 `/Users/你的帳號/.local/bin/claude`）

**Q：Claude 說找不到 Python。**
- Windows：安裝 Python 時沒勾「Add python.exe to PATH」。重新執行安裝程式選「Modify」補勾，或解除安裝後重裝，然後重開 Obsidian。
- macOS：照第 1 步從 python.org 安裝 Python，然後完全關掉 Obsidian（`Cmd+Q`）再重開。

**Q：macOS 上搜尋時出現憑證錯誤（`CERTIFICATE_VERIFY_FAILED`）。**
打開 Finder →「應用程式」→ Python 3.x 資料夾，雙擊 **Install Certificates.command**。

**Q：灰色標註寫不進去，說找不到附件。**
那篇的 PDF 附件還沒同步到 zotero.org。在 Zotero 按右上角的同步按鈕，等它同步完再試。

**Q：文章頁出現「沒有正式 citekey」的警告。**
Better BibTeX 沒裝好，或那篇還沒產生代碼。在 Zotero 對那篇按右鍵 →「Better BibTeX」→「Refresh BibTeX key」。

**Q：想改分類標籤。**
跟 Claude 說「標籤詞表加一個 topic/xxx，意思是……」，它會更新 `設定.json`。

**Q：paper-ask 或 paper-search 可以和完整版一起裝嗎？**
不行。完整版本來就會讀論文、搜尋文獻，同時裝的話，Claude 會不知道該用哪一個。換成完整版時，把 `.claude/skills/paper-ask` 和 `.claude/skills/paper-search` 資料夾刪掉。

**Q：我之前裝過 zotero-ask，現在怎麼辦？**
是同一個 skill，改名叫 paper-ask。照 [paper-ask 那一節](#skillpaper-ask問-zotero-裡的論文)裝好 paper-ask，再把舊的 `.claude/skills/zotero-ask` 資料夾刪掉，免得 Claude 看到兩份。

**Q：完整版有新版本。**
在 Claudian 說「幫我更新 zotero-llm-wiki 外掛：執行 `claude plugin marketplace update zotero-llm-wiki`，再執行 `claude plugin update zotero-llm-wiki@zotero-llm-wiki`」，然後重開 Obsidian。（用壓縮檔安裝的，先用新下載的資料夾取代舊的。）

**Q：Paper Chat 可以和完整版一起用嗎？**
可以。Paper Chat 畫的螢光筆和寫的「AI 問答」筆記都帶 `paper-chat` 標籤，完整版推斷你的閱讀進度時會跳過它們，所以不會被算成你自己畫的重點。分辨方法：Paper Chat 的螢光筆註解開頭是「Q1：問題」。

**Q：會不會很貴？**
用的是你自己 Claude 訂閱的額度，沒有額外費用。精讀整篇論文比較耗額度，平常問特定段落就好。Paper Chat 每題都會讀整篇論文（常見 2–4 萬 token），Pro 的額度會用得比較快；改用 API key 的話按用量另外計費，每題的 token 數會顯示在回答下方。

---

## 歡迎回饋

這是一個碩士生自己做的專案，很想聽聽你的使用心得：哪裡好用、安裝卡在哪、希望它多做什麼。歡迎開 [issue](https://github.com/nebula0/zotero-llm-wiki/issues)，覺得這個想法有用的話也可以按個 ⭐。

---

## 授權

MIT License，見 [LICENSE](LICENSE)。歡迎改成適合你自己研究的版本。

Zotero 是 Corporation for Digital Scholarship 的註冊商標。本專案與 Zotero 及 Corporation for Digital Scholarship 無關，也未經其認可。
