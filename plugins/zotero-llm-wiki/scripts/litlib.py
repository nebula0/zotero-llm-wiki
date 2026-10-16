#!/usr/bin/env python3
"""文獻庫工具（規則見 skills/lit-library/規則.md；文章頁一律由本程式產生，不手改）
  litlib.py rebuild [--refresh]              重建文章頁 2_paper/文獻庫/ 與封面 1_attachment/封面/；--refresh 重抓 OpenAlex（更新被引次數）
  litlib.py find <關鍵字或 DOI>               查文獻庫（代碼、標題、DOI）與搜尋紀錄，搜尋前先用
  litlib.py fetch <DOI>                       查 OpenAlex（先看快取），印出書目、摘要、免費全文
  litlib.py search "查詢" [--from 年] [--to 年] [--n 25] [--abs]   OpenAlex 關鍵字搜尋，標出已在庫內／已排除的
  litlib.py track <DOI> 往前|往後 [--n 50] [--abs]                  引用追蹤：往前＝它引用誰，往後＝誰引用它
  litlib.py log <類型> <JSON 字串或 .json 檔>  追加紀錄（可一次給一筆或一個 list）；類型：任務 搜尋 來源 決策 AI閱讀 標籤
  litlib.py import-batch <批次.json> [--check|--preview]  批次一次寫入（全部檢查通過才寫；--check 只檢查；
                                              --preview 產生 2_paper/待匯入/{任務}.md，版型同任務頁，給使用者看過再匯入）

紀錄檔在 2_paper/文獻庫資料/*.jsonl，只追加、不修改；格式與必填欄位見 SCHEMA。
「文章」欄位填 DOI（不分大小寫，可含 https://doi.org/），沒有 DOI 時填 zotero:條目代號 或 openalex:W…。
讀 Zotero 用 zotero.sqlite 唯讀模式（Zotero 開著也可以）；OpenAlex 金鑰讀 ~/.config/openalex/api_key（選用）。
vault 位置與 Zotero 資料夾見 litcommon.py。
"""
import sys, os, re, json, html, sqlite3, unicodedata, urllib.request, urllib.error, urllib.parse
from pathlib import Path
from datetime import date, datetime, timezone

from litcommon import ZDB, SSL_CTX, storage_file, read_key, find_vault

VAULT = find_vault()
OUT = VAULT / "2_paper/文獻庫"
TASKS = VAULT / "2_paper/任務"                                       # 任務頁（程式產生）
DATA = VAULT / "2_paper/文獻庫資料"
CACHE = DATA / "openalex"
CARDS = VAULT / "2_paper/notes"
AINOTES = VAULT / "2_paper/AI筆記"
COVERS = VAULT / "1_attachment/封面"                                 # 文章頁封面圖（程式產生）
TODAY = date.today().isoformat()
MARK = "<!-- litlib: 自動產生 -->"

# ───────── 紀錄格式 ─────────
EVIDENCE = ["全文", "摘要", "他人描述", "僅書目", "AI 記憶"]          # 由強到弱
SCHEMA = {
    "任務": {"必填": ["代號", "名稱", "類型"], "選填": ["日期", "說明", "筆記"],
             "列舉": {"類型": ["搜尋", "整理", "閱讀", "寫作"]}},
    "搜尋": {"必填": ["任務", "方式"], "選填": ["日期", "代號", "資料庫", "查詢", "年份", "期刊", "結果數", "起點", "方向", "說明"],
             "列舉": {"方式": ["關鍵字搜尋", "引用追蹤"], "方向": ["往前", "往後"]}},
    "來源": {"必填": ["文章", "方式", "為何抓"], "選填": ["日期", "任務", "搜尋", "citekey"],
             "列舉": {"方式": ["關鍵字搜尋", "引用追蹤", "使用者提供", "舊清單"]}},
    "決策": {"必填": ["文章", "由"], "選填": ["日期", "任務", "狀態", "理由", "角色", "必引度", "citekey"],
             "列舉": {"由": ["AI", "使用者"], "狀態": ["候選", "要讀", "已排除"],
                      "角色": ["論點", "實驗", "理論", "綜述"], "必引度": [1, 2, 3]}},
    "標籤": {"必填": ["文章", "由"], "選填": ["日期", "加", "移除", "理由", "citekey"],
             "列舉": {"由": ["AI", "使用者"]}},
    "AI閱讀": {"必填": ["文章", "程度", "依據", "主要貢獻"], "選填": ["日期", "版本", "筆記", "摘要來源", "citekey"],
               "列舉": {"程度": [0, 1, 2, 3], "依據": EVIDENCE, "版本": ["期刊版", "預印本", "會議版"]}},
}
AI_LEVEL = {0: "只有書目", 1: "讀摘要", 2: "讀部分內文", 3: "讀全文"}
HUMAN_LEVEL = {0: "沒看", 1: "看過標題", 2: "讀過摘要", 3: "略讀", 4: "精讀"}
HUMAN_TAG = {f"閱讀/{v}": k for k, v in HUMAN_LEVEL.items()}
COLOR = {"#ffd400": "🟡", "#ff6666": "🔴", "#5fb236": "🟢", "#2ea8e5": "🔵",
         "#a28ae5": "🟣", "#e56eee": "🟣", "#f19837": "🟠", "#aaaaaa": "⚪"}
AI_COLOR = "#aaaaaa"
PAPER_CHAT_TAG = "paper-chat"                                         # Paper Chat 外掛畫的標註和寫的筆記，不算人類閱讀
TODO_COLORS = {"#a28ae5", "#e56eee"}                                  # 紫 = 待查

def norm_id(s):
    s = (s or "").strip()
    if re.match(r"^(zotero|openalex|arxiv):", s, re.I):
        return s.split(":", 1)[0].lower() + ":" + s.split(":", 1)[1]
    s = re.sub(r"^(https?://(dx\.)?doi\.org/|doi:)", "", s, flags=re.I)
    return s.lower()

def config():
    p = DATA / "設定.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}

def _nm(s):
    return re.sub(r"[^a-z]", "", ascii_fold(s or "").lower())

def _initials(first):
    return "".join(w[0] for w in re.split(r"[\s\-‐‑.]+", ascii_fold(first or "").lower()) if w)

def team_members(creators):
    """作者（姓, 名）比對設定.json 的本團隊名單；名可以是全名或縮寫（S.-W.）"""
    hits = []
    for m in config().get("本團隊", []):
        for last, first in creators:
            if _nm(last) == _nm(m["姓"]) and (_nm(first) == _nm(m["名"]) or
                                               (first and _initials(first) == _initials(m["名"]) and len(_nm(first)) <= len(_initials(m["名"])))):
                hits.append(m["名稱"]); break
    return hits

def tag_list(entries, z, team):
    """標籤紀錄依序加減＋使用者在 Zotero 打的詞表內 tag＋本團隊"""
    cfg = config()
    vocab = cfg.get("標籤詞表", {})
    tags = {t for t in (z["tags"] if z else []) if t in vocab}
    for e in entries:
        tags |= set(e.get("加", [])); tags -= set(e.get("移除", []))
    if team: tags.add(cfg.get("本團隊tag", "our-lab"))
    return sorted(tags)

def load_log(kind):
    p = DATA / f"{kind}.jsonl"
    if not p.exists(): return []
    return [json.loads(l) for l in p.read_text(encoding="utf-8").splitlines() if l.strip()]

# ───────── OpenAlex ─────────
OA_FIELDS = ("id,doi,title,publication_year,publication_date,type,cited_by_count,open_access,best_oa_location,"
             "primary_location,authorships,keywords,primary_topic,abstract_inverted_index,referenced_works")

