const STORAGE_KEY = "diary";
const THEME_KEY = "theme";
const SAVE_DELAY = 500; // 停止打字後多久自動儲存（毫秒）

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

const MOODS = [
  { id: "happy", label: "開心", color: "--urgent" },
  { id: "calm", label: "平靜", color: "--done" },
  { id: "plain", label: "普通", color: "--todo" },
  { id: "tired", label: "疲憊", color: "--doing" },
  { id: "down", label: "低落", color: "--muted" },
];

const ICON_PATHS = {
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/>',
  download: '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>',
  upload: '<path d="M12 3v12"/><path d="m17 8-5-5-5 5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
};

function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name]}</svg>`;
}

const statsEl = document.getElementById("diary-stats");
const daysEl = document.getElementById("days");
const monthLabel = document.getElementById("month-label");
const moodsEl = document.getElementById("moods");
const titleInput = document.getElementById("entry-title");
const textInput = document.getElementById("entry-text");
const entryDate = document.getElementById("entry-date");
const entryRelative = document.getElementById("entry-relative");
const entryCount = document.getElementById("entry-count");
const entryStatus = document.getElementById("entry-status");
const deleteBtn = document.getElementById("entry-delete");
const listLabel = document.getElementById("list-label");
const listEl = document.getElementById("entry-list");
const searchInput = document.getElementById("search");
const themeToggle = document.getElementById("theme-toggle");
const themeLabel = document.getElementById("theme-label");

let state = load();
let selected = dateKey(new Date()); // 目前書寫的日期
let viewYear = new Date().getFullYear(); // 月曆顯示的年月
let viewMonth = new Date().getMonth();
let mood = ""; // 書寫區目前選的心情
let saveTimer = null;

/* ---------- 資料 ---------- */

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && saved.entries && typeof saved.entries === "object") return saved;
  } catch {}
  return { entries: {} };
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

/* ---------- 日期 ---------- */

function dateKey(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseDate(value) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && dateKey(parseDate(value)) === value;
}

function daysFromToday(value) {
  const today = parseDate(dateKey(new Date()));
  return Math.round((parseDate(value) - today) / 86400000);
}

function relativeLabel(value) {
  const days = daysFromToday(value);
  if (days === 0) return "今天";
  if (days === -1) return "昨天";
  if (days === 1) return "明天";
  return days < 0 ? `${-days} 天前` : `${days} 天後`;
}

function timeLabel(timestamp) {
  const d = new Date(timestamp);
  const time = `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${time}`;
}

/* ---------- 書寫區 ---------- */

function loadEditor() {
  const entry = state.entries[selected];
  const date = parseDate(selected);
  entryDate.textContent = `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日 星期${WEEKDAYS[date.getDay()]}`;
  entryRelative.textContent = relativeLabel(selected);
  titleInput.value = entry?.title || "";
  textInput.value = entry?.text || "";
  textInput.scrollTop = 0;
  mood = entry?.mood || "";
  entryStatus.textContent = entry?.updatedAt ? `最後更新：${timeLabel(entry.updatedAt)}` : "";
  renderMoods();
  renderCount();
}

function renderMoods() {
  moodsEl.querySelectorAll(".mood").forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset.mood === mood));
  });
}

function renderCount() {
  const count = [...textInput.value.replace(/\s/g, "")].length;
  entryCount.textContent = count ? `${count} 字` : "";
}

// 把書寫區的內容存回資料；標題、內容、心情都空白時視為沒有這篇日記
function commit() {
  clearTimeout(saveTimer);
  saveTimer = null;

  const title = titleInput.value.trim();
  const text = textInput.value.trimEnd();
  const old = state.entries[selected];
  const unchanged = (old?.title || "") === title && (old?.text || "") === text && (old?.mood || "") === mood;
  if (unchanged) return;

  if (title || text.trim() || mood) {
    const updatedAt = Date.now();
    state.entries[selected] = { ...(title && { title }), ...(text && { text }), ...(mood && { mood }), updatedAt };
    entryStatus.textContent = save() ? `已儲存 ${timeLabel(updatedAt)}` : "無法儲存，請先匯出備份";
  } else {
    delete state.entries[selected];
    entryStatus.textContent = save() ? "" : "無法儲存，請先匯出備份";
  }
  renderSide();
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(commit, SAVE_DELAY);
}

function selectDate(value) {
  commit();
  selected = value;
  const date = parseDate(value);
  viewYear = date.getFullYear();
  viewMonth = date.getMonth();
  loadEditor();
  renderSide();
}

MOODS.forEach((m) => {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "mood";
  btn.dataset.mood = m.id;
  btn.textContent = m.label;
  btn.style.setProperty("--mood", `var(${m.color})`);
  btn.addEventListener("click", () => {
    mood = mood === m.id ? "" : m.id;
    renderMoods();
    commit();
  });
  moodsEl.append(btn);
});

titleInput.addEventListener("input", scheduleSave);
textInput.addEventListener("input", () => {
  renderCount();
  scheduleSave();
});

// 關閉或切走頁面時，立刻存下還沒存的內容
window.addEventListener("pagehide", commit);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") commit();
});

deleteBtn.innerHTML = icon("trash");
deleteBtn.addEventListener("click", () => {
  if (!confirm(`確定要刪除 ${selected} 的日記嗎？刪除後無法復原。`)) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  delete state.entries[selected];
  save();
  loadEditor();
  renderSide();
});

/* ---------- 月曆 ---------- */

function moodColor(id) {
  const found = MOODS.find((m) => m.id === id);
  return found ? `var(${found.color})` : "";
}

function renderCalendar() {
  monthLabel.textContent = `${viewYear} 年 ${viewMonth + 1} 月`;
  const today = dateKey(new Date());
  const lead = new Date(viewYear, viewMonth, 1).getDay();
  const total = new Date(viewYear, viewMonth + 1, 0).getDate();

  const blanks = Array.from({ length: lead }, () => document.createElement("span"));
  const days = Array.from({ length: total }, (_, i) => {
    const value = dateKey(new Date(viewYear, viewMonth, i + 1));
    const entry = state.entries[value];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "day";
    btn.textContent = i + 1;
    btn.classList.toggle("today", value === today);
    btn.classList.toggle("selected", value === selected);
    btn.classList.toggle("has-entry", !!entry);
    if (entry?.mood) btn.style.setProperty("--mood", moodColor(entry.mood));
    btn.setAttribute("aria-label", `${viewMonth + 1} 月 ${i + 1} 日${entry ? "，有日記" : ""}`);
    if (value === selected) btn.setAttribute("aria-current", "date");
    btn.addEventListener("click", () => selectDate(value));
    return btn;
  });
  daysEl.replaceChildren(...blanks, ...days);
}

function shiftMonth(delta) {
  const d = new Date(viewYear, viewMonth + delta, 1);
  viewYear = d.getFullYear();
  viewMonth = d.getMonth();
  renderSide();
}

const prevBtn = document.getElementById("month-prev");
const nextBtn = document.getElementById("month-next");
prevBtn.innerHTML = icon("left");
nextBtn.innerHTML = icon("right");
prevBtn.addEventListener("click", () => shiftMonth(-1));
nextBtn.addEventListener("click", () => shiftMonth(1));
document.getElementById("today-btn").addEventListener("click", () => selectDate(dateKey(new Date())));

/* ---------- 日記列表 ---------- */

function highlight(el, value, term) {
  if (!term) {
    el.textContent = value;
    return;
  }
  const lower = value.toLowerCase();
  let from = 0;
  let at;
  while ((at = lower.indexOf(term, from)) !== -1) {
    el.append(value.slice(from, at));
    const mark = document.createElement("mark");
    mark.textContent = value.slice(at, at + term.length);
    el.append(mark);
    from = at + term.length;
  }
  el.append(value.slice(from));
}

// 列表的內容摘要：搜尋時從符合的文字附近開始
function snippet(text, term) {
  const flat = (text || "").replace(/\s+/g, " ").trim();
  const at = term ? flat.toLowerCase().indexOf(term) : -1;
  const start = Math.max(0, at - 12);
  return (start ? "…" : "") + flat.slice(start, start + 90);
}

function renderList() {
  const term = searchInput.value.trim().toLowerCase();
  const prefix = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-`;
  const keys = Object.keys(state.entries)
    .filter((key) => {
      const entry = state.entries[key];
      if (!term) return key.startsWith(prefix);
      return `${entry.title || ""}\n${entry.text || ""}`.toLowerCase().includes(term);
    })
    .sort()
    .reverse();

  listLabel.textContent = term ? `搜尋結果（${keys.length}）` : `${viewMonth + 1} 月的日記（${keys.length}）`;

  if (!keys.length) {
    const empty = document.createElement("li");
    empty.className = "entry-empty";
    empty.textContent = term ? "找不到符合的日記" : "這個月還沒有日記";
    listEl.replaceChildren(empty);
    return;
  }

  listEl.replaceChildren(...keys.map((key) => {
    const entry = state.entries[key];
    const date = parseDate(key);
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "entry-item" + (key === selected ? " current" : "");

    const line = document.createElement("div");
    line.className = "entry-line";
    const day = document.createElement("span");
    day.className = "entry-day";
    const year = term && date.getFullYear() !== new Date().getFullYear() ? `${date.getFullYear()}/` : "";
    day.textContent = `${year}${date.getMonth() + 1}/${date.getDate()}（${WEEKDAYS[date.getDay()]}）`;
    const name = document.createElement("span");
    name.className = "entry-name";
    highlight(name, entry.title || "", term);
    line.append(day, name);

    const preview = document.createElement("div");
    preview.className = "entry-snippet";
    highlight(preview, snippet(entry.text, term), term);

    btn.append(line, preview);
    btn.addEventListener("click", () => selectDate(key));
    li.append(btn);
    return li;
  }));
}

