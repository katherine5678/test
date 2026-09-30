const STORAGE_KEY = "todos";

const form = document.getElementById("new-form");
const input = document.getElementById("new-input");
const list = document.getElementById("list");
const empty = document.getElementById("empty");
const count = document.getElementById("count");
const summary = document.getElementById("summary");
const clearDone = document.getElementById("clear-done");
const filterButtons = document.querySelectorAll(".filters button");

let todos = load();
let filter = "all";

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  } catch {
    // 無法儲存時（例如無痕模式）仍可正常使用
  }
}

function update() {
  save();
  render();
}

function render() {
  const visible = todos.filter((t) =>
    filter === "all" ? true : filter === "done" ? t.done : !t.done
  );

  list.replaceChildren(...visible.map(renderItem));
  empty.hidden = visible.length > 0;

  const remaining = todos.filter((t) => !t.done).length;
  const doneCount = todos.length - remaining;
  count.textContent = `剩下 ${remaining} 項`;
  clearDone.disabled = doneCount === 0;
  summary.textContent = todos.length
    ? `共 ${todos.length} 項，已完成 ${doneCount} 項`
    : "今天想完成什麼？";
}

function renderItem(todo) {
  const li = document.createElement("li");
  li.className = "item" + (todo.done ? " done" : "");

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = todo.done;
  checkbox.setAttribute("aria-label", "標記完成");
  checkbox.addEventListener("change", () => {
    todo.done = checkbox.checked;
    update();
  });

  const text = document.createElement("span");
  text.className = "text";
  text.textContent = todo.text;
  text.title = "雙擊編輯";
  text.addEventListener("dblclick", () => startEdit(li, todo));

  const del = document.createElement("button");
  del.className = "delete";
  del.type = "button";
  del.textContent = "✕";
  del.setAttribute("aria-label", "刪除");
  del.addEventListener("click", () => {
    todos = todos.filter((t) => t.id !== todo.id);
    update();
  });

  li.append(checkbox, text, del);
  return li;
}

function startEdit(li, todo) {
  const editor = document.createElement("input");
  editor.type = "text";
  editor.className = "edit";
  editor.value = todo.text;
  editor.maxLength = 200;

  let finished = false;
  const finish = (commit) => {
    if (finished) return;
    finished = true;
    if (commit) {
      const value = editor.value.trim();
      if (value) todo.text = value;
      else todos = todos.filter((t) => t.id !== todo.id);
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

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  todos.unshift({ id: Date.now().toString(36) + Math.random().toString(36).slice(2), text, done: false });
  input.value = "";
  update();
});

filterButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    filter = btn.dataset.filter;
    filterButtons.forEach((b) => b.classList.toggle("active", b === btn));
    render();
  });
});

clearDone.addEventListener("click", () => {
  todos = todos.filter((t) => !t.done);
  update();
});

render();
