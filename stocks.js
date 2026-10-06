const STORAGE_KEY = "stock-records";
const THEME_KEY = "theme";
const PAGE_TITLE = "股票紀錄";

const FEE_RATE = 0.001425; // 券商手續費率 0.1425%
const DEFAULT_SETTINGS = { feeDiscount: 1, minFee: 20, taxRate: 0.3 };

const PERIODS = [
  { id: "7d", label: "7 天" },
  { id: "30d", label: "30 天" },
  { id: "3m", label: "3 個月" },
  { id: "all", label: "全部" },
  { id: "custom", label: "自訂" },
];

/* ---------- 圖示 ---------- */

// 單色線條圖示（Lucide，ISC 授權），顏色跟隨文字色
const ICON_PATHS = {
  edit: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  download: '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>',
  upload: '<path d="M12 3v12"/><path d="m17 8-5-5-5 5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
  sheet: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M8 13h2"/><path d="M14 13h2"/><path d="M8 17h2"/><path d="M14 17h2"/>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
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

/* ---------- 資料 ---------- */

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function defaultState() {
  return {
    trades: [],
    dividends: [],
    transfers: [], // 銀行與股票帳戶之間的資金進出
    prices: {}, // 手動輸入的現價，用來算未實現損益
    settings: { ...DEFAULT_SETTINGS },
    view: { period: "30d", from: "", to: "", symbol: "" },
  };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const str = (v) => (typeof v === "string" ? v.trim() : "");
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : Number.NaN);

// 檢查並整理資料（讀取 localStorage 和匯入時共用）；格式不對時回傳 null
function sanitize(data) {
  if (!data || typeof data !== "object" || !Array.isArray(data.trades) || !Array.isArray(data.dividends)) return null;
  const s = defaultState();

  s.trades = data.trades
    .filter((t) => t && DATE_RE.test(str(t.date)) && str(t.symbol) && ["buy", "sell"].includes(t.side) && num(t.shares) > 0 && num(t.price) >= 0)
    .map((t) => ({
      id: str(t.id) || newId(),
      date: str(t.date),
      symbol: str(t.symbol).toUpperCase(),
      name: str(t.name),
      side: t.side,
      shares: t.shares,
      price: t.price,
      fee: num(t.fee) >= 0 ? t.fee : 0,
      tax: num(t.tax) >= 0 ? t.tax : 0,
      note: str(t.note),
      createdAt: num(t.createdAt) >= 0 ? t.createdAt : 0,
    }));

  s.dividends = data.dividends
    .filter((d) => d && DATE_RE.test(str(d.date)) && str(d.symbol) && (num(d.cash) > 0 || num(d.stockShares) > 0))
    .map((d) => ({
      id: str(d.id) || newId(),
      date: str(d.date),
      symbol: str(d.symbol).toUpperCase(),
      name: str(d.name),
      cash: num(d.cash) > 0 ? d.cash : 0,
      stockShares: num(d.stockShares) > 0 ? d.stockShares : 0,
      note: str(d.note),
      createdAt: num(d.createdAt) >= 0 ? d.createdAt : 0,
    }));

  // 舊版備份沒有資金進出，視為空的
  s.transfers = (Array.isArray(data.transfers) ? data.transfers : [])
    .filter((t) => t && DATE_RE.test(str(t.date)) && str(t.bank) && ["in", "out"].includes(t.type) && num(t.amount) > 0)
    .map((t) => ({
      id: str(t.id) || newId(),
      date: str(t.date),
      bank: str(t.bank),
      type: t.type,
      amount: t.amount,
      note: str(t.note),
      createdAt: num(t.createdAt) >= 0 ? t.createdAt : 0,
    }));

  if (data.prices && typeof data.prices === "object") {
    for (const [symbol, price] of Object.entries(data.prices)) {
      if (num(price) > 0) s.prices[symbol] = price;
    }
  }

  const set = data.settings || {};
  if (num(set.feeDiscount) > 0 && set.feeDiscount <= 1) s.settings.feeDiscount = set.feeDiscount;
  if (num(set.minFee) >= 0) s.settings.minFee = set.minFee;
  if (num(set.taxRate) >= 0) s.settings.taxRate = set.taxRate;

  const view = data.view || {};
  if (PERIODS.some((p) => p.id === view.period)) s.view.period = view.period;
  if (DATE_RE.test(str(view.from))) s.view.from = str(view.from);
  if (DATE_RE.test(str(view.to))) s.view.to = str(view.to);
  s.view.symbol = str(view.symbol);

  return s;
}

function load() {
  try {
    return sanitize(JSON.parse(localStorage.getItem(STORAGE_KEY))) || defaultState();
  } catch {
    return defaultState();
  }
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

let state = load();

/* ---------- 日期與數字 ---------- */

function dateString(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const todayString = () => dateString(new Date());

// 目前期間的起訖日（空字串表示不限）
function periodRange() {
  const { period, from, to } = state.view;
  const today = todayString();
  const daysAgo = (n) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return dateString(d);
  };
  if (period === "7d") return { from: daysAgo(6), to: today };
  if (period === "30d") return { from: daysAgo(29), to: today };
  if (period === "3m") {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return { from: dateString(d), to: today };
  }
  if (period === "custom") return { from, to };
  return { from: "", to: "" };
}

function inRange(date, range) {
  return (!range.from || date >= range.from) && (!range.to || date <= range.to);
}

function matchesSymbol(record) {
  return !state.view.symbol || record.symbol === state.view.symbol;
}

const byDateDesc = (a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt;

function fmt(n, digits = 0) {
  return n.toLocaleString("zh-TW", { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

// 損益加上正負號
function fmtSigned(n) {
  const rounded = Math.round(n);
  return (rounded > 0 ? "+" : "") + fmt(rounded);
}

function plClass(n) {
  const rounded = Math.round(n);
  return rounded > 0 ? "gain" : rounded < 0 ? "loss" : "";
}

/* ---------- 計算 ---------- */

// 依代號找最近一次填的股票名稱
function stockNames() {
  const names = new Map();
  [...state.trades, ...state.dividends]
    .sort((a, b) => a.createdAt - b.createdAt)
    .forEach((r) => {
      if (r.name) names.set(r.symbol, r.name);
      else if (!names.has(r.symbol)) names.set(r.symbol, "");
    });
  return names;
}

function stockLabel(names, symbol) {
  const name = names.get(symbol);
  return name ? `${symbol} ${name}` : symbol;
}

function tradeAmount(t) {
  return t.shares * t.price;
}

// 交易的淨收付：買進為負（付出），賣出為正（收入）
function tradeNet(t) {
  return t.side === "buy" ? -(tradeAmount(t) + t.fee) : tradeAmount(t) - t.fee - t.tax;
}

// 依時間順序計算持股與每筆賣出的已實現損益（平均成本法，買進成本含手續費）
function buildLedger(trades = state.trades) {
  const events = [
    ...trades.map((r) => ({ kind: "trade", r })),
    ...state.dividends.filter((d) => d.stockShares > 0).map((r) => ({ kind: "stock-dividend", r })),
  ].sort((a, b) => a.r.date.localeCompare(b.r.date) || a.r.createdAt - b.r.createdAt);

  const positions = new Map(); // 代號 → { shares, cost }
  const realized = new Map(); // 賣出交易 id → 已實現損益

  for (const { kind, r } of events) {
    const pos = positions.get(r.symbol) || { shares: 0, cost: 0 };
    if (kind === "stock-dividend") {
      // 配股：股數增加、成本不變，平均成本因此下降
      pos.shares += r.stockShares;
    } else if (r.side === "buy") {
      pos.shares += r.shares;
      pos.cost += tradeAmount(r) + r.fee;
    } else {
      const matched = Math.min(r.shares, pos.shares);
      const costOut = pos.shares > 0 ? (pos.cost * matched) / pos.shares : 0;
      realized.set(r.id, tradeAmount(r) - r.fee - r.tax - costOut);
      pos.shares -= matched;
      pos.cost -= costOut;
      if (pos.shares <= 0) pos.cost = 0;
    }
    positions.set(r.symbol, pos);
  }
  return { positions, realized };
}

// 入金為正、出金為負
function transferSigned(t) {
  return t.type === "in" ? t.amount : -t.amount;
}

// 股票帳戶現金餘額：淨入金 + 賣出收入 + 現金股利 − 買進支出
// 帳戶層級的數字，不受股票篩選影響；計算到 untilDate（空字串表示全部）
function cashBalance(untilDate = "") {
  const until = (r) => !untilDate || r.date <= untilDate;
  return state.transfers.filter(until).reduce((sum, t) => sum + transferSigned(t), 0)
    + state.trades.filter(until).reduce((sum, t) => sum + tradeNet(t), 0)
    + state.dividends.filter(until).reduce((sum, d) => sum + d.cash, 0);
}

// 各銀行累計入金、出金（所有期間）
function bankSummary() {
  const banks = new Map();
  state.transfers.forEach((t) => {
    const item = banks.get(t.bank) || { in: 0, out: 0, count: 0, last: "" };
    item[t.type] += t.amount;
    item.count += 1;
    if (t.date > item.last) item.last = t.date;
    banks.set(t.bank, item);
  });
  return [...banks.entries()].sort(([a], [b]) => a.localeCompare(b, "zh-Hant"));
}

function calcFee(amount) {
  if (amount <= 0) return 0;
  const { feeDiscount, minFee } = state.settings;
  return Math.max(minFee, Math.floor(amount * FEE_RATE * feeDiscount));
}

function calcTax(amount, side) {
  return side === "sell" ? Math.floor((amount * state.settings.taxRate) / 100) : 0;
}

/* ---------- 畫面 ---------- */

const periodsEl = document.getElementById("periods");
const customRange = document.getElementById("custom-range");
const rangeFrom = document.getElementById("range-from");
const rangeTo = document.getElementById("range-to");
const symbolFilter = document.getElementById("symbol-filter");
const rangeLabel = document.getElementById("range-label");
const statsEl = document.getElementById("stats");
const holdingsTable = document.getElementById("holdings-table");
const holdingsNote = document.getElementById("holdings-note");
const tradesTable = document.getElementById("trades-table");
const dividendsTable = document.getElementById("dividends-table");
const yearlyTable = document.getElementById("yearly-table");
const symbolList = document.getElementById("symbol-list");
const banksTable = document.getElementById("banks-table");
const transfersTable = document.getElementById("transfers-table");
const bankList = document.getElementById("bank-list");

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// 建立表格：headers 為 [文字, 是否數字欄]；rows 為儲存格陣列（字串或 DOM 節點）
function fillTable(table, headers, rows, emptyText, footer) {
  const thead = el("thead");
  const headRow = el("tr");
  headers.forEach(([label, numeric]) => headRow.append(el("th", numeric ? "num" : "", label)));
  thead.append(headRow);

  const tbody = el("tbody");
  if (!rows.length) {
    const tr = el("tr");
    const td = el("td", "empty", emptyText);
    td.colSpan = headers.length;
    tr.append(td);
    tbody.append(tr);
  }
  rows.forEach((row) => tbody.append(row));
  table.replaceChildren(thead, tbody);
  if (footer) {
    const tfoot = el("tfoot");
    tfoot.append(footer);
    table.append(tfoot);
  }
}

// 一列：cells 為 [內容, className]
function makeRow(cells, className) {
  const tr = el("tr", className);
  cells.forEach(([content, cls]) => {
    const td = el("td", cls || "");
    if (content instanceof Node) td.append(content);
    else td.textContent = content ?? "";
    tr.append(td);
  });
  return tr;
}

function render() {
  document.title = PAGE_TITLE;
  const names = stockNames();
  const range = periodRange();
  const ledger = buildLedger();

  renderToolbar(names, range);

  const trades = state.trades.filter((t) => inRange(t.date, range) && matchesSymbol(t)).sort(byDateDesc);
  const dividends = state.dividends.filter((d) => inRange(d.date, range) && matchesSymbol(d)).sort(byDateDesc);
  // 資金進出和個股無關，只依期間篩選
  const transfers = state.transfers.filter((t) => inRange(t.date, range)).sort(byDateDesc);

  renderStats(trades, dividends, transfers, ledger);
  renderHoldings(names, ledger);
  renderTrades(names, trades, ledger);
  renderDividends(names, dividends);
  renderYearly(names);
  renderBanks();
  renderTransfers(transfers);
}

function rangeText(range) {
  if (!range.from && !range.to) return "全部期間";
  return `${range.from || "最早"} ～ ${range.to || "最新"}`;
}

function renderToolbar(names, range) {
  periodsEl.replaceChildren(...PERIODS.map((p) => {
    const btn = el("button", p.id === state.view.period ? "active" : "", p.label);
    btn.type = "button";
    btn.setAttribute("aria-pressed", String(p.id === state.view.period));
    btn.addEventListener("click", () => {
      state.view.period = p.id;
      // 第一次選自訂時，預設帶入最近 30 天
      if (p.id === "custom" && !state.view.from && !state.view.to) {
        const d = new Date();
        d.setDate(d.getDate() - 29);
        state.view.from = dateString(d);
        state.view.to = todayString();
      }
      update();
    });
    return btn;
  }));

  customRange.hidden = state.view.period !== "custom";
  rangeFrom.value = state.view.from;
  rangeTo.value = state.view.to;

  const symbols = [...names.keys()].sort();
  // 篩選的股票已經沒有紀錄時，回到全部
  if (state.view.symbol && !names.has(state.view.symbol)) state.view.symbol = "";
  symbolFilter.replaceChildren(
    new Option("全部股票", ""),
    ...symbols.map((s) => new Option(stockLabel(names, s), s))
  );
  symbolFilter.value = state.view.symbol;
  symbolList.replaceChildren(...symbols.map((s) => new Option(names.get(s) || "", s)));
  bankList.replaceChildren(...bankSummary().map(([bank]) => new Option("", bank)));

  const filter = state.view.symbol ? ` · ${stockLabel(names, state.view.symbol)}` : "";
  rangeLabel.textContent = `${rangeText(range)}${filter}`;
}

function renderStats(trades, dividends, transfers, ledger) {
  const realized = trades.filter((t) => t.side === "sell").reduce((sum, t) => sum + (ledger.realized.get(t.id) || 0), 0);
  const cash = dividends.reduce((sum, d) => sum + d.cash, 0);
  const stockShares = dividends.reduce((sum, d) => sum + d.stockShares, 0);
  const bought = trades.filter((t) => t.side === "buy").reduce((sum, t) => sum - tradeNet(t), 0);
  const sold = trades.filter((t) => t.side === "sell").reduce((sum, t) => sum + tradeNet(t), 0);

  const tile = (label, value, note, className, color) => {
    const box = el("div", "stat " + (className || ""));
    box.style.setProperty("--tile-color", `var(${color})`);
    box.append(el("span", "stat-label", label), el("strong", "stat-value", value), el("span", "stat-note", note));
    return box;
  };

  const moneyIn = transfers.filter((t) => t.type === "in").reduce((sum, t) => sum + t.amount, 0);
  const moneyOut = transfers.filter((t) => t.type === "out").reduce((sum, t) => sum + t.amount, 0);
  const netIn = moneyIn - moneyOut;

  const until = periodRange().to;
  const balance = cashBalance(until);
  const balanceNote = Math.round(balance) < 0
    ? "餘額為負，可能有入金沒記到"
    : `${until ? `截至 ${until}` : "目前"}，淨入金＋賣出＋股利−買進`;

  const total = realized + cash;
  statsEl.replaceChildren(
    tile("期間總收益", fmtSigned(total), "已實現損益 + 現金股利", plClass(total), "--accent"),
    tile("已實現損益", fmtSigned(realized), `${trades.filter((t) => t.side === "sell").length} 筆賣出`, plClass(realized), "--todo"),
    tile("股利收入", fmt(Math.round(cash)), stockShares ? `另配股 ${fmt(stockShares)} 股` : `${dividends.length} 筆股利`, "", "--done"),
    tile("帳戶現金餘額", fmt(Math.round(balance)), balanceNote, Math.round(balance) < 0 ? "warn" : "", "--accent"),
    tile("買進支出", fmt(Math.round(bought)), `${trades.filter((t) => t.side === "buy").length} 筆買進，含手續費`, "", "--doing"),
    tile("賣出收入", fmt(Math.round(sold)), "扣除手續費與交易稅", "", "--doing"),
    tile("淨入金", fmtSigned(netIn), `入金 ${fmt(Math.round(moneyIn))} · 出金 ${fmt(Math.round(moneyOut))}`, "", "--urgent")
  );
}

function renderHoldings(names, ledger) {
  let totalCost = 0;
  let totalValue = 0;
  let pricedCost = 0;

  const rows = [...ledger.positions.entries()]
    .filter(([symbol, pos]) => pos.shares > 0 && matchesSymbol({ symbol }))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([symbol, pos]) => {
      const avg = pos.cost / pos.shares;
      const price = state.prices[symbol];
      totalCost += pos.cost;

      // 現價輸入框：改完（Enter 或離開欄位）就重新計算
      const input = el("input", "price-input");
      input.type = "number";
      input.min = "0";
      input.step = "any";
      input.placeholder = "輸入現價";
      input.value = price ?? "";
      input.setAttribute("aria-label", `${stockLabel(names, symbol)} 現價`);
      input.addEventListener("change", () => {
        const value = Number(input.value);
        if (input.value !== "" && value > 0) state.prices[symbol] = value;
        else delete state.prices[symbol];
        update();
      });

      let value = "";
      let pl = "";
      let rate = "";
      let cls = "";
      if (price) {
        const marketValue = pos.shares * price;
        const unrealized = marketValue - pos.cost;
        totalValue += marketValue;
        pricedCost += pos.cost;
        value = fmt(Math.round(marketValue));
        pl = fmtSigned(unrealized);
        rate = pos.cost ? `${(unrealized / pos.cost * 100).toFixed(2)}%` : "";
        cls = plClass(unrealized);
      }
      return makeRow([
        [stockLabel(names, symbol)],
        [fmt(pos.shares), "num"],
        [fmt(avg, 2), "num"],
        [fmt(Math.round(pos.cost)), "num"],
        [input, "num"],
        [value, "num"],
        [pl, "num " + cls],
        [rate, "num " + cls],
      ]);
    });

  let footer = null;
  if (rows.length) {
    const unrealized = totalValue - pricedCost;
    footer = makeRow([
      ["合計"],
      [""],
      [""],
      [fmt(Math.round(totalCost)), "num"],
      [""],
      [totalValue ? fmt(Math.round(totalValue)) : "", "num"],
      [pricedCost ? fmtSigned(unrealized) : "", "num " + plClass(unrealized)],
      [pricedCost ? `${(unrealized / pricedCost * 100).toFixed(2)}%` : "", "num " + plClass(unrealized)],
    ], "total");
  }

  holdingsNote.textContent = "不受期間影響；輸入現價即可估算未實現損益（未扣賣出費用）";
  fillTable(holdingsTable, [
    ["股票"], ["持股", true], ["平均成本", true], ["總成本", true], ["現價", true], ["市值", true], ["未實現損益", true], ["報酬率", true],
  ], rows, "目前沒有持股", footer);
}

function actions(onEdit, onDelete) {
  const wrap = el("span", "row-actions");
  wrap.append(iconButton("edit", "編輯", onEdit), iconButton("trash", "刪除", onDelete));
  return wrap;
}

function renderTrades(names, trades, ledger) {
  const rows = trades.map((t) => {
    const realized = ledger.realized.get(t.id);
    const net = tradeNet(t);
    return makeRow([
      [t.date],
      [stockLabel(names, t.symbol)],
      [el("span", "side-tag " + t.side, t.side === "buy" ? "買進" : "賣出")],
      [fmt(t.shares), "num"],
      [fmt(t.price, 4), "num"],
      [fmt(Math.round(tradeAmount(t))), "num"],
      [fmt(t.fee), "num"],
      [t.tax ? fmt(t.tax) : "", "num"],
      [fmtSigned(net), "num"],
      [realized === undefined ? "" : fmtSigned(realized), "num " + (realized === undefined ? "" : plClass(realized))],
      [t.note, "note"],
      [actions(() => openTradeDialog(t), () => deleteRecord("trades", t, `${t.date} ${t.side === "buy" ? "買進" : "賣出"} ${stockLabel(names, t.symbol)}`)), "actions"],
    ]);
  });
  fillTable(tradesTable, [
    ["日期"], ["股票"], ["買賣"], ["股數", true], ["成交價", true], ["成交金額", true], ["手續費", true], ["交易稅", true], ["淨收付", true], ["已實現損益", true], ["備註"], [""],
  ], rows, "這段期間沒有交易紀錄");
}

function renderDividends(names, dividends) {
  const rows = dividends.map((d) => makeRow([
    [d.date],
    [stockLabel(names, d.symbol)],
    [d.cash ? fmt(d.cash, 2) : "", "num"],
    [d.stockShares ? fmt(d.stockShares) : "", "num"],
    [d.note, "note"],
    [actions(() => openDividendDialog(d), () => deleteRecord("dividends", d, `${d.date} ${stockLabel(names, d.symbol)} 的股利`)), "actions"],
  ]));
  fillTable(dividendsTable, [
    ["發放日期"], ["股票"], ["現金股利", true], ["配股（股）", true], ["備註"], [""],
  ], rows, "這段期間沒有股利紀錄");
}

// 年度 → 股票 的股利統計（不受期間影響，受股票篩選影響）
function yearlySummary() {
  const years = new Map();
  state.dividends.filter(matchesSymbol).forEach((d) => {
    const year = d.date.slice(0, 4);
    if (!years.has(year)) years.set(year, new Map());
    const stocks = years.get(year);
    const item = stocks.get(d.symbol) || { cash: 0, stockShares: 0, count: 0 };
    item.cash += d.cash;
    item.stockShares += d.stockShares;
    item.count += 1;
    stocks.set(d.symbol, item);
  });
  return [...years.entries()].sort(([a], [b]) => b.localeCompare(a));
}

function renderYearly(names) {
  const rows = [];
  yearlySummary().forEach(([year, stocks]) => {
    let cash = 0;
    let shares = 0;
    [...stocks.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([symbol, item]) => {
      cash += item.cash;
      shares += item.stockShares;
      rows.push(makeRow([
        [year],
        [stockLabel(names, symbol)],
        [`${item.count} 次`, "num"],
        [fmt(Math.round(item.cash)), "num"],
        [item.stockShares ? fmt(item.stockShares) : "", "num"],
      ]));
    });
    rows.push(makeRow([
      [`${year} 合計`],
      [""],
      [""],
      [fmt(Math.round(cash)), "num"],
      [shares ? fmt(shares) : "", "num"],
    ], "subtotal"));
  });
  fillTable(yearlyTable, [
    ["年度"], ["股票"], ["發放次數", true], ["現金股利", true], ["配股（股）", true],
  ], rows, "還沒有股利紀錄");
}

function renderBanks() {
  let totalIn = 0;
  let totalOut = 0;
  const rows = bankSummary().map(([bank, item]) => {
    totalIn += item.in;
    totalOut += item.out;
    return makeRow([
      [bank],
      [fmt(Math.round(item.in)), "num"],
      [item.out ? fmt(Math.round(item.out)) : "", "num"],
      [fmtSigned(item.in - item.out), "num"],
      [`${item.count} 筆`, "num"],
      [item.last],
    ]);
  });
  const footer = rows.length
    ? makeRow([
      ["合計"],
      [fmt(Math.round(totalIn)), "num"],
      [totalOut ? fmt(Math.round(totalOut)) : "", "num"],
      [fmtSigned(totalIn - totalOut), "num"],
      [""],
      [""],
    ], "total")
    : null;
  fillTable(banksTable, [
    ["銀行"], ["累計入金", true], ["累計出金", true], ["淨投入", true], ["筆數", true], ["最近一筆"],
  ], rows, "還沒有資金進出紀錄", footer);
}

function renderTransfers(transfers) {
  const rows = transfers.map((t) => makeRow([
    [t.date],
    [t.bank],
    [el("span", "side-tag " + t.type, t.type === "in" ? "入金" : "出金")],
    [fmtSigned(transferSigned(t)), "num"],
    [t.note, "note"],
    [actions(() => openTransferDialog(t), () => deleteRecord("transfers", t, `${t.date} ${t.bank} ${t.type === "in" ? "入金" : "出金"} ${fmt(t.amount)} 元`)), "actions"],
  ]));
  fillTable(transfersTable, [
    ["日期"], ["銀行"], ["類型"], ["金額", true], ["備註"], [""],
  ], rows, "這段期間沒有資金進出");
}

/* ---------- 工具列 ---------- */

function onRangeChange() {
  let from = rangeFrom.value;
  let to = rangeTo.value;
  if (from && to && from > to) [from, to] = [to, from]; // 起訖顛倒時自動對調
  state.view.from = from;
  state.view.to = to;
  update();
}

rangeFrom.addEventListener("change", onRangeChange);
rangeTo.addEventListener("change", onRangeChange);

symbolFilter.addEventListener("change", () => {
  state.view.symbol = symbolFilter.value;
  update();
});

function deleteRecord(kind, record, label) {
  if (!confirm(`確定要刪除「${label}」嗎？`)) return;
  state[kind] = state[kind].filter((r) => r !== record);
  update();
}

/* ---------- 對話視窗共用 ---------- */

// 只能按儲存、取消或關閉鈕離開，避免點到外面或按 Esc 時打好的內容不見
function setupDialog(dialog) {
  dialog.querySelectorAll("[data-close]").forEach((btn) => {
    if (btn.classList.contains("icon-btn")) btn.innerHTML = icon("close");
    btn.addEventListener("click", () => dialog.close());
  });
  dialog.addEventListener("keydown", (e) => {
    if (e.key === "Escape") e.preventDefault();
  });
  dialog.addEventListener("cancel", (e) => e.preventDefault());
}

// 輸入代號後，名稱空白時自動帶入之前用過的名稱
function autoFillName(form) {
  form.elements.symbol.addEventListener("change", () => {
    const symbol = form.elements.symbol.value.trim().toUpperCase();
    form.elements.symbol.value = symbol;
    const name = stockNames().get(symbol);
    if (name && !form.elements.name.value.trim()) form.elements.name.value = name;
  });
}

/* ---------- 交易視窗 ---------- */

const tradeDialog = document.getElementById("trade-dialog");
const tradeForm = document.getElementById("trade-form");
const tradeTotal = document.getElementById("trade-total");
let editingTrade = null;

setupDialog(tradeDialog);
autoFillName(tradeForm);

function tradeSide() {
  return tradeForm.elements.side.value;
}

// 依股數、價格自動計算手續費與交易稅（手動改過的欄位就不再覆蓋）
function recalcTrade() {
  const f = tradeForm.elements;
  const amount = (Number(f.shares.value) || 0) * (Number(f.price.value) || 0);
  const side = tradeSide();
  if (!f.fee.dataset.manual) f.fee.value = amount ? calcFee(amount) : "";
  if (side === "buy") {
    f.tax.value = 0;
    f.tax.disabled = true;
  } else {
    f.tax.disabled = false;
    if (!f.tax.dataset.manual) f.tax.value = amount ? calcTax(amount, side) : "";
  }
  const fee = Number(f.fee.value) || 0;
  const tax = side === "sell" ? Number(f.tax.value) || 0 : 0;
  if (!amount) {
    tradeTotal.textContent = "";
  } else if (side === "buy") {
    tradeTotal.textContent = `成交金額 ${fmt(Math.round(amount))} 元，應付 ${fmt(Math.round(amount + fee))} 元`;
  } else {
    tradeTotal.textContent = `成交金額 ${fmt(Math.round(amount))} 元，應收 ${fmt(Math.round(amount - fee - tax))} 元`;
  }
}

["shares", "price"].forEach((name) => tradeForm.elements[name].addEventListener("input", recalcTrade));
tradeForm.querySelectorAll('input[name="side"]').forEach((radio) => radio.addEventListener("change", () => {
  delete tradeForm.elements.tax.dataset.manual; // 換買賣別時重新計算交易稅
  recalcTrade();
}));
["fee", "tax"].forEach((name) => tradeForm.elements[name].addEventListener("input", () => {
  tradeForm.elements[name].dataset.manual = "1";
  recalcTrade();
}));

function openTradeDialog(trade = null) {
  editingTrade = trade;
  const f = tradeForm.elements;
  tradeForm.reset();
  document.getElementById("trade-title").textContent = trade ? "編輯交易" : "新增交易";
  delete f.fee.dataset.manual;
  delete f.tax.dataset.manual;

  if (trade) {
    f.side.value = trade.side;
    f.date.value = trade.date;
    f.symbol.value = trade.symbol;
    f.name.value = trade.name;
    f.shares.value = trade.shares;
    f.price.value = trade.price;
    f.fee.value = trade.fee;
    f.tax.value = trade.tax;
    f.note.value = trade.note;
    // 編輯時保留原本的費用，不自動覆蓋
    f.fee.dataset.manual = "1";
    f.tax.dataset.manual = "1";
  } else {
    f.date.value = todayString();
    if (state.view.symbol) {
      f.symbol.value = state.view.symbol;
      f.name.value = stockNames().get(state.view.symbol) || "";
    }
  }
  recalcTrade();
  tradeDialog.showModal();
  (trade ? f.shares : f.symbol.value ? f.shares : f.symbol).focus();
}

tradeForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const f = tradeForm.elements;
  const side = tradeSide();
  const record = {
    id: editingTrade?.id || newId(),
    date: f.date.value,
    symbol: f.symbol.value.trim().toUpperCase(),
    name: f.name.value.trim(),
    side,
    shares: Number(f.shares.value),
    price: Number(f.price.value),
    fee: Number(f.fee.value) || 0,
    tax: side === "sell" ? Number(f.tax.value) || 0 : 0,
    note: f.note.value.trim(),
    createdAt: editingTrade?.createdAt || Date.now(),
  };
  if (!record.symbol || !(record.shares > 0) || !(record.price >= 0)) return;

  // 賣出超過持股時提醒（例如之前的買進沒有記錄到）
  if (side === "sell") {
    const others = state.trades.filter((t) => t.id !== record.id && t.date <= record.date);
    const held = buildLedger(others).positions.get(record.symbol)?.shares || 0;
    if (record.shares > held && !confirm(`紀錄中 ${record.date} 當時 ${record.symbol} 只持有 ${fmt(held)} 股，確定要賣出 ${fmt(record.shares)} 股嗎？\n超出的部分會以成本 0 計算損益。`)) return;
  }

  if (editingTrade) state.trades = state.trades.map((t) => (t === editingTrade ? record : t));
  else state.trades.push(record);
  tradeDialog.close();
  update();
});

tradeDialog.addEventListener("close", () => (editingTrade = null));
document.getElementById("add-trade").addEventListener("click", () => openTradeDialog());

/* ---------- 股利視窗 ---------- */

const dividendDialog = document.getElementById("dividend-dialog");
const dividendForm = document.getElementById("dividend-form");
let editingDividend = null;

setupDialog(dividendDialog);
autoFillName(dividendForm);

function openDividendDialog(dividend = null) {
  editingDividend = dividend;
  const f = dividendForm.elements;
  dividendForm.reset();
  document.getElementById("dividend-title").textContent = dividend ? "編輯股利" : "新增股利";
  if (dividend) {
    f.date.value = dividend.date;
    f.symbol.value = dividend.symbol;
    f.name.value = dividend.name;
    f.cash.value = dividend.cash || "";
    f.stockShares.value = dividend.stockShares || "";
    f.note.value = dividend.note;
  } else {
    f.date.value = todayString();
    if (state.view.symbol) {
      f.symbol.value = state.view.symbol;
      f.name.value = stockNames().get(state.view.symbol) || "";
    }
  }
  dividendDialog.showModal();
  (f.symbol.value ? f.cash : f.symbol).focus();
}

dividendForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const f = dividendForm.elements;
  const record = {
    id: editingDividend?.id || newId(),
    date: f.date.value,
    symbol: f.symbol.value.trim().toUpperCase(),
    name: f.name.value.trim(),
    cash: Number(f.cash.value) || 0,
    stockShares: Number(f.stockShares.value) || 0,
    note: f.note.value.trim(),
    createdAt: editingDividend?.createdAt || Date.now(),
  };
  if (!record.symbol) return;
  if (!(record.cash > 0) && !(record.stockShares > 0)) {
    alert("請填寫現金股利或配股股數。");
    return;
  }
  if (editingDividend) state.dividends = state.dividends.map((d) => (d === editingDividend ? record : d));
  else state.dividends.push(record);
  dividendDialog.close();
  update();
});

dividendDialog.addEventListener("close", () => (editingDividend = null));
document.getElementById("add-dividend").addEventListener("click", () => openDividendDialog());

/* ---------- 資金進出視窗 ---------- */

const transferDialog = document.getElementById("transfer-dialog");
const transferForm = document.getElementById("transfer-form");
let editingTransfer = null;

setupDialog(transferDialog);

function openTransferDialog(transfer = null) {
  editingTransfer = transfer;
  const f = transferForm.elements;
  transferForm.reset();
  document.getElementById("transfer-title").textContent = transfer ? "編輯資金進出" : "新增資金進出";
  if (transfer) {
    f.type.value = transfer.type;
    f.date.value = transfer.date;
    f.bank.value = transfer.bank;
    f.amount.value = transfer.amount;
    f.note.value = transfer.note;
  } else {
    f.date.value = todayString();
    // 只用過一家銀行時直接帶入
    const banks = bankSummary();
    if (banks.length === 1) f.bank.value = banks[0][0];
  }
  transferDialog.showModal();
  (f.bank.value ? f.amount : f.bank).focus();
}

transferForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const f = transferForm.elements;
  const record = {
    id: editingTransfer?.id || newId(),
    date: f.date.value,
    bank: f.bank.value.trim(),
    type: f.type.value,
    amount: Number(f.amount.value),
    note: f.note.value.trim(),
    createdAt: editingTransfer?.createdAt || Date.now(),
  };
  if (!record.bank || !(record.amount > 0)) return;
  if (editingTransfer) state.transfers = state.transfers.map((t) => (t === editingTransfer ? record : t));
  else state.transfers.push(record);
  transferDialog.close();
  update();
});

