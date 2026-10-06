const STORAGE_KEY = "kanban-boards";
const LEGACY_CARDS_KEY = "kanban";
const LEGACY_TODOS_KEY = "todos";
const THEME_KEY = "theme";

const DEFAULT_TITLE = "待辦看板";
const DEFAULT_MOTTO = "今天想完成什麼？";
const DONE_LIMIT = 10; // 已完成超過這個數量就可以收合
const TRASH_DAYS = 30; // 垃圾桶保留天數
const DAY = 86400000;

const COLUMNS = [
  { status: "todo", title: "待辦" },
  { status: "doing", title: "進行中" },
  { status: "done", title: "已完成" },
];

// 專案篩選的特殊值
const ALL = "all";
const NONE = "none";

const boardEl = document.getElementById("board");
const tabsEl = document.getElementById("tabs");
const projectsEl = document.getElementById("projects");
const titleEl = document.getElementById("title");
const titleText = document.getElementById("title-text");
const titleEdit = document.getElementById("title-edit");
const mottoEl = document.getElementById("motto");
const mottoText = document.getElementById("motto-text");
const mottoEdit = document.getElementById("motto-edit");
const columnTemplate = document.getElementById("column-template");
const themeToggle = document.getElementById("theme-toggle");
const themeLabel = document.getElementById("theme-label");

const searchInput = document.getElementById("search");

let state = load();
let draggingId = null;
const searchTerms = new Map(); // 每個看板各自的搜尋字（不存檔）
const expandedDone = new Set(); // 目前展開「已完成」的看板 id（不存檔，重新整理後預設收合）

/* ---------- 資料 ---------- */

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function makeBoard(name, cards = []) {
  return { id: newId(), name, cards, projects: [], activeProject: ALL, trash: [] };
}

// 移除垃圾桶裡超過保留天數的專案
function purgeTrash(board) {
  const now = Date.now();
  board.trash = board.trash.filter((t) => now - t.deletedAt < TRASH_DAYS * DAY);
}

function defaultState(personalCards = []) {
  const personal = makeBoard("個人", personalCards);
  const work = makeBoard("工作");
  return { title: DEFAULT_TITLE, activeId: personal.id, boards: [personal, work] };
}

// 補齊舊版資料缺少的欄位
function normalize(s) {
  // 激勵小語改成每個看板各自一句：原本共用的那句套用到還沒設定的看板
  if (s.motto) {
    s.boards.forEach((b) => (b.motto ||= s.motto));
    delete s.motto;
  }
  s.boards.forEach((b) => {
    b.cards ||= [];
    b.projects ||= [];
    b.activeProject ||= ALL;
    b.trash ||= [];
    purgeTrash(b);
    b.cards.forEach((c) => {
      // 舊版的「優先處理」欄改成：放進待辦並標星號
      if (c.status === "urgent") {
        c.status = "todo";
        c.starred = true;
      }
      if (!COLUMNS.some((col) => col.status === c.status)) c.status = "todo";
    });
    if (![ALL, NONE].includes(b.activeProject) && !b.projects.some((p) => p.id === b.activeProject)) {
      b.activeProject = ALL;
    }
  });
  if (!s.boards.some((b) => b.id === s.activeId)) s.activeId = s.boards[0].id;
  return s;
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.boards) && saved.boards.length) return normalize(saved);
    // 從舊版資料轉換：原本的卡片放進「個人」看板
    const legacyCards = JSON.parse(localStorage.getItem(LEGACY_CARDS_KEY));
    if (Array.isArray(legacyCards)) return defaultState(legacyCards);
    const legacyTodos = JSON.parse(localStorage.getItem(LEGACY_TODOS_KEY));
    if (Array.isArray(legacyTodos)) {
      return defaultState(legacyTodos.map((t) => ({ id: t.id, text: t.text, status: t.done ? "done" : "todo" })));
    }
  } catch {}
  return defaultState();
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 無法儲存時（例如無痕模式）仍可正常使用
  }
}

function update() {
  save();
  render();
}

function activeBoard() {
  return state.boards.find((b) => b.id === state.activeId);
}

function projectName(board, id) {
  return board.projects.find((p) => p.id === id)?.name;
}

function sortedProjects(board) {
  return [...board.projects].sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));
}

function searchTerm(board) {
  return (searchTerms.get(board.id) || "").trim().toLowerCase();
}

// 搜尋標題、細項內容、專案名稱
function matchesSearch(board, card) {
  const term = searchTerm(board);
  if (!term) return true;
  const haystack = [card.text, card.notes, projectName(board, card.projectId)].filter(Boolean).join("\n").toLowerCase();
  return haystack.includes(term);
}

// 目前專案篩選下看得到的卡片（不含搜尋）
function projectCards(board) {
  const filter = board.activeProject;
  if (filter === ALL) return board.cards;
  if (filter === NONE) return board.cards.filter((c) => !projectName(board, c.projectId));
  return board.cards.filter((c) => c.projectId === filter);
}

