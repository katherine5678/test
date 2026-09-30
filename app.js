const STORAGE_KEY = "kanban";
const LEGACY_KEY = "todos";
const THEME_KEY = "theme";

const COLUMNS = [
  { status: "todo", title: "待辦" },
  { status: "doing", title: "進行中" },
  { status: "done", title: "已完成" },
];

const board = document.getElementById("board");
const summary = document.getElementById("summary");
const columnTemplate = document.getElementById("column-template");
const themeToggle = document.getElementById("theme-toggle");
const themeLabel = document.getElementById("theme-label");

let cards = load();
let draggingId = null;

/* ---------- 資料 ---------- */

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(saved)) return saved;
    // 從舊版清單轉換過來
    const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY));
    if (Array.isArray(legacy)) {
      return legacy.map((t) => ({ id: t.id, text: t.text, status: t.done ? "done" : "todo" }));
    }
  } catch {}
  return [];
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
  } catch {
    // 無法儲存時（例如無痕模式）仍可正常使用
  }
}

function update() {
  save();
  render();
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function moveCard(id, status, beforeId = null) {
  const card = cards.find((c) => c.id === id);
  if (!card) return;
  cards = cards.filter((c) => c.id !== id);
  card.status = status;
  const index = beforeId ? cards.findIndex((c) => c.id === beforeId) : -1;
  if (index === -1) cards.push(card);
  else cards.splice(index, 0, card);
  update();
}

/* ---------- 畫面 ---------- */

function render() {
  board.replaceChildren(...COLUMNS.map(renderColumn));

  const doneCount = cards.filter((c) => c.status === "done").length;
  summary.textContent = cards.length
    ? `共 ${cards.length} 張卡片，已完成 ${doneCount} 張`
    : "今天想完成什麼？";
}

function renderColumn({ status, title }) {
  const column = columnTemplate.content.firstElementChild.cloneNode(true);
  const items = cards.filter((c) => c.status === status);

  column.dataset.status = status;
  column.querySelector("h2").textContent = title;
  column.querySelector(".badge").textContent = items.length;

  const list = column.querySelector(".cards");
  list.append(...items.map(renderCard));

  const clear = column.querySelector(".clear");
  if (status === "done" && items.length) {
    clear.hidden = false;
    clear.addEventListener("click", () => {
      cards = cards.filter((c) => c.status !== "done");
      update();
    });
  }

  const form = column.querySelector(".add-form");
  const input = form.querySelector("input");
  input.setAttribute("aria-label", `在「${title}」新增卡片`);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    cards.push({ id: newId(), text, status });
    update();
    // 重新繪製後讓同一欄的輸入框保持焦點，方便連續新增
    board.querySelector(`.column[data-status="${status}"] .add-form input`).focus();
  });

  setupDropZone(column, list, status);
  return column;
}

function renderCard(card) {
  const li = document.createElement("li");
  li.className = "card";
  li.draggable = true;
  li.dataset.id = card.id;

  const text = document.createElement("span");
  text.className = "text";
  text.textContent = card.text;
  text.title = "雙擊編輯";
  text.addEventListener("dblclick", () => startEdit(li, card));

  const del = document.createElement("button");
  del.type = "button";
  del.className = "delete";
  del.textContent = "✕";
  del.setAttribute("aria-label", "刪除卡片");
  del.addEventListener("click", () => {
    cards = cards.filter((c) => c.id !== card.id);
    update();
  });

  // 左右移動按鈕：觸控裝置或不方便拖曳時使用
  const actions = document.createElement("div");
  actions.className = "card-actions";
  const col = COLUMNS.findIndex((c) => c.status === card.status);
  if (col > 0) actions.append(moveButton(`← ${COLUMNS[col - 1].title}`, card.id, COLUMNS[col - 1].status));
  if (col < COLUMNS.length - 1) actions.append(moveButton(`${COLUMNS[col + 1].title} →`, card.id, COLUMNS[col + 1].status));

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
    board.querySelectorAll(".drag-over").forEach((el) => el.classList.remove("drag-over"));
  });

  li.append(text, del, actions);
  return li;
}

function moveButton(label, id, status) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = label;
  btn.addEventListener("click", () => moveCard(id, status));
  return btn;
}

function startEdit(li, card) {
  li.draggable = false;
  const editor = document.createElement("input");
  editor.type = "text";
  editor.value = card.text;
  editor.maxLength = 200;

  let finished = false;
  const finish = (commit) => {
    if (finished) return;
    finished = true;
    if (commit) {
      const value = editor.value.trim();
      if (value) card.text = value;
      else cards = cards.filter((c) => c.id !== card.id);
    }
    update();
  };

  editor.addEventListener("keydown", (e) => {
    if (e.key === "Enter") finish(true);
    if (e.key === "Escape") finish(false);
  });
  editor.addEventListener("blur", () => finish(true));

  li.querySelector(".text").replaceWith(editor);
  editor.focus();
  editor.select();
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
    moveCard(draggingId, status, next?.dataset.id || null);
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