searchInput.addEventListener("input", renderList);
searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && searchInput.value) {
    searchInput.value = "";
    renderList();
  }
});

/* ---------- 統計 ---------- */

// 連續寫日記的天數：今天還沒寫時從昨天算起
function currentStreak() {
  const cursor = new Date();
  if (!state.entries[dateKey(cursor)]) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (state.entries[dateKey(cursor)]) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function renderStats() {
  const total = Object.keys(state.entries).length;
  const streak = currentStreak();
  statsEl.textContent = `共 ${total} 篇${streak > 1 ? ` · 連續 ${streak} 天` : ""}`;
}

function renderSide() {
  renderCalendar();
  renderList();
  renderStats();
  deleteBtn.hidden = !state.entries[selected];
}

/* ---------- 匯出／匯入 ---------- */

const exportBtn = document.getElementById("export-btn");
const importBtn = document.getElementById("import-btn");
const importFile = document.getElementById("import-file");
exportBtn.innerHTML = icon("download");
importBtn.innerHTML = icon("upload");

exportBtn.addEventListener("click", () => {
  commit();
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `日記-${dateKey(new Date())}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
});

// 檢查匯入的資料格式，並整理成可用的狀態；格式不對時回傳 null
function parseImport(data) {
  if (!data || typeof data !== "object" || !data.entries || typeof data.entries !== "object") return null;
  const str = (v) => (typeof v === "string" ? v.trim() : "");
  const entries = {};
  Object.entries(data.entries).forEach(([key, e]) => {
    if (!isValidDate(key) || !e || typeof e !== "object") return;
    const entry = {};
    if (str(e.title)) entry.title = str(e.title);
    if (str(e.text)) entry.text = str(e.text);
    if (MOODS.some((m) => m.id === e.mood)) entry.mood = e.mood;
    if (!Object.keys(entry).length) return;
    if (Number.isFinite(e.updatedAt)) entry.updatedAt = e.updatedAt;
    entries[key] = entry;
  });
  return { entries };
}

importBtn.addEventListener("click", () => importFile.click());

importFile.addEventListener("change", async () => {
  const file = importFile.files[0];
  importFile.value = ""; // 讓同一個檔案可以再選一次
  if (!file) return;

  let imported = null;
  try {
    imported = parseImport(JSON.parse(await file.text()));
  } catch {}
  if (!imported) {
    alert("無法匯入：這個檔案不是日記的備份檔。");
    return;
  }

  const count = Object.keys(imported.entries).length;
  const message =
    `要匯入「${file.name}」嗎？\n` +
    `內含 ${count} 篇日記。\n\n` +
    `匯入後會取代目前瀏覽器裡的所有日記，建議先按「匯出」備份。`;
  if (!confirm(message)) return;

  clearTimeout(saveTimer);
  saveTimer = null;
  state = imported;
  save();
  loadEditor();
  renderSide();
});

/* ---------- 深色模式 ---------- */

const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

function currentTheme() {
  return document.documentElement.dataset.theme || (systemDark.matches ? "dark" : "light");
}

function syncThemeButton() {
  const dark = currentTheme() === "dark";
  themeToggle.classList.toggle("is-dark", dark);
  themeLabel.textContent = dark ? "淺色模式" : "深色模式";
  themeToggle.setAttribute("aria-pressed", String(dark));
}

themeToggle.addEventListener("click", () => {
  const next = currentTheme() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {}
  syncThemeButton();
});

systemDark.addEventListener("change", syncThemeButton);

syncThemeButton();
loadEditor();
renderSide();