// 專案篩選 + 搜尋之後看得到的卡片
function visibleCards(board) {
  return projectCards(board).filter((c) => matchesSearch(board, c));
}

// 把文字中符合搜尋的部分用 <mark> 標出來
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

function firstCardId(board, status) {
  return board.cards.find((c) => c.status === status)?.id ?? null;
}

// 記錄卡片的更新時間（星號卡片依此排序）
function touch(card) {
  card.updatedAt = Date.now();
}

// 把卡片放到 status 欄，插在 beforeId 前面；沒指定時：移進「已完成」放最上面，其他放最後
function placeCard(board, card, status, beforeId = undefined) {
  const changed = card.status !== status;
  touch(card);
  board.cards = board.cards.filter((c) => c.id !== card.id);
  card.status = status;
  if (beforeId === undefined) beforeId = status === "done" && changed ? firstCardId(board, "done") : null;
  const index = beforeId ? board.cards.findIndex((c) => c.id === beforeId) : -1;
  if (index === -1) board.cards.push(card);
  else board.cards.splice(index, 0, card);
}

function moveCard(id, status, beforeId) {
  const board = activeBoard();
  const card = board.cards.find((c) => c.id === id);
  if (!card) return;
  placeCard(board, card, status, beforeId);
  update();
}

function removeCard(id) {
  const board = activeBoard();
  board.cards = board.cards.filter((c) => c.id !== id);
}

/* ---------- 日期 ---------- */

function parseDate(value) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function dueInfo(due) {
  if (!due) return null;
  const date = parseDate(due);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((date - today) / 86400000);
  const sameYear = date.getFullYear() === today.getFullYear();
  const md = `${date.getMonth() + 1}/${date.getDate()}`;
  const text = sameYear ? md : `${date.getFullYear()}/${md}`;
  if (days < 0) return { label: `逾期 ${-days} 天（${text}）`, cls: "overdue" };
  if (days === 0) return { label: "今天截止", cls: "soon" };
  if (days === 1) return { label: "明天截止", cls: "soon" };
  return { label: `${text} 截止`, cls: "" };
}

/* ---------- 共用：圖示、行內編輯 ---------- */

// 單色線條圖示（Lucide，ISC 授權），顏色跟隨文字色
const ICON_PATHS = {
  edit: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/>',
  left: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  right: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  board: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/><path d="M8 13h7"/><path d="m12 10 3 3-3 3"/>',
  calendar: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
  tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
  notes: '<path d="M15 12h-5"/><path d="M15 8h-5"/><path d="M19 17V5a2 2 0 0 0-2-2H4"/><path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  up: '<path d="m18 15-6-6-6 6"/>',
  download: '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>',
  upload: '<path d="M12 3v12"/><path d="m17 8-5-5-5 5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
  star: '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',
};