transferDialog.addEventListener("close", () => (editingTransfer = null));
document.getElementById("add-transfer").addEventListener("click", () => openTransferDialog());

/* ---------- 設定視窗 ---------- */

const settingsDialog = document.getElementById("settings-dialog");
const settingsForm = document.getElementById("settings-form");
setupDialog(settingsDialog);

document.getElementById("settings-btn").innerHTML = icon("settings");
document.getElementById("settings-btn").addEventListener("click", () => {
  const f = settingsForm.elements;
  f.feeDiscount.value = state.settings.feeDiscount;
  f.minFee.value = state.settings.minFee;
  f.taxRate.value = state.settings.taxRate;
  settingsDialog.showModal();
});

settingsForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const f = settingsForm.elements;
  state.settings = {
    feeDiscount: Number(f.feeDiscount.value),
    minFee: Number(f.minFee.value),
    taxRate: Number(f.taxRate.value),
  };
  settingsDialog.close();
  update();
});

/* ---------- 匯出／匯入 JSON ---------- */

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

const exportBtn = document.getElementById("export-btn");
const importBtn = document.getElementById("import-btn");
const importFile = document.getElementById("import-file");
exportBtn.innerHTML = icon("download");
importBtn.innerHTML = icon("upload");

exportBtn.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  download(blob, `${PAGE_TITLE}-${todayString()}.json`);
});

