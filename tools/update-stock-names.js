// 從證交所（上市）與櫃買中心（上櫃）的公開資料產生 stock-names.js
// 使用方式：在專案資料夾執行 `node tools/update-stock-names.js`（需要 Node.js 18 以上）
// 網頁無法直接向這兩個網站抓資料（沒有開放跨網域），所以先產生成檔案放進專案

const fs = require("fs");
const path = require("path");

const SOURCES = [
  { url: "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL", code: "Code", name: "Name" },
  { url: "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes", code: "SecuritiesCompanyCode", name: "CompanyName" },
];

// 只保留一般股票（4 碼）和 ETF（00 開頭），排除權證等
const KEEP = /^(\d{4}|00\d{2,4}[A-Z]?)$/;

async function main() {
  const names = {};
  for (const source of SOURCES) {
    const res = await fetch(source.url);
    if (!res.ok) throw new Error(`${source.url} 回應 ${res.status}`);
    const rows = await res.json();
    let count = 0;
    for (const row of rows) {
      const code = String(row[source.code] || "").trim();
      const name = String(row[source.name] || "").trim();
      if (KEEP.test(code) && name && !names[code]) {
        names[code] = name;
        count++;
      }
    }
    console.log(`${source.url}：${count} 檔`);
  }

  const sorted = Object.fromEntries(Object.entries(names).sort(([a], [b]) => (a < b ? -1 : 1)));
  const today = new Date().toISOString().slice(0, 10);
  const body =
    "// 台股代號與名稱（上市＋上櫃的股票與 ETF），由 tools/update-stock-names.js 產生，請勿手動修改\n" +
    `const STOCK_NAMES_UPDATED = "${today}";\n` +
    `const STOCK_NAMES = ${JSON.stringify(sorted, null, 0).replace(/","/g, '",\n"').replace(/^\{/, "{\n").replace(/\}$/, "\n}")};\n`;

  const out = path.join(__dirname, "..", "stock-names.js");
  fs.writeFileSync(out, body, "utf8");
  console.log(`已寫入 ${out}，共 ${Object.keys(sorted).length} 檔`);
}

main().catch((err) => {
  console.error("更新失敗：", err.message);
  process.exit(1);
});