function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name]}</svg>`;
}

function iconButton(name, label, onClick, className = "") {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "icon-btn " + className;
  btn.innerHTML = icon(name);
  btn.title = label;
  btn.setAttribute("aria-label", label);
  btn.addEventListener("click", onClick);
  return btn;
}

// 把 target 換成輸入框；Enter / 失焦儲存，Esc 取消
function inlineEdit(target, value, onDone, className = "", maxLength = 60) {
  const input = document.createElement("input");
  input.type = "text";
  input.value = value;
  input.maxLength = maxLength;
  input.className = className;

  let finished = false;
  const finish = (commit) => {
    if (finished) return;
    finished = true;
    onDone(commit ? input.value.trim() : null);
  };

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") finish(true);
    if (e.key === "Escape") finish(false);
  });
  input.addEventListener("blur", () => finish(true));

  target.replaceWith(input);
  input.focus();
  input.select();
  return input;
}

/* ---------- 畫面 ---------- */

function render() {
  closeBoardMenu();
  titleText.textContent = state.title || DEFAULT_TITLE;
  document.title = state.title || DEFAULT_TITLE;
  mottoText.textContent = activeBoard().motto || DEFAULT_MOTTO;

  renderTabs();
  renderProjects();
  renderTrashButton();
  boardEl.replaceChildren(...COLUMNS.map(renderColumn));

  // 切換看板時，搜尋框換成該看板的搜尋字
  const board = activeBoard();
  const value = searchTerms.get(board.id) || "";
  if (searchInput.value !== value) searchInput.value = value;
}

searchInput.addEventListener("input", () => {
  searchTerms.set(state.activeId, searchInput.value);
  render();
});

searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && searchInput.value) {
    searchInput.value = "";
    searchTerms.delete(state.activeId);
    render();
  }
});

/* 看板分頁 */

function renderTabs() {
  const tabs = state.boards.map((board) => {
    const active = board.id === state.activeId;
    const tab = document.createElement("div");
    tab.className = "tab" + (active ? " active" : "");

    const name = document.createElement("button");
    name.type = "button";
    name.className = "tab-name";
    name.textContent = board.name;
    name.setAttribute("role", "tab");
    name.setAttribute("aria-selected", String(active));
    name.addEventListener("click", () => {
      if (active) return;
      state.activeId = board.id;
      update();
    });
    name.addEventListener("dblclick", () => renameBoard(board, name));
    tab.append(name);

    if (active) {
      tab.append(
        iconButton("edit", "重新命名看板", () => renameBoard(board, name)),
        iconButton("trash", "刪除看板", () => deleteBoard(board))
      );
    }
    return tab;
  });

  const add = document.createElement("button");
  add.type = "button";
  add.className = "tab-add";
  add.textContent = "＋ 新增看板";
  add.addEventListener("click", addBoard);

  tabsEl.replaceChildren(...tabs, add);
}

function renameBoard(board, nameEl) {
  inlineEdit(nameEl, board.name, (value) => {
    if (value) board.name = value;
    update();
  }, "tab-input");
}

function addBoard() {
  const board = makeBoard("新看板");
  state.boards.push(board);
  state.activeId = board.id;
  update();
  // 新增後直接進入命名
  renameBoard(board, tabsEl.querySelector(".tab.active .tab-name"));
}

function deleteBoard(board) {
  if (state.boards.length <= 1) {
    alert("至少要保留一個看板。");
    return;
  }
  const count = board.cards.length;
  const detail = count ? `，裡面的 ${count} 張卡片也會一起刪除` : "";
  if (!confirm(`確定要刪除看板「${board.name}」嗎${detail}？`)) return;
  const index = state.boards.indexOf(board);
  state.boards.splice(index, 1);
  state.activeId = state.boards[Math.max(0, index - 1)].id;
  update();
}

/* 專案分類 */

const DOUBLE_CLICK_MS = 500;
let lastChipClick = { id: null, at: 0 }; // 用來判斷專案標籤是否連點兩下

function renderProjects() {
  const board = activeBoard();
  const chips = [];

  const chip = (id, label, count, onDoubleClick) => {
    const active = board.activeProject === id;
    const wrap = document.createElement("div");
    wrap.className = "chip" + (active ? " active" : "");

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip-name";
    btn.textContent = label;
    btn.setAttribute("aria-pressed", String(active));
    const num = document.createElement("span");
    num.className = "chip-count";
    num.textContent = count;
    btn.append(num);
    btn.addEventListener("click", () => {
      // 第一下點擊會重新繪製標籤，瀏覽器的 dblclick 不會觸發，所以自己判斷連點兩下
      const now = Date.now();
      const isDouble = lastChipClick.id === id && now - lastChipClick.at < DOUBLE_CLICK_MS;
      lastChipClick = isDouble ? { id: null, at: 0 } : { id, at: now };
      if (isDouble && onDoubleClick) {
        onDoubleClick(btn);
        return;
      }
      if (active) return;
      board.activeProject = id;
      update();
    });
    wrap.append(btn);

    // 把卡片拖到專案標籤上就能換專案（不能拖回未分類）
    if (id !== ALL && id !== NONE) {
      wrap.addEventListener("dragover", (e) => {
        if (!draggingId) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        wrap.classList.add("drop-target");
      });
      wrap.addEventListener("dragleave", (e) => {
        if (!wrap.contains(e.relatedTarget)) wrap.classList.remove("drop-target");
      });
      wrap.addEventListener("drop", (e) => {
        if (!draggingId) return;
        e.preventDefault();
        const card = board.cards.find((c) => c.id === draggingId);
        if (!card) return;
        card.projectId = id;
        touch(card);
        draggingId = null; // 重新繪製後原本的卡片元素會被移除，dragend 不一定會觸發
        update();
      });
    }
    return { wrap, btn };
  };

  chips.push(chip(ALL, "全部", board.cards.length).wrap);

  sortedProjects(board).forEach((project) => {
    const count = board.cards.filter((c) => c.projectId === project.id).length;
    const { wrap, btn } = chip(project.id, project.name, count, (el) => renameProject(project, el));
    btn.title = "點兩下可以重新命名";
    chips.push(wrap);
  });

  // 新卡片一定有專案；舊資料或還原後還有沒專案的卡片時，才顯示「未分類」
  const uncategorized = board.cards.filter((c) => !projectName(board, c.projectId)).length;
  if (board.projects.length && (uncategorized || board.activeProject === NONE)) {
    chips.push(chip(NONE, "未分類", uncategorized).wrap);
  }

  const add = document.createElement("button");
  add.type = "button";
  add.className = "chip-add";
  add.textContent = "＋ 新增專案";
  add.addEventListener("click", addProject);

  const label = document.createElement("span");
  label.className = "projects-label";
  label.innerHTML = icon("tag");
  label.title = "專案分類";

  projectsEl.replaceChildren(label, ...chips, add);
}

function renameProject(project, nameEl) {
  inlineEdit(nameEl, project.name, (value) => {
    if (value) project.name = value;
    update();
  }, "chip-input");
}

function addProject() {
  const board = activeBoard();
  const project = { id: newId(), name: "新專案" };
  board.projects.push(project);
  board.activeProject = project.id;
  update();
  renameProject(project, projectsEl.querySelector(".chip.active .chip-name"));
}

// 專案連同裡面的卡片一起移到垃圾桶，30 天內可以還原
function trashProject(project) {
  const board = activeBoard();
  const cards = board.cards.filter((c) => c.projectId === project.id);
  const detail = cards.length ? `\n裡面的 ${cards.length} 張卡片也會一起移過去。` : "";
  if (!confirm(`要把專案「${project.name}」丟進垃圾桶嗎？${detail}\n${TRASH_DAYS} 天內可以從垃圾桶還原。`)) return;
  board.trash.unshift({ id: project.id, name: project.name, cards, deletedAt: Date.now() });
  board.projects = board.projects.filter((p) => p.id !== project.id);
  board.cards = board.cards.filter((c) => c.projectId !== project.id);
  board.activeProject = ALL;
  update();
}

/* 垃圾桶 */

const trashBtn = document.getElementById("trash-btn");
const trashDialog = document.getElementById("trash-dialog");

// 右上角的垃圾桶：在某個專案底下時丟棄該專案，其他時候打開垃圾桶清單
function renderTrashButton() {
  const board = activeBoard();
  const project = board.projects.find((p) => p.id === board.activeProject);
  const label = project ? `把專案「${project.name}」丟進垃圾桶` : `打開垃圾桶（${board.trash.length} 個專案）`;
  trashBtn.innerHTML = icon("trash");
  trashBtn.title = label;
  trashBtn.setAttribute("aria-label", label);
  if (board.trash.length) {
    const num = document.createElement("span");
    num.className = "chip-count";
    num.textContent = board.trash.length;
    trashBtn.append(num);
  }
}

trashBtn.addEventListener("click", () => {
  const board = activeBoard();
  const project = board.projects.find((p) => p.id === board.activeProject);
  if (project) trashProject(project);
  else openTrash();
});
const trashList = document.getElementById("trash-list");
const trashEmpty = document.getElementById("trash-empty");

function openTrash() {
  purgeTrash(activeBoard());
  renderTrash();
  trashDialog.showModal();
}

function renderTrash() {
  const board = activeBoard();
  trashEmpty.hidden = board.trash.length === 0;
  if (!board.trash.length) {
    const empty = document.createElement("li");
    empty.className = "trash-empty";
    empty.textContent = "垃圾桶是空的";
    trashList.replaceChildren(empty);
    return;
  }

  trashList.replaceChildren(...board.trash.map((item) => {
    const li = document.createElement("li");
    li.className = "trash-item";

    const info = document.createElement("div");
    info.className = "trash-info";
    const name = document.createElement("strong");
    name.textContent = item.name;
    const date = new Date(item.deletedAt);
    const daysLeft = Math.max(1, Math.ceil((item.deletedAt + TRASH_DAYS * DAY - Date.now()) / DAY));
    const meta = document.createElement("span");
    meta.className = "trash-meta";
    meta.textContent = `${item.cards.length} 張卡片 · ${date.getMonth() + 1}/${date.getDate()} 丟棄 · ${daysLeft} 天後永久刪除`;
    info.append(name, meta);

    const restore = document.createElement("button");
    restore.type = "button";
    restore.className = "btn";
    restore.textContent = "還原";
    restore.addEventListener("click", () => {
      board.trash = board.trash.filter((t) => t !== item);
      board.projects.push({ id: item.id, name: item.name });
      board.cards.push(...item.cards);
      update();
      renderTrash();
    });

    const remove = iconButton("close", "永久刪除", () => {
      const detail = item.cards.length ? `和裡面的 ${item.cards.length} 張卡片` : "";
      if (!confirm(`確定要永久刪除專案「${item.name}」${detail}嗎？刪除後無法復原。`)) return;
      board.trash = board.trash.filter((t) => t !== item);
      update();
      renderTrash();
    });

    li.append(info, restore, remove);
    return li;
  }));
}

trashEmpty.addEventListener("click", () => {
  const board = activeBoard();
  if (!confirm(`確定要清空垃圾桶嗎？裡面的 ${board.trash.length} 個專案會永久刪除，無法復原。`)) return;
  board.trash = [];
  update();
  renderTrash();
});

document.getElementById("trash-close").innerHTML = icon("close");
document.getElementById("trash-close").addEventListener("click", () => trashDialog.close());
document.getElementById("trash-done").addEventListener("click", () => trashDialog.close());
trashDialog.addEventListener("click", (e) => {
  if (e.target === trashDialog) trashDialog.close();
});

/* 標題 */

function startTitleEdit() {
  titleEl.classList.add("editing");
  inlineEdit(titleText, state.title || DEFAULT_TITLE, (value) => {
    state.title = value || DEFAULT_TITLE;
    // inlineEdit 把標題文字換掉了，放回去
    titleEl.querySelector("input")?.replaceWith(titleText);
    titleEl.classList.remove("editing");
    update();
  }, "title-input");
}

titleEdit.innerHTML = icon("edit");
titleEdit.addEventListener("click", startTitleEdit);
titleText.addEventListener("dblclick", startTitleEdit);

/* 激勵小語（標題下方，每個看板各自一句） */

function startMottoEdit() {
  const board = activeBoard();
  mottoEl.classList.add("editing");
  inlineEdit(mottoText, board.motto || DEFAULT_MOTTO, (value) => {
    // 清空時恢復預設文字
    if (value && value !== DEFAULT_MOTTO) board.motto = value;
    else delete board.motto;
    mottoEl.querySelector("input")?.replaceWith(mottoText);
    mottoEl.classList.remove("editing");
    update();
  }, "motto-input", 100);
}

mottoEdit.innerHTML = icon("edit");
mottoEdit.addEventListener("click", startMottoEdit);
mottoText.addEventListener("dblclick", startMottoEdit);

/* 欄位 */

function renderColumn({ status, title }) {
  const board = activeBoard();
  const column = columnTemplate.content.firstElementChild.cloneNode(true);
  // 標星號的卡片排在最上面，依更新時間由新到舊；其餘維持原本順序
  const all = visibleCards(board).filter((c) => c.status === status);
  const starred = all.filter((c) => c.starred).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const items = [...starred, ...all.filter((c) => !c.starred)];

  column.dataset.status = status;
  column.querySelector("h2").textContent = title;
  column.querySelector(".badge").textContent = items.length;

  // 「已完成」超過上限時可以收合
  const collapsible = status === "done" && items.length > DONE_LIMIT;
  const collapsed = collapsible && !expandedDone.has(board.id);
  const shown = collapsed ? items.slice(0, DONE_LIMIT) : items;

  const list = column.querySelector(".cards");
  list.append(...shown.map(renderCard));
  if (collapsed) list.dataset.hiddenFirst = items[DONE_LIMIT].id;

  const toggle = column.querySelector(".collapse-toggle");
  if (collapsible) {
    toggle.hidden = false;
    toggle.innerHTML = collapsed
      ? `${icon("down")}<span>顯示其餘 ${items.length - DONE_LIMIT} 張</span>`
      : `${icon("up")}<span>收合，只顯示最近 ${DONE_LIMIT} 張</span>`;
    toggle.setAttribute("aria-expanded", String(!collapsed));
    toggle.addEventListener("click", () => {
      if (collapsed) expandedDone.add(board.id);
      else expandedDone.delete(board.id);
      render();
    });
  }

  const clear = column.querySelector(".clear");
  if (status === "done" && items.length) {
    clear.hidden = false;
    clear.addEventListener("click", () => {
      if (!confirm(`確定要清除這裡的 ${items.length} 張已完成卡片嗎？`)) return;
      const ids = new Set(items.map((c) => c.id));
      board.cards = board.cards.filter((c) => !ids.has(c.id));
      update();
    });
  }

  // 卡片一定要屬於某個專案：只有選了專案才能新增
  const form = column.querySelector(".add-form");
  const input = form.querySelector("input");
  const canAdd = board.projects.some((p) => p.id === board.activeProject);
  form.hidden = !canAdd;
  input.setAttribute("aria-label", `在「${title}」新增卡片`);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || !canAdd) return;
    const card = { id: newId(), text, status, updatedAt: Date.now(), projectId: board.activeProject };
    if (status === "done") board.cards.splice(Math.max(0, board.cards.findIndex((c) => c.status === "done")), 0, card);
    else board.cards.push(card);
    update();
    // 重新繪製後讓同一欄的輸入框保持焦點，方便連續新增
    boardEl.querySelector(`.column[data-status="${status}"] .add-form input`).focus();
  });

  setupDropZone(column, list, status);
  return column;
}

/* 卡片 */

function renderCard(card) {
  const board = activeBoard();
  const li = document.createElement("li");
  li.className = "card";
  li.draggable = true;
  li.dataset.id = card.id;
  li.addEventListener("dblclick", (e) => {
    if (!e.target.closest("button")) openCardDialog(card);
  });

  // 左邊：標題、細項、標籤；右邊：操作圖示
  const body = document.createElement("div");
  body.className = "card-body";

  // 標題列：標題 + 截止日期（含逾期提示）
  const titleRow = document.createElement("div");
  titleRow.className = "title-row";
  // 星號（標題左側）：標記優先處理
  const star = iconButton("star", card.starred ? "取消星號" : "標上星號（優先處理）", () => {
    if (card.starred) delete card.starred;
    else card.starred = true;
    touch(card);
    update();
  }, "star" + (card.starred ? " starred" : ""));
  star.setAttribute("aria-pressed", String(!!card.starred));
  if (card.starred) li.classList.add("is-starred");

  const term = searchTerm(board);
  const text = document.createElement("span");
  text.className = "text";
  highlight(text, card.text, term);
  titleRow.append(star, text);

  const due = dueInfo(card.due);
  if (due) {
    const pill = document.createElement("span");
    pill.className = "pill due " + (card.status === "done" ? "" : due.cls);
    pill.innerHTML = icon("calendar");
    pill.append(card.status === "done" ? `${card.due.slice(5).replace("-", "/")} 截止` : due.label);
    pill.title = `截止日期：${card.due}`;
    titleRow.append(pill);
  }
  body.append(titleRow);

  if (card.notes) {
    const notes = document.createElement("p");
    notes.className = "notes";
    highlight(notes, card.notes, term);
    body.append(notes);
  }

  // 專案標籤
  const meta = document.createElement("div");
  meta.className = "meta";
  const project = projectName(board, card.projectId);
  if (project && board.activeProject === ALL) {
    const tag = document.createElement("span");
    tag.className = "pill";
    tag.innerHTML = icon("tag");
    tag.append(project);
    meta.append(tag);
  }
  if (meta.childElementCount) body.append(meta);
  li.append(body);

  const actions = document.createElement("div");
  actions.className = "card-actions";

  // 下排：編輯、刪除、移到其他看板
  const tools = document.createElement("span");
  tools.className = "tools";
  const edit = iconButton("edit", "編輯細項", () => openCardDialog(card));
  const del = iconButton("trash", "刪除卡片", () => {
    if (!confirm(`確定要刪除「${card.text}」嗎？`)) return;
    removeCard(card.id);
    update();
  });
  tools.append(edit, del);
  actions.append(tools);

  // 移到其他專案或看板（沒有可以移的地方時不顯示）
  if (state.boards.length > 1 || board.projects.length) {
    const toBoard = iconButton("board", "移到其他專案或看板", () => openBoardMenu(toBoard, card));
    toBoard.setAttribute("aria-haspopup", "menu");
    tools.append(toBoard);
  }

  // 左右移動按鈕：觸控裝置或不方便拖曳時使用
  const move = document.createElement("span");
  move.className = "move";
  const col = COLUMNS.findIndex((c) => c.status === card.status);
  if (col > 0) {
    const prev = COLUMNS[col - 1];
    move.append(iconButton("left", `移到「${prev.title}」`, () => moveCard(card.id, prev.status)));
  }
  if (col < COLUMNS.length - 1) {
    const next = COLUMNS[col + 1];
    move.append(iconButton("right", `移到「${next.title}」`, () => moveCard(card.id, next.status)));
  }
  actions.prepend(move); // 箭頭在上排，其他圖示在下排
  li.append(actions);

  li.addEventListener("dragstart", (e) => {
    draggingId = card.id;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", card.id);
    requestAnimationFrame(() => li.classList.add("dragging"));
  });
  li.addEventListener("dragend", () => {
    draggingId = null;
    li.classList.remove("dragging");
    removePlaceholders();
    boardEl.querySelectorAll(".drag-over").forEach((el) => el.classList.remove("drag-over"));
  });

  return li;
}

/* ---------- 細項編輯視窗 ---------- */

const dialog = document.getElementById("card-dialog");
const cardForm = document.getElementById("card-form");
const fieldTitle = document.getElementById("field-title");
const fieldNotes = document.getElementById("field-notes");
const fieldDue = document.getElementById("field-due");
const fieldStatus = document.getElementById("field-status");
const fieldProject = document.getElementById("field-project");
let editingCard = null;

document.getElementById("dialog-close").innerHTML = icon("close");
document.getElementById("dialog-delete").innerHTML = icon("trash");
fieldStatus.append(...COLUMNS.map((c) => new Option(c.title, c.status)));

function openCardDialog(card) {
  const board = activeBoard();
  editingCard = card;
  fieldTitle.value = card.text;
  fieldNotes.value = card.notes || "";
  fieldDue.value = card.due || "";
  fieldStatus.value = card.status;

  // 只有原本就沒專案的舊卡片才保留「未分類」選項
  const hasProject = !!projectName(board, card.projectId);
  fieldProject.replaceChildren(
    ...(hasProject ? [] : [new Option("未分類", "")]),
    ...sortedProjects(board).map((p) => new Option(p.name, p.id))
  );
  fieldProject.value = hasProject ? card.projectId : "";
  fieldProject.closest(".field").hidden = board.projects.length === 0;

  dialog.showModal();
  fieldTitle.focus();
}

function closeCardDialog() {
  editingCard = null;
  if (dialog.open) dialog.close();
}

cardForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const card = editingCard;
  const board = activeBoard();
  const text = fieldTitle.value.trim();
  if (!card || !text) return;

  card.text = text;
  const notes = fieldNotes.value.trim();
  if (notes) card.notes = notes;
  else delete card.notes;
  if (fieldDue.value) card.due = fieldDue.value;
  else delete card.due;
  if (fieldProject.value) card.projectId = fieldProject.value;
  else delete card.projectId;
  touch(card);
  if (fieldStatus.value !== card.status) placeCard(board, card, fieldStatus.value);

  closeCardDialog();
  update();
});

document.getElementById("dialog-cancel").addEventListener("click", closeCardDialog);
document.getElementById("dialog-close").addEventListener("click", closeCardDialog);
document.getElementById("dialog-delete").addEventListener("click", () => {
  const card = editingCard;
  if (!card || !confirm(`確定要刪除「${card.text}」嗎？`)) return;
  removeCard(card.id);
  closeCardDialog();
  update();
});
dialog.addEventListener("close", () => (editingCard = null));
// 只能按儲存、取消或關閉鈕離開，避免點到外面或按 Esc 時打好的內容不見
dialog.addEventListener("keydown", (e) => {
  if (e.key === "Escape") e.preventDefault();
});
dialog.addEventListener("cancel", (e) => e.preventDefault());

/* ---------- 移到其他看板的選單 ---------- */

let openMenu = null;

function closeBoardMenu() {
  if (!openMenu) return;
  openMenu.el.remove();
  openMenu.button.setAttribute("aria-expanded", "false");
  document.removeEventListener("pointerdown", onMenuOutside, true);
  document.removeEventListener("keydown", onMenuKey, true);
  window.removeEventListener("resize", closeBoardMenu);
  window.removeEventListener("scroll", closeBoardMenu, true);
  openMenu = null;
}

function onMenuOutside(e) {
  if (!openMenu.el.contains(e.target) && !openMenu.button.contains(e.target)) closeBoardMenu();
}

function onMenuKey(e) {
  if (e.key === "Escape") {
    const button = openMenu.button;
    closeBoardMenu();
    button.focus();
  }
}

function openBoardMenu(button, card) {
  const wasOpenHere = openMenu?.button === button;
  closeBoardMenu();
  if (wasOpenHere) return;

  const menu = document.createElement("div");
  menu.className = "menu";
  menu.setAttribute("role", "menu");

  const board = activeBoard();

  const heading = (label) => {
    const el = document.createElement("div");
    el.className = "menu-heading";
    el.textContent = label;
    menu.append(el);
  };

  const item = (label, current, onPick) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "menu-item" + (current ? " current" : "");
    btn.setAttribute("role", "menuitem");
    btn.textContent = label;
    if (current) {
      btn.disabled = true;
      btn.title = "目前所在位置";
    }
    btn.addEventListener("click", () => {
      closeBoardMenu();
      onPick();
      touch(card);
      update();
    });
    menu.append(btn);
  };

  const separator = () => {
    if (menu.childElementCount) menu.append(Object.assign(document.createElement("hr"), { className: "menu-sep" }));
  };

  // 同一個看板內換專案
  if (board.projects.length) {
    heading("移到專案");
    sortedProjects(board).forEach((project) => {
      item(project.name, card.projectId === project.id, () => (card.projectId = project.id));
    });
  }

  // 移到其他看板：要選定那個看板裡的專案
  state.boards
    .filter((b) => b.id !== state.activeId)
    .forEach((target) => {
      separator();
      heading(`移到「${target.name}」`);
      if (!target.projects.length) {
        const note = document.createElement("div");
        note.className = "menu-note";
        note.textContent = "這個看板還沒有專案";
        menu.append(note);
        return;
      }
      sortedProjects(target).forEach((project) => {
        item(project.name, false, () => {
          removeCard(card.id);
          card.projectId = project.id;
          const status = card.status;
          card.status = null; // 讓 placeCard 視為換欄，「已完成」會放到最上面
          placeCard(target, card, status);
        });
      });
    });

  document.body.append(menu);

  // 放在按鈕下方，超出畫面時往上或往左移
  const rect = button.getBoundingClientRect();
  const width = menu.offsetWidth;
  const height = menu.offsetHeight;
  // clientWidth / clientHeight 不含捲軸，避免選單超出畫面
  const viewW = document.documentElement.clientWidth;
  const viewH = document.documentElement.clientHeight;
  let left = Math.min(rect.right - width, viewW - width - 8); // 靠右對齊按鈕
  let top = rect.bottom + 6;
  if (top + height > viewH - 8) top = rect.top - height - 6;
  menu.style.left = `${Math.max(8, left) + window.scrollX}px`;
  menu.style.top = `${Math.max(8, top) + window.scrollY}px`;

  button.setAttribute("aria-expanded", "true");
  openMenu = { el: menu, button };
  document.addEventListener("pointerdown", onMenuOutside, true);
  document.addEventListener("keydown", onMenuKey, true);
  window.addEventListener("resize", closeBoardMenu);
  window.addEventListener("scroll", closeBoardMenu, true);
  menu.querySelector(".menu-item:not(:disabled)")?.focus();
}

/* ---------- 拖放 ---------- */

function setupDropZone(column, list, status) {
  column.addEventListener("dragover", (e) => {
    if (!draggingId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    column.classList.add("drag-over");

    const after = cardAfterPointer(list, e.clientY);
    const placeholder = getPlaceholder();
    if (after) list.insertBefore(placeholder, after);
    else list.append(placeholder);
  });

  column.addEventListener("dragleave", (e) => {
    if (!column.contains(e.relatedTarget)) {
      column.classList.remove("drag-over");
      column.querySelector(".placeholder")?.remove();
    }
  });

  column.addEventListener("drop", (e) => {
    if (!draggingId) return;
    e.preventDefault();
    const placeholder = list.querySelector(".placeholder");
    let next = placeholder?.nextElementSibling;
    if (next && next.dataset.id === draggingId) next = next.nextElementSibling;
    // 放在收合清單的最後面時，插在被收起來的第一張前面
    const beforeId = next?.dataset.id || list.dataset.hiddenFirst || null;
    const id = draggingId;
    draggingId = null; // 重新繪製後原本的卡片元素會被移除，dragend 不一定會觸發
    moveCard(id, status, beforeId);
  });
}

function cardAfterPointer(list, y) {
  const others = [...list.querySelectorAll(".card:not(.dragging)")];
  return others.find((el) => {
    const box = el.getBoundingClientRect();
    return y < box.top + box.height / 2;
  });
}

let placeholderEl = null;
function getPlaceholder() {
  if (!placeholderEl) {
    placeholderEl = document.createElement("li");
    placeholderEl.className = "placeholder";
  }
  return placeholderEl;
}

function removePlaceholders() {
  placeholderEl?.remove();
}

/* ---------- 匯出／匯入 ---------- */

const exportBtn = document.getElementById("export-btn");
const importBtn = document.getElementById("import-btn");
const importFile = document.getElementById("import-file");
exportBtn.innerHTML = icon("download");
importBtn.innerHTML = icon("upload");

function todayString() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// 下載目前所有看板資料為 JSON 檔
exportBtn.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  // 檔名去掉 Windows 不允許的字元
  const name = (state.title || DEFAULT_TITLE).replace(/[\\/:*?"<>|]/g, "").trim() || DEFAULT_TITLE;
  a.href = url;
  a.download = `${name}-${todayString()}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
});