importBtn.addEventListener("click", () => importFile.click());

importFile.addEventListener("change", async () => {
  const file = importFile.files[0];
  importFile.value = ""; // 讓同一個檔案可以再選一次
  if (!file) return;

  let imported = null;
  try {
    imported = sanitize(JSON.parse(await file.text()));
  } catch {}
  if (!imported) {
    alert("無法匯入：這個檔案不是股票紀錄的備份檔。\n（看板的備份請到看板頁面匯入）");
    return;
  }

  const message =
    `要匯入「${file.name}」嗎？\n` +
    `內含 ${imported.trades.length} 筆交易、${imported.dividends.length} 筆股利、${imported.transfers.length} 筆資金進出。\n\n` +
    `匯入後會取代目前瀏覽器裡的所有股票紀錄，建議先按「匯出」備份。`;
  if (!confirm(message)) return;

  state = imported;
  update();
});

/* ---------- Excel 報表 ---------- */

// 不需外部套件：直接產生 .xlsx（未壓縮的 zip + SpreadsheetML）

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(files) {
  const encoder = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  const DOS_DATE = 0x21; // 1980-01-01

  for (const file of files) {
    const name = encoder.encode(file.name);
    const crc = crc32(file.data);
    const size = file.data.length;

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // 檔名為 UTF-8
    local.setUint16(12, DOS_DATE, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true);
    local.setUint32(22, size, true);
    local.setUint16(26, name.length, true);
    parts.push(local, name, file.data);

    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint16(8, 0x0800, true);
    entry.setUint16(14, DOS_DATE, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, size, true);
    entry.setUint32(24, size, true);
    entry.setUint16(28, name.length, true);
    entry.setUint32(42, offset, true);
    central.push(entry, name);

    offset += 30 + name.length + size;
  }

  const centralSize = central.reduce((sum, part) => sum + part.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);

  return new Blob([...parts, ...central, end], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_PKG = "http://schemas.openxmlformats.org/package/2006/relationships";

function xmlEscape(value) {
  return String(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function columnName(index) {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return name;
}

// 儲存格樣式：0 一般、1 粗體標題、2 整數、3 小數、4 百分比
const S = { text: 0, head: 1, int: 2, dec: 3, pct: 4 };

const STYLES_XML = `${XML_HEAD}<styleSheet xmlns="${NS_MAIN}">
<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00##"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Microsoft JhengHei"/></font><font><b/><sz val="11"/><name val="Microsoft JhengHei"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFECE7FF"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="5">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

// rows：每列為儲存格陣列，儲存格可為字串、數字或 { v, s }
function sheetXml(rows, widths) {
  const cols = `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`;
  const body = rows.map((row, r) => {
    const cells = row.map((cell, c) => {
      const { v, s } = cell !== null && typeof cell === "object" ? cell : { v: cell, s: typeof cell === "number" ? S.int : S.text };
      if (v === null || v === undefined || v === "" || (typeof v === "number" && !Number.isFinite(v))) return "";
      const ref = `${columnName(c)}${r + 1}`;
      const style = s ? ` s="${s}"` : "";
      return typeof v === "number"
        ? `<c r="${ref}"${style}><v>${v}</v></c>`
        : `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(v)}</t></is></c>`;
    });
    return `<row r="${r + 1}">${cells.join("")}</row>`;
  });
  return `${XML_HEAD}<worksheet xmlns="${NS_MAIN}">${cols}<sheetData>${body.join("")}</sheetData></worksheet>`;
}

function buildXlsx(sheets) {
  const encoder = new TextEncoder();
  const overrides = sheets.map((_, i) =>
    `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("");
  const files = [
    ["[Content_Types].xml", `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${overrides}</Types>`],
    ["_rels/.rels", `${XML_HEAD}<Relationships xmlns="${NS_PKG}"><Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `${XML_HEAD}<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><sheets>${sheets.map((s, i) => `<sheet name="${xmlEscape(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `${XML_HEAD}<Relationships xmlns="${NS_PKG}">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${NS_REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="${NS_REL}/styles" Target="styles.xml"/></Relationships>`],
    ["xl/styles.xml", STYLES_XML],
    ...sheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s.rows, s.widths)]),
  ];
  return zip(files.map(([name, text]) => ({ name, data: encoder.encode(text) })));
}

const head = (labels) => labels.map((v) => ({ v, s: S.head }));
const round2 = (n) => Math.round(n * 100) / 100;

// 依目前的期間與股票篩選產生報表
function buildReport() {
  const names = stockNames();
  const range = periodRange();
  const ledger = buildLedger();
  const trades = state.trades.filter((t) => inRange(t.date, range) && matchesSymbol(t)).sort(byDateDesc);
  const dividends = state.dividends.filter((d) => inRange(d.date, range) && matchesSymbol(d)).sort(byDateDesc);

  const sells = trades.filter((t) => t.side === "sell");
  const realized = sells.reduce((sum, t) => sum + (ledger.realized.get(t.id) || 0), 0);
  const cash = dividends.reduce((sum, d) => sum + d.cash, 0);
  const bought = trades.filter((t) => t.side === "buy").reduce((sum, t) => sum - tradeNet(t), 0);
  const sold = sells.reduce((sum, t) => sum + tradeNet(t), 0);
  const int = (n) => ({ v: Math.round(n), s: S.int });
  const dec = (n) => ({ v: round2(n), s: S.dec });
  const transfers = state.transfers.filter((t) => inRange(t.date, range)).sort(byDateDesc);
  const moneyIn = transfers.filter((t) => t.type === "in").reduce((sum, t) => sum + t.amount, 0);
  const moneyOut = transfers.filter((t) => t.type === "out").reduce((sum, t) => sum + t.amount, 0);

  const summary = {
    name: "摘要",
    widths: [18, 28],
    rows: [
      head(["項目", "內容"]),
      ["期間", rangeText(range)],
      ["股票", state.view.symbol ? stockLabel(names, state.view.symbol) : "全部股票"],
      ["期間總收益", int(realized + cash)],
      ["已實現損益", int(realized)],
      ["現金股利", int(cash)],
      ["配股（股）", int(dividends.reduce((sum, d) => sum + d.stockShares, 0))],
      ["買進支出（含手續費）", int(bought)],
      ["賣出收入（扣費用）", int(sold)],
      ["入金", int(moneyIn)],
      ["出金", int(moneyOut)],
      ["淨入金", int(moneyIn - moneyOut)],
      [`帳戶現金餘額（${range.to ? `截至 ${range.to}` : "目前"}，所有股票）`, int(cashBalance(range.to))],
      ["交易筆數", int(trades.length)],
      ["股利筆數", int(dividends.length)],
      ["資金進出筆數", int(transfers.length)],
      ["報表產生時間", new Date().toLocaleString("zh-TW", { hour12: false })],
    ],
  };

  const tradeSheet = {
    name: "交易明細",
    widths: [12, 10, 14, 8, 10, 12, 14, 10, 10, 14, 14, 24],
    rows: [
      head(["日期", "代號", "名稱", "買賣", "股數", "成交價", "成交金額", "手續費", "交易稅", "淨收付", "已實現損益", "備註"]),
      ...trades.map((t) => {
        const r = ledger.realized.get(t.id);
        return [
          t.date, t.symbol, names.get(t.symbol) || "", t.side === "buy" ? "買進" : "賣出",
          int(t.shares), dec(t.price), int(tradeAmount(t)), int(t.fee), int(t.tax), int(tradeNet(t)),
          r === undefined ? "" : int(r), t.note,
        ];
      }),
    ],
  };

  const dividendSheet = {
    name: "股利明細",
    widths: [12, 10, 14, 14, 12, 24],
    rows: [
      head(["發放日期", "代號", "名稱", "現金股利", "配股（股）", "備註"]),
      ...dividends.map((d) => [d.date, d.symbol, names.get(d.symbol) || "", dec(d.cash), d.stockShares ? int(d.stockShares) : "", d.note]),
    ],
  };

  const yearlyRows = [];
  yearlySummary().forEach(([year, stocks]) => {
    let sum = 0;
    [...stocks.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([symbol, item]) => {
      sum += item.cash;
      yearlyRows.push([year, symbol, names.get(symbol) || "", int(item.count), int(item.cash), item.stockShares ? int(item.stockShares) : ""]);
    });
    yearlyRows.push([{ v: `${year} 合計`, s: S.head }, "", "", "", { v: Math.round(sum), s: S.int }, ""]);
  });
  const yearlySheet = {
    name: "年度股利",
    widths: [12, 10, 14, 10, 14, 12],
    rows: [head(["年度", "代號", "名稱", "發放次數", "現金股利", "配股（股）"]), ...yearlyRows],
  };

  const holdings = [...ledger.positions.entries()]
    .filter(([symbol, pos]) => pos.shares > 0 && matchesSymbol({ symbol }))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([symbol, pos]) => {
      const price = state.prices[symbol];
      const value = price ? pos.shares * price : null;
      const pl = value === null ? null : value - pos.cost;
      return [
        symbol, names.get(symbol) || "", int(pos.shares), dec(pos.cost / pos.shares), int(pos.cost),
        price ? dec(price) : "", value === null ? "" : int(value), pl === null ? "" : int(pl),
        pl === null || !pos.cost ? "" : { v: round2(pl / pos.cost * 10000) / 10000, s: S.pct },
      ];
    });
  const holdingSheet = {
    name: "目前持股",
    widths: [10, 14, 10, 12, 14, 10, 14, 14, 10],
    rows: [head(["代號", "名稱", "持股", "平均成本", "總成本", "現價", "市值", "未實現損益", "報酬率"]), ...holdings],
  };

  const transferSheet = {
    name: "資金進出",
    widths: [12, 16, 8, 14, 24],
    rows: [
      head(["日期", "銀行", "類型", "金額", "備註"]),
      ...transfers.map((t) => [t.date, t.bank, t.type === "in" ? "入金" : "出金", int(transferSigned(t)), t.note]),
    ],
  };

  const banks = bankSummary();
  const bankSheet = {
    name: "各銀行出資",
    widths: [16, 14, 14, 14, 8, 12],
    rows: [
      head(["銀行", "累計入金", "累計出金", "淨投入", "筆數", "最近一筆"]),
      ...banks.map(([bank, item]) => [bank, int(item.in), int(item.out), int(item.in - item.out), int(item.count), item.last]),
      ...(banks.length
        ? [[
          { v: "合計", s: S.head },
          int(banks.reduce((sum, [, item]) => sum + item.in, 0)),
          int(banks.reduce((sum, [, item]) => sum + item.out, 0)),
          int(banks.reduce((sum, [, item]) => sum + item.in - item.out, 0)),
        ]]
        : []),
    ],
  };

  return [summary, tradeSheet, dividendSheet, yearlySheet, holdingSheet, transferSheet, bankSheet];
}

const excelBtn = document.getElementById("excel-btn");
excelBtn.innerHTML = icon("sheet");
excelBtn.addEventListener("click", () => {
  const range = periodRange();
  const span = range.from || range.to ? `${range.from || "最早"}至${range.to || todayString()}` : "全部";
  download(buildXlsx(buildReport()), `${PAGE_TITLE}-${span}.xlsx`);
});

/* ---------- 深色模式 ---------- */

const themeToggle = document.getElementById("theme-toggle");
const themeLabel = document.getElementById("theme-label");
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
