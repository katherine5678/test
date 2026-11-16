const STORAGE_KEY = "friends";
const THEME_KEY = "theme";

// 分類篩選的特殊值
const ALL = "all";
const NONE = "none";

const ICON_PATHS = {
  edit: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
  heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  ban: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
  sparkles: '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>',
  download: '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>',
  upload: '<path d="M12 3v12"/><path d="m17 8-5-5-5 5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
};

function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name]}</svg>`;
}

function iconButton(name, label, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "icon-btn";
  btn.innerHTML = icon(name);
  btn.title = label;
  btn.setAttribute("aria-label", label);
  btn.addEventListener("click", onClick);
  return btn;
}

const statsEl = document.getElementById("friends-stats");
const groupsEl = document.getElementById("groups");
const friendsEl = document.getElementById("friends");
const searchInput = document.getElementById("search");
const groupDelete = document.getElementById("group-delete");
const themeToggle = document.getElementById("theme-toggle");
const themeLabel = document.getElementById("theme-label");

let state = load();

/* ---------- 資料 ---------- */

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function normalize(s) {
  s.groups ||= [];
  s.friends ||= [];
  s.activeGroup ||= ALL;
  // 舊資料沒有興趣欄位
  s.friends.forEach((f) => {
    f.hobbies ||= [];
    f.likes ||= [];
    f.dislikes ||= [];
  });
  if (![ALL, NONE].includes(s.activeGroup) && !s.groups.some((g) => g.id === s.activeGroup)) s.activeGroup = ALL;
  return s;
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.friends)) return normalize(saved);
  } catch {}
  return normalize({});
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

function groupName(id) {
  return state.groups.find((g) => g.id === id)?.name;
}

function sortedGroups() {
  return [...state.groups].sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));
}

// 卡片上顯示的名字：有暱稱用暱稱，否則用本名
function displayName(friend) {
  return friend.nickname || friend.name;
}

/* 生日與星座：生日存成 "YYYY-MM-DD"，不知道年份時存 "MM-DD" */

const BLOOD_TYPES = ["A", "B", "O", "AB"];

// 每個月的最後一天之前屬於前一個星座，之後屬於下一個（例如 1/19 前是摩羯，1/20 起是水瓶）
const ZODIAC = [
  [19, "摩羯座"], [18, "水瓶座"], [20, "雙魚座"], [19, "牡羊座"], [20, "金牛座"], [21, "雙子座"],
  [22, "巨蟹座"], [22, "獅子座"], [22, "處女座"], [23, "天秤座"], [22, "天蠍座"], [21, "射手座"],
];

function zodiacOf(month, day) {
  if (!month || !day) return "";
  const [last, sign] = ZODIAC[month - 1];
  return day <= last ? sign : ZODIAC[month % 12][1];
}

function parseBirthday(value) {
  const parts = (value || "").split("-").map(Number);
  if (parts.length === 3) return { year: parts[0], month: parts[1], day: parts[2] };
  if (parts.length === 2) return { year: 0, month: parts[0], day: parts[1] };
  return null;
}

// 沒有年份時以閏年計算，2/29 也可以選
function daysInMonth(month, year = 2000) {
  return new Date(year || 2000, month, 0).getDate();
}

function isValidBirthday(value) {
  if (!/^(\d{4}-)?\d{2}-\d{2}$/.test(value || "")) return false;
  const { year, month, day } = parseBirthday(value);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(month, year);
}

function ageOf(birthday) {
  const { year, month, day } = parseBirthday(birthday);
  if (!year) return null;
  const today = new Date();
  const passed = today.getMonth() + 1 > month || (today.getMonth() + 1 === month && today.getDate() >= day);
  return today.getFullYear() - year - (passed ? 0 : 1);
}

function birthdayLabel(birthday) {
  const { month, day } = parseBirthday(birthday);
  const age = ageOf(birthday);
  return [`${month}/${day}`, zodiacOf(month, day), age !== null && age >= 0 ? `${age} 歲` : ""].filter(Boolean).join(" · ");
}

function searchTerm() {
  return searchInput.value.trim().toLowerCase();
}

function matchesSearch(friend) {
  const term = searchTerm();
  if (!term) return true;
  const birthday = friend.birthday ? parseBirthday(friend.birthday) : null;
  const haystack = [
    friend.name, friend.nickname, friend.job, friend.politics, friend.notes,
    friend.blood && `${friend.blood} 型`, birthday && zodiacOf(birthday.month, birthday.day),
    ...friend.hobbies, ...friend.likes, ...friend.dislikes, groupName(friend.groupId),
  ].filter(Boolean).join("\n").toLowerCase();
  return haystack.includes(term);
}

function groupFriends() {
  const filter = state.activeGroup;
  if (filter === ALL) return state.friends;
  if (filter === NONE) return state.friends.filter((f) => !groupName(f.groupId));
  return state.friends.filter((f) => f.groupId === filter);
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

// 把文字拆成清單：換行、頓號、逗號都可以分隔，重複的只留一個
function splitList(value) {
  return [...new Set(value.split(/[\n、，,]+/).map((s) => s.trim()).filter(Boolean))];
}

// 把 target 換成輸入框；Enter / 失焦儲存，Esc 取消
function inlineEdit(target, value, onDone, className = "", maxLength = 40) {
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
  statsEl.textContent = `共 ${state.friends.length} 位朋友`;
  renderGroups();
  renderGroupDelete();
  renderFriends();
}

/* 分類 */

const DOUBLE_CLICK_MS = 500;
let lastChipClick = { id: null, at: 0 }; // 用來判斷分類標籤是否連點兩下

function renderGroups() {
  const chip = (id, label, count, onDoubleClick) => {
    const active = state.activeGroup === id;
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
      state.activeGroup = id;
      update();
    });
    wrap.append(btn);
    return { wrap, btn };
  };

  const chips = [chip(ALL, "全部", state.friends.length).wrap];

  sortedGroups().forEach((group) => {
    const count = state.friends.filter((f) => f.groupId === group.id).length;
    const { wrap, btn } = chip(group.id, group.name, count, (el) => renameGroup(group, el));
    btn.title = "點兩下可以重新命名";
    chips.push(wrap);
  });

  const uncategorized = state.friends.filter((f) => !groupName(f.groupId)).length;
  if (state.groups.length && (uncategorized || state.activeGroup === NONE)) {
    chips.push(chip(NONE, "未分類", uncategorized).wrap);
  }

  const add = document.createElement("button");
  add.type = "button";
  add.className = "chip-add";
  add.textContent = "＋ 新增分類";
  add.addEventListener("click", addGroup);

  const label = document.createElement("span");
  label.className = "projects-label";
  label.innerHTML = icon("tag");
  label.title = "朋友分類（例如在哪裡認識的）";

  groupsEl.replaceChildren(label, ...chips, add);
}

function renameGroup(group, nameEl) {
  inlineEdit(nameEl, group.name, (value) => {
    if (value) group.name = value;
    update();
  }, "chip-input");
}

function addGroup() {
  const group = { id: newId(), name: "新分類" };
  state.groups.push(group);
  state.activeGroup = group.id;
  update();
  renameGroup(group, groupsEl.querySelector(".chip.active .chip-name"));
}

// 右上角的垃圾桶：選了某個分類時才出現，刪除分類但保留裡面的朋友
function renderGroupDelete() {
  const group = state.groups.find((g) => g.id === state.activeGroup);
  groupDelete.hidden = !group;
  if (!group) return;
  const label = `刪除分類「${group.name}」`;
  groupDelete.title = label;
  groupDelete.setAttribute("aria-label", label);
}

groupDelete.innerHTML = icon("trash");
groupDelete.addEventListener("click", () => {
  const group = state.groups.find((g) => g.id === state.activeGroup);
  if (!group) return;
  const count = state.friends.filter((f) => f.groupId === group.id).length;
  const detail = count ? `\n裡面的 ${count} 位朋友不會被刪除，會改成「未分類」。` : "";
  if (!confirm(`確定要刪除分類「${group.name}」嗎？${detail}`)) return;
  state.groups = state.groups.filter((g) => g.id !== group.id);
  state.friends.forEach((f) => {
    if (f.groupId === group.id) delete f.groupId;
  });
  state.activeGroup = ALL;
  update();
});

/* 朋友卡片 */

function renderPref(kind, iconName, label, items, term) {
  const row = document.createElement("div");
  row.className = `pref ${kind}`;
  row.title = label;
  row.insertAdjacentHTML("afterbegin", icon(iconName));
  const list = document.createElement("div");
  list.className = "pref-items";
  list.setAttribute("aria-label", label);
  list.append(...items.map((item) => {
    const el = document.createElement("span");
    el.className = "pref-item";
    highlight(el, item, term);
    return el;
  }));
  row.append(list);
  return row;
}

function renderFriend(friend) {
  const term = searchTerm();
  const card = document.createElement("article");
  card.className = "friend";
  card.addEventListener("dblclick", (e) => {
    if (!e.target.closest("button")) openFriendDialog(friend);
  });

  const head = document.createElement("header");
  head.className = "friend-head";
  const name = document.createElement("h2");
  name.className = "friend-name";
  highlight(name, displayName(friend), term);
  head.append(name);
  // 有暱稱時，本名小字放在旁邊
  if (friend.nickname && friend.name) {
    const realName = document.createElement("span");
    realName.className = "friend-nickname-sub";
    highlight(realName, friend.name, term);
    head.append(realName);
  }
  const group = groupName(friend.groupId);
  if (group && state.activeGroup === ALL) {
    const tag = document.createElement("span");
    tag.className = "friend-group";
    tag.textContent = group;
    head.append(tag);
  }
  head.append(iconButton("edit", `編輯「${displayName(friend)}」`, () => openFriendDialog(friend)));
  card.append(head);

  const info = [
    ["生日", friend.birthday && birthdayLabel(friend.birthday)],
    ["血型", friend.blood && `${friend.blood} 型`],
    ["工作", friend.job],
    ["政治", friend.politics],
  ].filter(([, value]) => value);
  if (info.length) {
    const list = document.createElement("p");
    list.className = "friend-info";
    list.append(...info.map(([label, value]) => {
      const item = document.createElement("span");
      const b = document.createElement("b");
      b.textContent = label;
      item.append(b);
      highlight(item, value, term);
      return item;
    }));
    card.append(list);
  }

  if (friend.hobbies.length) card.append(renderPref("hobbies", "sparkles", "興趣", friend.hobbies, term));
  if (friend.likes.length) card.append(renderPref("likes", "heart", "喜歡", friend.likes, term));
  if (friend.dislikes.length) card.append(renderPref("dislikes", "ban", "不喜歡", friend.dislikes, term));

  if (friend.notes) {
    const notes = document.createElement("p");
    notes.className = "friend-notes";
    highlight(notes, friend.notes, term);
    card.append(notes);
  }
  return card;
}

function renderFriends() {
  const friends = groupFriends()
    .filter(matchesSearch)
    .sort((a, b) => displayName(a).localeCompare(displayName(b), "zh-Hant"));

  if (!friends.length) {
    const empty = document.createElement("p");
    empty.className = "friends-empty";
    empty.textContent = searchTerm() ? "找不到符合的朋友" : "這裡還沒有朋友的紀錄";
    friendsEl.replaceChildren(empty);
    return;
  }
  friendsEl.replaceChildren(...friends.map(renderFriend));
}

searchInput.addEventListener("input", renderFriends);
searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && searchInput.value) {
    searchInput.value = "";
    renderFriends();
  }
});

/* ---------- 編輯視窗 ---------- */

const dialog = document.getElementById("friend-dialog");
const friendForm = document.getElementById("friend-form");
const fieldName = document.getElementById("field-name");
const fieldNickname = document.getElementById("field-nickname");
const fieldGroup = document.getElementById("field-group");
const fieldBlood = document.getElementById("field-blood");
const fieldYear = document.getElementById("field-birth-year");
const fieldMonth = document.getElementById("field-birth-month");
const fieldDay = document.getElementById("field-birth-day");
const fieldZodiac = document.getElementById("field-zodiac");
const fieldJob = document.getElementById("field-job");
const fieldPolitics = document.getElementById("field-politics");
const fieldHobbies = document.getElementById("field-hobbies");
const fieldLikes = document.getElementById("field-likes");
const fieldDislikes = document.getElementById("field-dislikes");
const fieldNotes = document.getElementById("field-notes");
const deleteBtn = document.getElementById("friend-delete");
let editingFriend = null; // null 代表新增

document.getElementById("friend-close").innerHTML = icon("close");
deleteBtn.innerHTML = icon("trash");
fieldMonth.append(new Option("月", ""), ...Array.from({ length: 12 }, (_, i) => new Option(`${i + 1} 月`, i + 1)));

// 依月份（和年份）更新可選的日期，並自動顯示星座
function syncBirthday() {
  const month = Number(fieldMonth.value);
  const year = Number(fieldYear.value) || 0;
  const day = fieldDay.value;
  const total = month ? daysInMonth(month, year) : 31;
  fieldDay.replaceChildren(new Option("日", ""), ...Array.from({ length: total }, (_, i) => new Option(`${i + 1} 日`, i + 1)));
  if (Number(day) <= total) fieldDay.value = day;
  fieldZodiac.textContent = zodiacOf(month, Number(fieldDay.value)) || "—";
  // 有填年份或月份就要選完整的月、日
  const incomplete = (fieldYear.value || month || fieldDay.value) && !(month && fieldDay.value);
  fieldDay.setCustomValidity(incomplete ? "請選擇生日的月份和日期" : "");
}

[fieldYear, fieldMonth, fieldDay].forEach((el) => el.addEventListener("input", syncBirthday));

function birthdayValue() {
  if (!fieldMonth.value || !fieldDay.value) return "";
  const pad = (n) => String(n).padStart(2, "0");
  const md = `${pad(fieldMonth.value)}-${pad(fieldDay.value)}`;
  return fieldYear.value ? `${fieldYear.value}-${md}` : md;
}

function openFriendDialog(friend = null) {
  editingFriend = friend;
  document.getElementById("friend-dialog-title").textContent = friend ? "編輯朋友" : "新增朋友";
  fieldName.value = friend?.name || "";
  fieldNickname.value = friend?.nickname || "";
  fieldName.setCustomValidity("");
  fieldBlood.value = friend?.blood || "";
  const birthday = friend?.birthday ? parseBirthday(friend.birthday) : null;
  fieldYear.value = birthday?.year || "";
  fieldMonth.value = birthday?.month || "";
  fieldDay.replaceChildren(new Option("", birthday?.day || ""));
  fieldDay.value = birthday?.day || "";
  syncBirthday();
  fieldJob.value = friend?.job || "";
  fieldPolitics.value = friend?.politics || "";
  fieldHobbies.value = friend?.hobbies.join("、") || "";
  fieldLikes.value = friend?.likes.join("\n") || "";
  fieldDislikes.value = friend?.dislikes.join("\n") || "";
  fieldNotes.value = friend?.notes || "";

  // 新增時預設放進目前選的分類
  const groupId = friend ? friend.groupId : state.activeGroup;
  fieldGroup.replaceChildren(new Option("未分類", ""), ...sortedGroups().map((g) => new Option(g.name, g.id)));
  fieldGroup.value = groupName(groupId) ? groupId : "";
  fieldGroup.closest(".field").hidden = state.groups.length === 0;

  deleteBtn.hidden = !friend;
  dialog.showModal();
  fieldName.focus();
}

function closeFriendDialog() {
  editingFriend = null;
  if (dialog.open) dialog.close();
}

friendForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = fieldName.value.trim();
  const nickname = fieldNickname.value.trim();
  if (!name && !nickname) {
    fieldName.setCustomValidity("請填本名或暱稱");
    fieldName.reportValidity();
    return;
  }

  const friend = editingFriend || { id: newId() };
  friend.hobbies = splitList(fieldHobbies.value);
  friend.likes = splitList(fieldLikes.value);
  friend.dislikes = splitList(fieldDislikes.value);
  // 文字欄位：空白時不存
  const text = { name, nickname, birthday: birthdayValue(), blood: fieldBlood.value, job: fieldJob.value, politics: fieldPolitics.value, notes: fieldNotes.value };
  Object.entries(text).forEach(([key, value]) => {
    if (value.trim()) friend[key] = value.trim();
    else delete friend[key];
  });
  if (fieldGroup.value) friend.groupId = fieldGroup.value;
  else delete friend.groupId;
  friend.updatedAt = Date.now();
  if (!editingFriend) state.friends.push(friend);

  closeFriendDialog();
  update();
});

fieldName.addEventListener("input", () => fieldName.setCustomValidity(""));
fieldNickname.addEventListener("input", () => fieldName.setCustomValidity(""));
document.getElementById("add-friend").addEventListener("click", () => openFriendDialog());
document.getElementById("friend-cancel").addEventListener("click", closeFriendDialog);
document.getElementById("friend-close").addEventListener("click", closeFriendDialog);
deleteBtn.addEventListener("click", () => {
  const friend = editingFriend;
  if (!friend || !confirm(`確定要刪除「${displayName(friend)}」嗎？刪除後無法復原。`)) return;
  state.friends = state.friends.filter((f) => f !== friend);
  closeFriendDialog();
  update();
});
dialog.addEventListener("close", () => (editingFriend = null));
// 只能按儲存、取消或關閉鈕離開，避免點到外面或按 Esc 時打好的內容不見
dialog.addEventListener("keydown", (e) => {
  if (e.key === "Escape") e.preventDefault();
});
dialog.addEventListener("cancel", (e) => e.preventDefault());

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

exportBtn.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `朋友喜好-${todayString()}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
});