def cache_path(doi):
    return CACHE / (urllib.parse.quote(doi, safe="") + ".json")

def oa_trim(w):
    src = ((w.get("primary_location") or {}).get("source") or {})
    best, oa = w.get("best_oa_location") or {}, w.get("open_access") or {}
    inv = w.get("abstract_inverted_index") or {}
    pos = sorted((i, word) for word, ii in inv.items() for i in ii)
    return {"id": (w.get("id") or "").rsplit("/", 1)[-1], "doi": norm_id(w.get("doi")),
            "title": w.get("title"), "year": w.get("publication_year"), "date": w.get("publication_date"),
            "type": w.get("type"), "venue": src.get("display_name"),
            "authors": [a["author"]["display_name"] for a in w.get("authorships") or []],
            "cited_by": w.get("cited_by_count"),
            "oa": {"is_oa": oa.get("is_oa"), "status": oa.get("oa_status"),
                   "url": best.get("pdf_url") or best.get("landing_page_url") or oa.get("oa_url"),
                   "version": best.get("version")},
            "keywords": [k["display_name"] for k in w.get("keywords") or []],
            "topic": (w.get("primary_topic") or {}).get("display_name"),
            "abstract": " ".join(word for _, word in pos) or None,
            "refs": [r.rsplit("/", 1)[-1] for r in w.get("referenced_works") or []],
            "fetched": TODAY}

def oa_get(path, **params):
    key = read_key("openalex")                                        # 沒有金鑰也能用，只是額度較低
    q = urllib.parse.urlencode({**params, "select": OA_FIELDS, **({"api_key": key} if key else {})})
    with urllib.request.urlopen(f"https://api.openalex.org/{path}?{q}", context=SSL_CTX, timeout=30) as r:
        return json.load(r)

def simple(t):
    return re.sub(r"[^a-z0-9]", "", ascii_fold(t or "").lower())

def openalex(doi, refresh=False, title=None):
    """回傳精簡後的 OpenAlex 紀錄；DOI 查不到時用標題完全比對再找一次（arXiv 新 DOI 常查不到）；
    都查不到回傳 {"missing": True}。結果存快取（進 git）。"""
    p = cache_path(doi)
    if p.exists() and not refresh:
        return json.loads(p.read_text(encoding="utf-8"))
    try:
        rec = oa_trim(oa_get(f"works/doi:{urllib.parse.quote(doi, safe='/')}"))
    except urllib.error.HTTPError as e:
        if e.code != 404: raise
        rec = {"missing": True, "doi": doi, "fetched": TODAY}
        if title:
            words = re.sub(r"[^\w\s]", " ", ascii_fold(title))
            hits = oa_get("works", filter=f"title.search:{words}", per_page=5).get("results", [])
            same = [w for w in hits if simple(w.get("title")) == simple(title)]
            if same:
                rec = {**oa_trim(same[0]), "matched_by": "標題"}
    CACHE.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(rec, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return rec

# ───────── Zotero ─────────
def note_first_line(h):
    t = html.unescape(re.sub(r"<[^>]+>", "\n", h or ""))
    return next((l.strip() for l in t.splitlines() if l.strip()), "")

def zotero():
    con = sqlite3.connect(ZDB, uri=True)
    q = lambda s: con.execute(s).fetchall()
    deleted = {r[0] for r in q("select itemID from deletedItems")}
    items = {i: {"itemID": i, "key": k, "type": t, "added": a[:10], "fields": {}, "creators": [], "tags": [],
                 "auto_tags": [], "collections": [], "atts": [], "notes": []}
             for i, k, t, a in q("""select i.itemID, i.key, it.typeName, i.dateAdded from items i join itemTypes it using(itemTypeID)
                                     where it.typeName not in ('attachment','note','annotation')""") if i not in deleted}
    for i, f, v in q("select d.itemID, f.fieldName, v.value from itemData d join fields f using(fieldID) join itemDataValues v using(valueID)"):
        if i in items: items[i]["fields"][f] = v
    for i, last, first, ct in q("""select ic.itemID, c.lastName, c.firstName, ct.creatorType from itemCreators ic
                                   join creators c using(creatorID) join creatorTypes ct using(creatorTypeID) order by ic.itemID, ic.orderIndex"""):
        if i in items and ct == "author": items[i]["creators"].append((last or "", first or ""))
    tags = {}
    for i, name, typ in q("select it.itemID, t.name, it.type from itemTags it join tags t using(tagID)"):
        tags.setdefault(i, []).append((name, typ))
    for i, it in items.items():
        it["tags"] = sorted(n for n, t in tags.get(i, []) if t == 0)
        it["auto_tags"] = sorted(n for n, t in tags.get(i, []) if t == 1)
    cols = {c: (n, p) for c, n, p in q("select collectionID, collectionName, parentCollectionID from collections")}
    def cpath(c):
        n, p = cols[c]
        return (cpath(p) + "/" if p in cols else "") + n
    for c, i in q("select collectionID, itemID from collectionItems"):
        if i in items and c in cols: items[i]["collections"].append(cpath(c))
    pages = dict(q("select itemID, totalPages from fulltextItems"))
    atts = {}
    for a, k, parent, ctype, path, last, added in q("""select a.itemID, i.key, a.parentItemID, a.contentType, a.path, a.lastRead,
                                                      i.dateAdded from itemAttachments a join items i using(itemID) order by i.dateAdded"""):
        if parent in items and a not in deleted and ctype == "application/pdf":
            atts[a] = {"key": k, "path": path, "lastRead": last, "pages": pages.get(a), "added": added, "annots": []}
            items[parent]["atts"].append(atts[a])
    for a, k, parent, typ, color, comment, sort, position in q("""select an.itemID, i.key, an.parentItemID, an.type, an.color, an.comment,
                                                                an.sortIndex, an.position from itemAnnotations an join items i using(itemID)
                                                                order by an.sortIndex"""):
        if parent in atts and a not in deleted:
            try: pos = json.loads(position)
            except Exception: pos = {}
            atts[parent]["annots"].append({"key": k, "type": typ, "color": (color or "").lower(),
                                           "comment": bool((comment or "").strip()), "text": (comment or "").strip(),
                                           "page": pos.get("pageIndex"), "rects": pos.get("rects"),
                                           "tags": [n for n, _ in tags.get(a, [])]})
    for n, parent, note in q("select itemID, parentItemID, note from itemNotes"):
        if parent in items and n not in deleted and not any(t == PAPER_CHAT_TAG for t, _ in tags.get(n, [])):
            items[parent]["notes"].append(note_first_line(note))
    return list(items.values())

def att_file(att):
    return str(storage_file(att["key"], att["path"]))

def pdf_pages(att):
    if att["pages"]: return att["pages"]
    try:
        import pymupdf
        p = att_file(att)
        return pymupdf.open(p).page_count if os.path.exists(p) else None
    except Exception:
        return None

# ───────── 封面：指定（評論開頭 cover 的框選圖）> 第一張框選圖 > 自動從 PDF 截 ─────────
IMAGE_ANNOT = 3                                                       # Zotero 的「選擇區域」圖片標註
COVER_WIDTH = 800                                                     # 輸出寬度（像素）
AUTO_RULE = "v2"                                                      # 自動選圖規則改了就改這裡，舊的自動封面會重畫

def choose_cover(z):
    """回傳 (來源說明, 附件, 標註或 None)；附件依加入順序，第一個通常是正文"""
    atts = [a for a in z["atts"] if os.path.exists(att_file(a))]
    if not atts: return None
    imgs = [(a, an) for a in atts for an in a["annots"] if an["type"] == IMAGE_ANNOT and an["rects"] and an["page"] is not None]
    pick = next(((a, an) for a, an in imgs if an["text"].lower().startswith("cover")), None)
    if pick: return f"指定 {pick[1]['key']} {pick[1]['page']} {pick[1]['rects']}", pick[0], pick[1]
    if imgs: return f"第一張框選圖 {imgs[0][1]['key']} {imgs[0][1]['page']} {imgs[0][1]['rects']}", imgs[0][0], imgs[0][1]
    st = os.stat(att_file(atts[0]))
    return f"自動 {AUTO_RULE} {atts[0]['key']} {st.st_size} {int(st.st_mtime)}", atts[0], None

def render_cover(att, an, out):
    import pymupdf
    doc = pymupdf.open(att_file(att))
    if an:                                                            # Zotero 座標是 PDF 原生座標（左下為原點）
        pg = doc[an["page"]]
        r = pymupdf.Rect()
        for x in an["rects"]: r |= pymupdf.Rect(x)
        clip = (r * pg.transformation_matrix).normalize() & pg.rect
    else:                                                             # 前 3 頁最大的點陣圖；沒有就截第 1 頁上方
        best, clip, pg = 0, None, doc[0]
        for p in doc.pages(0, min(3, doc.page_count)):
            area = p.rect.width * p.rect.height
            for im in p.get_image_info():
                b = pymupdf.Rect(im["bbox"]) & p.rect
                if (b.width >= 0.3 * p.rect.width and b.width <= 3 * b.height   # 排除期刊橫幅、logo
                        and b.width * b.height >= 0.08 * area and b.width * b.height > best):
                    best, clip, pg = b.width * b.height, b, p
        if clip is None:
            w = pg.rect.width
            clip = pymupdf.Rect(0, 0, w, w / 1.4)
    zoom = min(COVER_WIDTH / clip.width, 4)
    pix = pg.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), clip=clip, alpha=False)
    out.parent.mkdir(parents=True, exist_ok=True)
    pix.save(str(out), jpg_quality=80)