// 檢查匯入的資料格式，並整理成可用的狀態；格式不對時回傳 null
function parseImport(data) {
  if (!data || typeof data !== "object" || !Array.isArray(data.boards)) return null;
  const str = (v) => (typeof v === "string" ? v.trim() : "");
  const parseCards = (list) =>
    (Array.isArray(list) ? list : [])
      .filter((c) => c && str(c.text))
      .map((c) => {
        const card = { id: str(c.id) || newId(), text: str(c.text), status: str(c.status) };
        if (str(c.notes)) card.notes = str(c.notes);
        if (/^\d{4}-\d{2}-\d{2}$/.test(str(c.due))) card.due = str(c.due);
        if (str(c.projectId)) card.projectId = str(c.projectId);
        if (c.starred) card.starred = true;
        if (Number.isFinite(c.updatedAt)) card.updatedAt = c.updatedAt;
        return card;
      });
  const boards = data.boards
    .filter((b) => b && typeof b === "object")
    .map((b) => ({
      id: str(b.id) || newId(),
      name: str(b.name) || "未命名看板",
      ...(str(b.motto) && { motto: str(b.motto) }),
      activeProject: str(b.activeProject) || ALL,
      projects: (Array.isArray(b.projects) ? b.projects : [])
        .filter((p) => p && str(p.id) && str(p.name))
        .map((p) => ({ id: str(p.id), name: str(p.name) })),
      cards: parseCards(b.cards),
      trash: (Array.isArray(b.trash) ? b.trash : [])
        .filter((t) => t && str(t.id) && str(t.name) && Number.isFinite(t.deletedAt))
        .map((t) => ({ id: str(t.id), name: str(t.name), deletedAt: t.deletedAt, cards: parseCards(t.cards) })),
    }));
  if (!boards.length) return null;
  const result = { title: str(data.title) || DEFAULT_TITLE, activeId: str(data.activeId), boards };
  if (str(data.motto)) result.motto = str(data.motto);
  return normalize(result);
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
    alert("無法匯入：這個檔案不是待辦看板的備份檔。");
    return;
  }

  const count = imported.boards.reduce((n, b) => n + b.cards.length, 0);
  const message =
    `要匯入「${file.name}」嗎？\n` +
    `內含 ${imported.boards.length} 個看板、${count} 張卡片。\n\n` +
    `匯入後會取代目前瀏覽器裡的所有看板資料，建議先按「匯出」備份。`;
  if (!confirm(message)) return;

  state = imported;
  searchTerms.clear();
  expandedDone.clear();
  update();
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
render();