// 檢查匯入的資料格式，並整理成可用的狀態；格式不對時回傳 null
function parseImport(data) {
  if (!data || typeof data !== "object" || !Array.isArray(data.friends)) return null;
  const str = (v) => (typeof v === "string" ? v.trim() : "");
  const list = (v) => [...new Set((Array.isArray(v) ? v : []).map(str).filter(Boolean))];
  const groups = (Array.isArray(data.groups) ? data.groups : [])
    .filter((g) => g && str(g.id) && str(g.name))
    .map((g) => ({ id: str(g.id), name: str(g.name) }));
  const friends = data.friends
    .filter((f) => f && (str(f.name) || str(f.nickname)))
    .map((f) => {
      const friend = { id: str(f.id) || newId(), hobbies: list(f.hobbies), likes: list(f.likes), dislikes: list(f.dislikes) };
      ["name", "nickname", "job", "politics", "notes"].forEach((key) => {
        if (str(f[key])) friend[key] = str(f[key]);
      });
      if (isValidBirthday(str(f.birthday))) friend.birthday = str(f.birthday);
      if (BLOOD_TYPES.includes(f.blood)) friend.blood = f.blood;
      if (str(f.groupId)) friend.groupId = str(f.groupId);
      if (Number.isFinite(f.updatedAt)) friend.updatedAt = f.updatedAt;
      return friend;
    });
  return normalize({ groups, friends, activeGroup: str(data.activeGroup) || ALL });
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
    alert("無法匯入：這個檔案不是朋友喜好的備份檔。");
    return;
  }

  const message =
    `要匯入「${file.name}」嗎？\n` +
    `內含 ${imported.groups.length} 個分類、${imported.friends.length} 位朋友。\n\n` +
    `匯入後會取代目前瀏覽器裡的所有朋友資料，建議先按「匯出」備份。`;
  if (!confirm(message)) return;

  state = imported;
  searchInput.value = "";
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