def update_covers(papers, warn):
    """每篇有 PDF 的文章產生 1_attachment/封面/{citekey}.jpg；來源沒變就不重畫（避免 git 雜訊）"""
    state_f = COVERS / "來源.json"
    state = json.loads(state_f.read_text(encoding="utf-8")) if state_f.exists() else {}
    new, made = {}, []
    for p in papers.values():
        z = p["zotero"]
        pick = choose_cover(z) if z else None
        if not pick: continue
        ck, (sig, att, an) = p["citekey"], pick
        out = COVERS / f"{ck}.jpg"
        if state.get(ck) != sig or not out.exists():
            try:
                render_cover(att, an, out); made.append(f"{ck}（{sig.split()[0]}）")
            except Exception as e:
                warn.append(f"{ck} 封面產生失敗：{e}"); continue
        new[ck] = sig
        p["cover"] = f"[[{out.relative_to(VAULT).as_posix()}]]"
    for f in COVERS.glob("*.jpg") if COVERS.exists() else []:
        if f.stem not in new: f.unlink()
    if new != state:
        COVERS.mkdir(parents=True, exist_ok=True)
        state_f.write_text(json.dumps(new, ensure_ascii=False, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    return made

def reading_signals(z):
    """由 Zotero 畫記推斷人類閱讀程度（規則.md §7）"""
    s = {"has_pdf": bool(z["atts"]), "human": 0, "colors": {}, "comments": 0, "pages": None,
         "last_opened": None, "ai": 0, "adopted": 0, "todo": 0, "pdf_key": None}
    if z["atts"]:
        main = max(z["atts"], key=lambda a: len(a["annots"]))
        s["pdf_key"] = main["key"]
        reads = [a["lastRead"] for a in z["atts"] if a["lastRead"]]
        if reads: s["last_opened"] = datetime.fromtimestamp(max(reads), timezone.utc).astimezone().date().isoformat()
        hpages = set()
        for a in z["atts"]:
            for an in a["annots"]:
                is_ai = any(t.startswith("AI/") for t in an["tags"])
                if an["color"] == AI_COLOR or PAPER_CHAT_TAG in an["tags"]:
                    s["ai"] += 1; continue
                if is_ai: s["adopted"] += 1
                s["human"] += 1
                e = COLOR.get(an["color"], "🔘")
                s["colors"][e] = s["colors"].get(e, 0) + 1
                s["comments"] += an["comment"]
                s["todo"] += an["color"] in TODO_COLORS
                if a is main and an["page"] is not None: hpages.add(an["page"])
        total = pdf_pages(main)
        if total: s["pages"] = (len(hpages), total)
    override = [HUMAN_TAG[t] for t in z["tags"] if t in HUMAN_TAG]
    if override:
        s["level"], s["level_by"] = override[0], "tag"
    else:
        notes = len([n for n in z["notes"] if n])
        if s["human"]:
            frac = s["pages"][0] / s["pages"][1] if s["pages"] else 0
            lvl = 2 if frac <= 0.5 else (4 if (s["comments"] or notes) else 3)
        else:
            lvl = 1 if s["last_opened"] else 0
        s["level"], s["level_by"] = lvl, "推斷"
    return s

# ───────── citekey（尚未進 Zotero 的候選用暫定代碼，公式同 BBT：auth.lower + shorttitle(3,3) + year）─────────
SKIP = set("a an the of in on at for and or to with by via from into as is are be its their this that using toward towards".split())

def ascii_fold(s):
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()

def provisional_citekey(oa, taken):
    last = (oa.get("authors") or ["anon"])[0].split()[-1]
    auth = re.sub(r"[^a-z0-9-]", "", ascii_fold(last).lower()) or "anon"
    words = []
    for w in (oa.get("title") or "").split():
        w2 = re.sub(r"[^A-Za-z0-9]", "", ascii_fold(w))
        if w2 and w2.lower() not in SKIP: words.append(w2[0].upper() + w2[1:])
        if len(words) == 3: break
    base = f"{auth}{''.join(words)}{oa.get('year') or ''}"
    key, n = base, 0
    while key in taken:
        key = base + "abcdefghijklmnopqrstuvwxyz"[n]; n += 1
    return key

# ───────── 組合 ─────────
def gather(refresh=False, extra=None):
    """extra：尚未寫入的紀錄（批次預覽用），接在紀錄檔之後。"""
    warn, papers = [], {}
    for z in zotero():
        f = z["fields"]
        if not f.get("title") and not f.get("DOI"):
            warn.append(f"Zotero 空白條目 {z['key']}（沒有標題也沒有 DOI），略過"); continue
        pid = norm_id(f["DOI"]) if f.get("DOI") else f"zotero:{z['key']}"
        if pid in papers:
            warn.append(f"Zotero 重複 DOI {pid}：{papers[pid]['zotero']['key']} 與 {z['key']}，只用前者"); continue
        ck = f.get("citationKey") or ""
        if not ck or ck.startswith("zotero-item-"):
            warn.append(f"{z['key']} 沒有正式 citekey，請在 Zotero 檢查 Better BibTeX"); ck = ck or f"zotero-{z['key']}"
        papers[pid] = {"id": pid, "citekey": ck, "zotero": z}
    logs = {k: load_log(k) + (extra or {}).get(k, []) for k in SCHEMA}
    taken = {p["citekey"] for p in papers.values()}
    for kind in ("來源", "決策", "AI閱讀", "標籤"):
        for e in logs[kind]:
            pid = norm_id(e["文章"])
            if pid not in papers:
                papers[pid] = {"id": pid, "citekey": None, "zotero": None}
            papers[pid].setdefault("logs", {}).setdefault(kind, []).append(e)
    for p in papers.values():
        doi = p["id"] if not re.match(r"^\w+:", p["id"]) else None
        title = p["zotero"]["fields"].get("title") if p["zotero"] else None
        p["oa"] = openalex(doi, refresh, title) if doi else {"missing": True}
        if p["oa"].get("missing") and doi: warn.append(f"OpenAlex 查不到 {doi}")
        if not p["citekey"]:
            if p["oa"].get("missing"):
                warn.append(f"{p['id']} 不在 Zotero、OpenAlex 也查不到，無法產生頁面"); p["skip"] = True; continue
            p["citekey"] = provisional_citekey(p["oa"], taken); p["provisional"] = True
            taken.add(p["citekey"])
    papers = {k: v for k, v in papers.items() if not v.get("skip")}
    by_oa = {p["oa"]["id"]: p for p in papers.values() if p["oa"].get("id")}
    for p in papers.values():
        p["cites"] = sorted({by_oa[r]["citekey"] for r in p["oa"].get("refs", []) if r in by_oa} - {p["citekey"]})
        p.setdefault("cited_by_lib", [])
    for p in papers.values():
        for c in p["cites"]:
            next(q for q in papers.values() if q["citekey"] == c)["cited_by_lib"].append(p["citekey"])
    return papers, logs, warn

# ───────── 文章頁 ─────────
def yval(v):
    if v is None or v == "" or v == []: return ""
    if isinstance(v, bool): return "true" if v else "false"
    if isinstance(v, (int, float)): return str(v)
    return json.dumps(str(v), ensure_ascii=False)

def frontmatter(d):
    out = ["---"]
    for k, v in d.items():
        if isinstance(v, list):
            out.append(f"{k}:" + ("" if v else " []"))
            out += [f"  - {yval(x)}" for x in v]
        else:
            out.append(f"{k}: {yval(v)}".rstrip())
    return "\n".join(out + ["---"])

def card_cover(ck):
    p = CARDS / f"{ck} 閱讀卡.md"
    if not p.exists(): return None, None
    m = re.search(r'^cover:\s*"?(\[\[[^\]]+\]\])"?\s*$', p.read_text(encoding="utf-8"), re.M)
    return f"[[{ck} 閱讀卡]]", (m.group(1) if m else None)

def page(p, tasks):
    z, oa, L = p["zotero"], p["oa"], p.get("logs", {})
    f = z["fields"] if z else {}
    ck = p["citekey"]
    title = f.get("title") or oa.get("title") or ck
    authors = [f"{fi} {l}".strip() for l, fi in z["creators"]] if z and z["creators"] else oa.get("authors", [])
    year = (re.search(r"\d{4}", f.get("date", "")) or [None])[0] if z else None
    year = int(year) if year else oa.get("year")
    venue = f.get("publicationTitle") or f.get("proceedingsTitle") or f.get("repository") or oa.get("venue")
    doi = None if re.match(r"^\w+:", p["id"]) else p["id"]
    sig = reading_signals(z) if z else None
    creators = z["creators"] if z and z["creators"] else [(a.split()[-1], " ".join(a.split()[:-1])) for a in oa.get("authors", []) if a.split()]
    team = team_members(creators)
    # 決策：狀態取最新；引用（角色、必引度）依任務各取最新
    dec = L.get("決策", [])
    sts = [e for e in dec if e.get("狀態")]
    status = sts[-1]["狀態"] if sts else ("要讀" if z else "候選")
    uses = {}
    for e in dec:
        if e.get("角色") or e.get("必引度"): uses[e.get("任務") or "—"] = e
    reads = L.get("AI閱讀", [])
    ai = reads[-1] if reads else None
    ai_level = max((e["程度"] for e in reads), default=0)
    srcs = L.get("來源", [])
    found = min([e.get("日期", "9999") for e in srcs] + ([z["added"]] if z else [])) if (srcs or z) else None
    task_ids = sorted({e["任務"] for k in ("來源", "決策") for e in L.get(k, []) if e.get("任務")})
    card, _ = card_cover(ck)
    cover = p.get("cover")
    # AI 閱讀筆記：AI筆記資料夾的檔案，加上 AI閱讀紀錄裡登記的筆記（可能是其他資料夾的舊筆記）
    ai_notes = ([f"[[{ck} AI筆記]]"] if (AINOTES / f"{ck} AI筆記.md").exists() else []) + [e["筆記"] for e in reads if e.get("筆記")]
    ai_notes = [n for n in dict.fromkeys(ai_notes) if n != card]
    ai_note = ai_notes[0] if ai_notes else None
    if z and z["atts"]: fulltext = "已在 Zotero"
    elif (oa.get("oa") or {}).get("is_oa"): fulltext = "有免費版"
    elif oa.get("missing"): fulltext = "未知"
    else: fulltext = "需要授權"
    why = srcs[-1]["為何抓"] if srcs else ("手動加入 Zotero" if z else "")
    topics = [t for t in (z["tags"] if z else []) if "/" in t and not t.startswith(("AI/", "閱讀/"))]
    keywords = (z["auto_tags"] if z and z["auto_tags"] else oa.get("keywords", []))[:8]
    cite_lvl = max((int(e.get("必引度") or 0) for e in uses.values()), default=0)

    fm = {
        "citekey": ck, "title": title, "authors": authors[:3] + (["et al."] if len(authors) > 3 else []),
        "first_author": (z["creators"][0][0] if z and z["creators"] else (authors[0].split()[-1] if authors else "")), "year": year, "journal": venue,
        "doi": doi, "status": status, "contribution": ai["主要貢獻"] if ai else "",
        "evidence": ai["依據"] if ai else "", "why": why,
        "ai_level": ai_level, "human_level": sig["level"] if sig else 0,
        "human_level_by": sig["level_by"] if sig else "", "annotations": sig["human"] if sig else 0,
        "annotation_colors": " ".join(f"{e}{n}" for e, n in sorted(sig["colors"].items())) if sig else "",
        "comments": sig["comments"] if sig else 0,
        "annotated_pages": f"{sig['pages'][0]}/{sig['pages'][1]}" if sig and sig["pages"] and sig["human"] else "",
        "todo": sig["todo"] if sig else 0, "ai_annotations": sig["ai"] if sig else 0,
        "ai_adopted": sig["adopted"] if sig else 0, "last_opened": sig["last_opened"] if sig else None,
        "in_zotero": bool(z), "has_pdf": bool(sig and sig["has_pdf"]), "fulltext": fulltext,
        "oa_url": (oa.get("oa") or {}).get("url") if fulltext == "有免費版" else None,
        "cited_by": oa.get("cited_by"), "cited_by_date": oa.get("fetched") if oa.get("cited_by") is not None else None,
        "cite_level": cite_lvl or None, "found": found,
        "tasks": [f"[[{t}]]" if t in tasks else t for t in task_ids],   # 連到任務頁
        "topics": topics, "collections": z["collections"] if z else [], "keywords": keywords,
        "cites": [f"[[{c}]]" for c in p["cites"]], "cited_by_lib": [f"[[{c}]]" for c in sorted(p["cited_by_lib"])],
        "card": card, "ai_note": ai_note, "cover": cover,
        "zotero": f"zotero://select/library/items/{z['key']}" if z else None,
        "pdf": f"zotero://open-pdf/library/items/{sig['pdf_key']}" if sig and sig["pdf_key"] else None,
        "provisional_citekey": True if p.get("provisional") else None,
        "our_lab": True if team else None, "our_lab_members": team,
        "tags": tag_list(L.get("標籤", []), z, team),
        "cssclasses": ["litlib"],  # 配合 .obsidian/snippets/litlib.css 只顯示常用屬性
    }
    fm = {k: v for k, v in fm.items() if v is not None}

    B = [frontmatter(fm), MARK,
         "<small>自動產生，請勿編輯：手改會被重建覆蓋。要改狀態跟 Claude 說；想法寫在 Zotero 筆記或閱讀卡。</small>",
         "", f"# {title}", ""]
    meta = [", ".join(authors[:6]) + (" et al." if len(authors) > 6 else ""), f"*{venue}*" if venue else "", str(year or "")]
    B.append(" · ".join(x for x in meta if x))
    if team: B += ["", f"🏠 **本團隊**：{'、'.join(team)}"]
    links = []
    if doi: links.append(f"[DOI](https://doi.org/{doi})")
    if fm.get("zotero"): links.append(f"[在 Zotero 選取]({fm['zotero']})")
    if fm.get("pdf"): links.append(f"[開啟 PDF]({fm['pdf']})")
    elif fm.get("oa_url"): links.append(f"[免費全文]({fm['oa_url']})")
    B += ["", " ｜ ".join(links)] if links else []
    if p.get("provisional"):
        B += ["", "<small>暫定代碼：尚未存進 Zotero，存入後代碼可能改變。</small>"]

    B += ["", "## 主要貢獻", ""]
    B.append(f"{ai['主要貢獻']}（依據：{ai['依據']}，{ai.get('日期', '')}）" if ai else "（AI 還沒讀）")
    B += ["", "## 相關筆記", "",
          f"- **AI 閱讀筆記**：{'、'.join(ai_notes) or '（還沒有）'}",
          f"- **文獻卡片**：{card or '（還沒有）'}"]

    if task_ids or uses:
        B += ["", "## 任務", ""]
        for t in sorted(set(task_ids) | set(uses) - {"—"}):
            info = tasks.get(t, {})
            rel = []
            if any(e.get("任務") == t for e in srcs): rel.append("找到")
            u = uses.get(t)
            if u: rel.append(f"使用：{u.get('角色', '')} {'★' * int(u.get('必引度') or 0)}".rstrip())
            if sts and sts[-1].get("任務") == t and sts[-1]["狀態"] == "已排除":
                rel.append("排除" + (f"（{sts[-1]['理由']}）" if sts[-1].get("理由") else ""))
            name = (f"[[{t}|{info['名稱']}]]" if info else t) + (f"（{info['筆記']}）" if info.get("筆記") else "")
            B.append(f"- {name}：{'、'.join(rel) or '相關'}")

    abstract = f.get("abstractNote") or oa.get("abstract")
    if abstract:
        B += ["", "## 摘要", "", abstract.strip()]

    if p["cites"] or p["cited_by_lib"]:
        B += ["", "## 本庫引用關係", ""]
        if p["cites"]: B.append("- 引用了：" + "、".join(f"[[{c}]]" for c in p["cites"]))
        if p["cited_by_lib"]: B.append("- 被引用：" + "、".join(f"[[{c}]]" for c in sorted(p["cited_by_lib"])))

    if keywords or oa.get("topic"):
        B += ["", "## 關鍵字", "", "、".join(keywords) + (f"（OpenAlex 主題：{oa['topic']}）" if oa.get("topic") else "")]
    B += ["", "## 為何收錄", ""]
    for e in srcs:
        extra = "".join(f"，{x}" for x in (e.get("任務") and f"任務 {e['任務']}", e.get("搜尋") and f"搜尋 {e['搜尋']}") if x)
        B.append(f"- {e.get('日期', '')}（{e['方式']}{extra}）：{e['為何抓']}")
    if z:
        B.append(f"- {z['added']}（手動加入 Zotero" + (f"，分類 {'、'.join(z['collections'])}" if z["collections"] else "") + "）")
    return "\n".join(B) + "\n"

# ───────── 任務頁 ─────────
def task_page(t, papers, searches, pending=None):
    """任務頁：目的（任務說明）→ 結果（各狀態的文章，含摘要）→ 搜尋過程（每次查詢收了什麼）。
    pending：預覽模式，傳入批次檔裡的文章代號；這些文章標 🆕，頁首註明尚未匯入。"""
    tid = t["代號"]
    rows = []
    for p in papers.values():
        L, z, oa = p.get("logs", {}), p["zotero"], p["oa"]
        srcs = [e for e in L.get("來源", []) if e.get("任務") == tid]
        dec = L.get("決策", [])
        if not srcs and not any(e.get("任務") == tid for e in dec): continue
        sts = [e for e in dec if e.get("狀態")]
        use = ([e for e in dec if e.get("任務") == tid and (e.get("角色") or e.get("必引度"))] or [None])[-1]
        f = z["fields"] if z else {}
        year = (re.search(r"\d{4}", f.get("date", "")) or [None])[0] or oa.get("year")
        venue = f.get("publicationTitle") or f.get("proceedingsTitle") or f.get("repository") or oa.get("venue")
        ai = (L.get("AI閱讀") or [None])[-1]
        doi = None if re.match(r"^\w+:", p["id"]) else p["id"]
        rows.append({"ck": p["citekey"], "id": p["id"], "status": sts[-1]["狀態"] if sts else ("要讀" if z else "候選"),
                     "reason": sts[-1].get("理由", "") if sts else "", "use": use, "ai": ai,
                     "title": f.get("title") or oa.get("title") or p["citekey"],
                     "who": ((z["creators"][0][0] if z and z["creators"] else (oa.get("authors") or [""])[0].split()[-1:] and (oa.get("authors") or [""])[0].split()[-1])
                             + (" 等" if len(z["creators"] if z and z["creators"] else oa.get("authors", [])) > 1 else "")),
                     "year": year, "tags": [x for x in tag_list(L.get("標籤", []), z, []) if "/" in x],
                     "abstract": f.get("abstractNote") or oa.get("abstract"),
                     "why": srcs[-1]["為何抓"] if srcs else "",
                     "where": " ｜ ".join(str(x) for x in (f"*{venue}*" if venue else None,
                                                          oa.get("cited_by") is not None and f"被引 {oa['cited_by']}",
                                                          doi and f"[DOI](https://doi.org/{doi})",
                                                          not (z and z["atts"]) and (oa.get("oa") or {}).get("url") and f"[免費全文]({oa['oa']['url']})") if x),
                     "searches": {e["搜尋"] for e in srcs if e.get("搜尋")}})
    rows.sort(key=lambda r: r["ck"])
    by = lambda s: [r for r in rows if r["status"] == s]
    lk = lambda r: f"[[{r['ck']}]]" if (OUT / f"{r['ck']}.md").exists() else r["ck"]   # 還沒匯入的沒有文章頁
    mixed = pending is not None and any(r["id"] not in pending for r in rows)        # 預覽裡混有已在庫內的文章才標 🆕
    def entry(r):
        new = "🆕 " if mixed and r["id"] in pending else ""
        page = f"[[{r['ck']}|文章頁]]" if (OUT / f"{r['ck']}.md").exists() else None
        out = ["", f"### {new}{r['who']} {r['year'] or ''}：{r['title']}", "", " ｜ ".join(x for x in (r["where"], page) if x), ""]
        if r["status"] == "已排除": out.append(f"- **排除理由**：{r['reason'] or '（沒寫理由）'}")
        if r["ai"]: out.append(f"- **主要貢獻**（依據：{r['ai']['依據']}）：{r['ai']['主要貢獻']}")
        elif r["status"] != "已排除": out.append("- **主要貢獻**：（AI 還沒讀）")
        if r["why"]: out.append(f"- **為何抓**：{r['why']}")
        u = r["use"]
        if u: out.append(f"- **使用**：{u.get('角色', '')} {'★' * int(u.get('必引度') or 0)}".rstrip())
        if r["tags"]: out.append(f"- **標籤**：{'、'.join(r['tags'])}")
        if r["abstract"]: out += ["", "> " + " ".join(r["abstract"].split())]
        return out

    mine = [s for s in searches if s["任務"] == tid]
    fm = {"task": tid, "name": t["名稱"], "type": t["類型"], "created": t.get("日期"), "searches": len(mine),
          "papers": len(rows), "to_read": len(by("要讀")), "candidates": len(by("候選")), "excluded": len(by("已排除"))}
    B = [frontmatter(fm), MARK,
         "<small>自動產生，請勿編輯：手改會被重建覆蓋。要改狀態或補充說明跟 Claude 說。</small>"]
    B += ["", f"# {'待匯入：' if pending is not None else ''}{t['名稱']}", ""]
    if pending is not None:
        B += [f"> {'標 🆕 的' if mixed else '這些'}文章**還沒進文獻庫**。看完跟 Claude 說哪些要、哪些不要，再匯入。這個檔案匯入後會刪除。", ""]
    B += [
         " ｜ ".join(x for x in (f"類型：{t['類型']}", f"建立：{t.get('日期', '')}", t.get("筆記") and f"筆記：{t['筆記']}") if x),
         "", "**目的**：" + (t.get("說明") or "（沒寫說明）"),
         "", f"**結果**：共 {len(rows)} 篇——要讀 {len(by('要讀'))}、候選 {len(by('候選'))}、已排除 {len(by('已排除'))}。"]
    for s in ("要讀", "候選", "已排除"):
        if by(s): B += ["", f"## {s}（{len(by(s))}）"] + [x for r in by(s) for x in entry(r)]

    B += ["", "## 搜尋過程"]
    day = None
    for s in mine:
        if s.get("日期") != day:
            day = s.get("日期"); B += ["", f"### {day}", ""]
        what = f"`{s['查詢']}`" if s.get("查詢") else f"{s.get('起點', '')} {s.get('方向', '')}".strip()
        bits = [f"**{s['代號']}**", s["方式"], s.get("資料庫"), what, s.get("年份") and f"年份 {s['年份']}",
                s.get("結果數") is not None and f"結果 {s['結果數']} 筆"]
        B.append("- " + "｜".join(x for x in bits if x))
        if s.get("說明"): B.append(f"  - 說明：{s['說明']}")
        hit = [r for r in rows if s["代號"] in r["searches"]]
        kept, out = [r for r in hit if r["status"] != "已排除"], [r for r in hit if r["status"] == "已排除"]
        if kept: B.append("  - 收錄：" + "、".join(lk(r) for r in kept))
        if out: B.append("  - 排除：" + "、".join(lk(r) for r in out))
        if not hit: B.append("  - 沒有收錄或排除的文章")
    if not mine: B += ["", "（還沒有搜尋紀錄）"]
    other = [r for r in rows if not r["searches"]]
    if other: B += ["", "### 不是由搜尋找到的", ""] + [f"- {lk(r)}" for r in other]
    return "\n".join(B) + "\n"

def rebuild(refresh=False):
    papers, logs, warn = gather(refresh)
    covers = update_covers(papers, warn)
    tasks = {t["代號"]: t for t in logs["任務"]}
    tw, tn = [], set()
    for t in logs["任務"]:
        fn = TASKS / f"{t['代號']}.md"; tn.add(fn.name)
        txt = task_page(t, papers, logs["搜尋"])
        if fn.exists() and fn.read_text(encoding="utf-8") == txt: continue
        TASKS.mkdir(parents=True, exist_ok=True); fn.write_text(txt, encoding="utf-8"); tw.append(t["代號"])
    for fn in (TASKS.glob("*.md") if TASKS.exists() else []):
        if fn.name not in tn and MARK in fn.read_text(encoding="utf-8"): fn.unlink(); warn.append(f"任務頁 {fn.stem} 已移除（任務紀錄不存在）")
    OUT.mkdir(parents=True, exist_ok=True)
    wanted, written, same = set(), [], 0
    for p in sorted(papers.values(), key=lambda p: p["citekey"]):
        fn = OUT / f"{p['citekey']}.md"
        if fn.name in wanted: warn.append(f"citekey 重複：{p['citekey']}"); continue
        wanted.add(fn.name)
        if (CARDS / fn.name).exists(): warn.append(f"閱讀卡檔名少了「 閱讀卡」，請改名：2_paper/notes/{fn.name}")
        txt = page(p, tasks)
        if fn.exists() and fn.read_text(encoding="utf-8") == txt: same += 1; continue
        fn.write_text(txt, encoding="utf-8"); written.append(p["citekey"])
    removed = []
    for fn in OUT.glob("*.md"):
        if fn.name not in wanted and MARK in fn.read_text(encoding="utf-8"):
            fn.unlink(); removed.append(fn.stem)
    print(f"文獻庫：{len(wanted)} 篇；更新 {len(written)}、未變 {same}、移除 {len(removed)}")
    for c in written: print(f"  ✏️ {c}")
    if tw: print(f"  📋 任務頁更新 {len(tw)}：{'、'.join(tw)}")
    if covers: print(f"  🖼 封面更新 {len(covers)}：{'、'.join(covers)}")
    for c in removed: print(f"  🗑 {c}（已不在 Zotero 或紀錄中；若是 citekey 改名，請更新其他筆記的連結）")
    for w in warn: print(f"  ⚠️ {w}")
    excluded = lambda p: ([e["狀態"] for e in p.get("logs", {}).get("決策", []) if e.get("狀態")] or [""])[-1] == "已排除"
    todo = [p["citekey"] for p in papers.values() if not excluded(p)                # 排除的只需要理由
            and (not p.get("logs", {}).get("AI閱讀") or not p.get("logs", {}).get("標籤"))]
    if todo: print(f"  📝 缺主要貢獻或標籤（Claude 依摘要補上）：{'、'.join(sorted(todo))}")

# ───────── 查詢 ─────────
def read_fm(p):
    m = re.match(r"---\n(.*?)\n---", p.read_text(encoding="utf-8"), re.S)
    d = {}
    for line in (m.group(1).splitlines() if m else []):
        if ":" in line and not line.startswith(" "):
            k, v = line.split(":", 1)
            d[k] = v.strip().strip('"')
    return d

def library_index():
    """DOI → (citekey, 狀態, 排除理由)。以文章頁為主，再用決策紀錄補上還沒重建的排除。"""
    idx = {}
    for p in OUT.glob("*.md"):
        d = read_fm(p)
        if d.get("doi"): idx[d["doi"]] = (p.stem, d.get("status", ""), "")
    for e in load_log("決策"):
        if e.get("狀態"):
            ck = idx.get(e["文章"], ("（未重建）", "", ""))[0]
            idx[e["文章"]] = (ck, e["狀態"], e.get("理由", "") if e["狀態"] == "已排除" else "")
    return idx

def find(q):
    words = q.lower().split()
    nid = norm_id(q)
    hits = 0
    for p in sorted(OUT.glob("*.md")):
        d = read_fm(p)
        hay = " ".join([p.stem, d.get("title", ""), d.get("doi", ""), d.get("first_author", "")]).lower()
        if d.get("doi") == nid or all(w in hay for w in words):
            hits += 1
            print(f"[[{p.stem}]]  {d.get('year', '')} {d.get('title', '')[:70]}\n"
                  f"    狀態 {d.get('status')}｜AI {d.get('ai_level')}｜你 {d.get('human_level')}｜{d.get('fulltext')}｜doi {d.get('doi', '')}")
    print(f"— 文獻庫命中 {hits} 篇（以上次重建為準）")
    for s in load_log("搜尋"):
        hay = " ".join(str(s.get(k, "")) for k in ("查詢", "起點", "說明", "任務")).lower()
        if any(w in hay for w in words):
            print(f"搜尋紀錄 {s['代號']} {s.get('日期')} [{s['方式']}] {s.get('資料庫', '')}：{s.get('查詢') or s.get('起點')}"
                  f"（年份 {s.get('年份', '—')}，結果 {s.get('結果數', '?')}，任務 {s['任務']}）")

def fetch(doi):
    r = openalex(norm_id(doi))
    if r.get("missing"): sys.exit(f"OpenAlex 查不到 {doi}")
    print(f"{r['title']}\n{', '.join(r['authors'][:6])}{' et al.' if len(r['authors']) > 6 else ''} · {r['venue']} · {r['year']} · {r['type']}")
    print(f"被引 {r['cited_by']}｜開放取用 {r['oa']['status']} {r['oa']['url'] or ''}｜OpenAlex {r['id']}")
    print(f"關鍵字：{'、'.join(r['keywords'])}｜主題：{r['topic']}")
    print(f"\n摘要：{r['abstract'] or '（OpenAlex 沒有摘要）'}")

def show_hits(works, total, abstracts):
    idx = library_index()
    print(f"共 {total} 筆，列出 {len(works)} 筆（★ 已在庫內，✗ 已排除過）")
    for n, w in enumerate(works, 1):
        r = oa_trim(w)
        mark = ""
        if r["doi"] in idx:
            ck, st, why = idx[r["doi"]]
            mark = f"  ✗已排除：{why}" if st == "已排除" else f"  ★庫內 [[{ck}]] {st}"
        au = (r["authors"][0].split()[-1] + (" et al." if len(r["authors"]) > 1 else "")) if r["authors"] else "?"
        print(f"[{n}] {r['year']} {au} — {r['title']} — {r['venue'] or '?'} — 被引 {r['cited_by']} — {r['doi'] or r['id']}{mark}")
        if abstracts:
            print(f"     {(r['abstract'] or '（沒有摘要）')[:400]}")

def search(query, frm=None, to=None, n=25, abstracts=False):
    flt = [f"from_publication_date:{frm}-01-01"] if frm else []
    if to: flt.append(f"to_publication_date:{to}-12-31")
    params = {"search": query, "per_page": n}
    if flt: params["filter"] = ",".join(flt)
    d = oa_get("works", **params)
    show_hits(d.get("results", []), d.get("meta", {}).get("count"), abstracts)
    print(f"\n搜尋紀錄用：資料庫 OpenAlex｜查詢 {query}｜年份 {(frm or '') + '-' + (to or '')}｜結果數 {d.get('meta', {}).get('count')}")

def track(doi, direction, n=50, abstracts=False):
    r = openalex(norm_id(doi))
    if r.get("missing"): sys.exit(f"OpenAlex 查不到 {doi}")
    if direction == "往前":                                   # 它引用了誰
        refs = r.get("refs", [])
        works = []
        for i in range(0, len(refs), 50):
            works += oa_get("works", filter="openalex:" + "|".join(refs[i:i + 50]), per_page=50).get("results", [])
        works.sort(key=lambda w: -(w.get("cited_by_count") or 0))
        show_hits(works[:n], len(refs), abstracts)
    elif direction == "往後":                                 # 誰引用它
        d = oa_get("works", filter=f"cites:{r['id']}", sort="cited_by_count:desc", per_page=n)
        show_hits(d.get("results", []), d.get("meta", {}).get("count"), abstracts)
    else:
        sys.exit("方向只能是 往前 或 往後")
    print(f"\n搜尋紀錄用：方式 引用追蹤｜起點 {norm_id(doi)}｜方向 {direction}")

# ───────── 追加紀錄（格式檢查寫在這裡）─────────
def validate(kind, recs, pending=None):
    """檢查一批紀錄；pending 是同一批次中已檢查過、尚未寫入的其他紀錄。回傳 (整理後紀錄, 錯誤)"""
    if kind not in SCHEMA: return [], [f"類型只能是 {list(SCHEMA)}"]
    pending = pending or {}
    sc = SCHEMA[kind]
    tasks = {t["代號"] for t in load_log("任務") + pending.get("任務", [])}
    searches = load_log("搜尋") + pending.get("搜尋", [])
    reads = load_log("AI閱讀") + pending.get("AI閱讀", [])
    errs, out = [], []
    for n, r in enumerate(recs, 1):
        e = lambda m: errs.append(f"{kind} 第 {n} 筆：{m}")
        for k in sc["必填"]:
            if r.get(k) in (None, "", []): e(f"缺「{k}」")
        for k in r:
            if k not in sc["必填"] + sc["選填"]: e(f"不認得的欄位「{k}」")
        for k, ok in sc["列舉"].items():
            if k in r and r[k] not in ok: e(f"「{k}」只能是 {ok}")
        r = {"日期": TODAY, **r}
        if "文章" in r: r["文章"] = norm_id(r["文章"])
        if r.get("任務") and r["任務"] not in tasks and kind != "任務": e(f"任務「{r['任務']}」還沒登記，先 log 任務")
        if kind == "任務" and r.get("代號") in tasks | {x["代號"] for x in out}: e(f"任務代號「{r['代號']}」已存在")
        if kind == "搜尋":
            if r.get("方式") == "關鍵字搜尋" and not r.get("查詢"): e("關鍵字搜尋要填「查詢」")
            if r.get("方式") == "引用追蹤" and not (r.get("起點") and r.get("方向")): e("引用追蹤要填「起點」與「方向」")
            day = r["日期"].replace("-", "")
            r["代號"] = f"S{day}-{sum(s['代號'].startswith('S' + day) for s in searches + out) + 1}"
        if kind == "來源":
            if r.get("方式") in ("關鍵字搜尋", "引用追蹤"):
                if not r.get("搜尋"): e("關鍵字搜尋／引用追蹤要填「搜尋」代號（先 log 搜尋）")
                elif r["搜尋"] not in {s["代號"] for s in searches}: e(f"找不到搜尋代號 {r['搜尋']}")
        if kind == "決策":
            if not (r.get("狀態") or r.get("角色") or r.get("必引度")): e("至少要有「狀態」或「角色／必引度」")
            if r.get("狀態") == "已排除" and not r.get("理由"): e("排除要附「理由」")
            if r.get("必引度") and r.get("由") == "AI":
                ev = [x["依據"] for x in reads if norm_id(x["文章"]) == r["文章"]]
                if not ev or ev[-1] in ("僅書目", "AI 記憶"):
                    e("AI 給必引度前，這篇要有依據為全文／摘要／他人描述的 AI 閱讀紀錄")
        if kind == "標籤":
            vocab = config().get("標籤詞表", {})
            if not (r.get("加") or r.get("移除")): e("至少要有「加」或「移除」")
            for t in (r.get("加") or []) + (r.get("移除") or []):
                if t not in vocab: e(f"「{t}」不在詞表（2_paper/文獻庫資料/設定.json），要新增先改詞表")
        if kind == "AI閱讀":
            if r.get("程度", 0) >= 2 and not r.get("筆記"): e("程度 2 以上要附「筆記」連結（[[…]]）")
            if r.get("程度") == 3 and r.get("依據") != "全文": e("程度 3（讀全文）的依據應為「全文」")
            if r.get("程度") == 0 and r.get("依據") in ("全文", "摘要"): e("程度 0 只有書目，依據不能是全文或摘要")
        out.append(r)
    return out, errs

def write_logs(batch):
    DATA.mkdir(parents=True, exist_ok=True)
    for kind in SCHEMA:
        if not batch.get(kind): continue
        with open(DATA / f"{kind}.jsonl", "a", encoding="utf-8") as fh:
            for r in batch[kind]: fh.write(json.dumps(r, ensure_ascii=False) + "\n")
        print(f"已追加 {kind} {len(batch[kind])} 筆：" + "、".join(str(r.get("代號") or r.get("文章")) for r in batch[kind][:8])
              + (" …" if len(batch[kind]) > 8 else ""))

def read_json_arg(arg):
    return json.load(open(arg, encoding="utf-8")) if arg.endswith(".json") and os.path.exists(arg) else json.loads(arg)

def log(kind, arg):
    recs = read_json_arg(arg)
    out, errs = validate(kind, recs if isinstance(recs, list) else [recs])
    if errs: sys.exit("沒有寫入，請修正：\n" + "\n".join(errs))
    write_logs({kind: out})

BATCH_KEYS = {"doi", "搜尋", "方式", "為何抓", "主要貢獻", "依據", "版本", "程度", "筆記", "摘要來源", "標籤", "狀態", "理由"}

PREVIEW = VAULT / "2_paper/待匯入"                                   # 匯入前的任務頁預覽

def import_batch(path, check=False, preview=False):
    """搜尋代理交回的批次檔 → 任務／搜尋／來源／AI閱讀／標籤／決策紀錄。全部檢查通過才寫入。
    格式：{"任務": 代號, "新任務": {...}（選填）, "搜尋": [{"ref": "q1", 方式, 資料庫, 查詢, 年份, 結果數, 起點, 方向, 說明}],
           "文章": [{"doi", "搜尋": "q1" 或既有代號, "為何抓", "主要貢獻", "依據", "版本", "摘要來源", "標籤": [...], "狀態", "理由"}]}
    「摘要來源」：摘要不是從 OpenAlex 讀到時必填（如 "arXiv 2308.05399"、"Semantic Scholar"）。"""
    b = read_json_arg(path)
    errs, pend = [], {k: [] for k in SCHEMA}
    def add(kind, recs):
        out, er = validate(kind, recs, pend); errs.extend(er); pend[kind] += out; return out
    task = b.get("任務")
    if not task: sys.exit("批次檔要有「任務」代號")
    if b.get("新任務"): add("任務", [{"代號": task, **b["新任務"]}])
    refmap = {}
    for q in b.get("搜尋", []):
        q = dict(q); ref = q.pop("ref", None)
        out = add("搜尋", [{"任務": task, **q}])
        if ref and out: refmap[ref] = out[0]["代號"]
    known = {s["代號"]: s["方式"] for s in load_log("搜尋") + pend["搜尋"]}
    vocab = config().get("標籤詞表", {})
    idx = library_index()
    seen = set()
    for n, a in enumerate(b.get("文章", []), 1):
        e = lambda m: errs.append(f"文章 第 {n} 筆（{a.get('doi', '?')}）：{m}")
        bad = set(a) - BATCH_KEYS
        if bad: e(f"不認得的欄位 {sorted(bad)}")
        doi = norm_id(a.get("doi", ""))
        if not doi.startswith("10."): e("doi 要是 10. 開頭的 DOI"); continue
        if doi in seen: e("同一批重複"); continue
        seen.add(doi)
        oa = openalex(doi)
        if oa.get("missing"): e("OpenAlex 查不到，這篇請改用 log 個別處理")
        sid = refmap.get(a.get("搜尋"), a.get("搜尋"))
        if sid and sid not in known: e(f"找不到搜尋「{a['搜尋']}」（批次內的 ref 或既有代號）")
        how = a.get("方式") or known.get(sid) or "使用者提供"
        add("來源", [{"文章": doi, "方式": how, "為何抓": a.get("為何抓", ""), "任務": task, **({"搜尋": sid} if sid else {})}])
        st = a.get("狀態") or "候選"
        if not a.get("主要貢獻"):
            if st != "已排除" and doi not in idx: e("沒排除的新文章要寫「主要貢獻」與「依據」")
        else:
            ev = a.get("依據", "")
            lvl = a.get("程度", 1 if ev == "摘要" else (3 if ev == "全文" else 0))
            if ev == "摘要" and not oa.get("abstract") and not a.get("摘要來源"):
                e("依據寫摘要，但 OpenAlex 沒有這篇的摘要；請填「摘要來源」說明讀到的是哪裡")
            add("AI閱讀", [{"文章": doi, "程度": lvl, "依據": ev, "主要貢獻": a.get("主要貢獻", ""),
                           **{k: a[k] for k in ("版本", "筆記", "摘要來源") if a.get(k)}}])
        tags = a.get("標籤") or []
        if st != "已排除" and doi not in idx:
            if not any(t.startswith("type/") for t in tags): e("新文章要有一個 type/ 標籤")
            if not any(t.startswith("topic/") for t in tags): e("新文章要有至少一個 topic/ 標籤（詞表不夠先問使用者）")
        if tags: add("標籤", [{"文章": doi, "由": "AI", "加": tags}])
        if doi in idx and idx[doi][1] and st == "候選" and not a.get("狀態"):
            pass                                              # 庫內已有狀態，不用預設值覆蓋
        else:
            add("決策", [{"文章": doi, "由": "AI", "狀態": st, "任務": task, **({"理由": a["理由"]} if a.get("理由") else {})}])
        if doi in idx: print(f"  ℹ️ {doi} 已在庫內（{idx[doi][0]}，{idx[doi][1]}），會追加一筆來源")
    if errs: sys.exit("沒有寫入，請修正：\n" + "\n".join(errs))
    kept = sum(1 for a in b.get("文章", []) if (a.get("狀態") or "候選") != "已排除")
    print(f"檢查通過：搜尋 {len(pend['搜尋'])} 筆、文章 {len(seen)} 篇（收錄 {kept}、排除 {len(seen) - kept}）")
    pv = PREVIEW / f"{task}.md"
    if preview:                                               # 用同一個任務頁版型，把這批當成已匯入來畫
        papers, logs, _ = gather(extra=pend)
        t = next(x for x in logs["任務"] if x["代號"] == task)
        PREVIEW.mkdir(parents=True, exist_ok=True)
        pv.write_text(task_page(t, papers, logs["搜尋"], pending=seen), encoding="utf-8")
        print(f"（只預覽，未寫入）{pv.relative_to(VAULT)}"); return
    if check:
        print("（只檢查，未寫入）"); return
    write_logs(pend)
    if pv.exists():
        pv.unlink(); print(f"已刪除預覽 {pv.relative_to(VAULT)}")
        if not any(PREVIEW.iterdir()): PREVIEW.rmdir()

if __name__ == "__main__":
    a = sys.argv[1:]
    flag = lambda k, d=None: a[a.index(k) + 1] if k in a and a.index(k) + 1 < len(a) else d
    pos = [x for i, x in enumerate(a) if not x.startswith("--") and (i == 0 or not a[i - 1] in ("--from", "--to", "--n"))]
    if pos[:1] == ["rebuild"]: rebuild("--refresh" in a)
    elif pos[:1] == ["find"] and len(pos) > 1: find(" ".join(pos[1:]))
    elif pos[:1] == ["fetch"] and len(pos) == 2: fetch(pos[1])
    elif pos[:1] == ["search"] and len(pos) > 1:
        search(" ".join(pos[1:]), flag("--from"), flag("--to"), int(flag("--n", 25)), "--abs" in a)
    elif pos[:1] == ["track"] and len(pos) == 3: track(pos[1], pos[2], int(flag("--n", 50)), "--abs" in a)
    elif pos[:1] == ["log"] and len(pos) == 3: log(pos[1], pos[2])
    elif pos[:1] == ["import-batch"] and len(pos) == 2: import_batch(pos[1], "--check" in a, "--preview" in a)
    else: print(__doc__)
