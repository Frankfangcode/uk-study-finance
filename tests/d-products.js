#!/usr/bin/env node
/**
 * D 模組「金融工具比較」驗收：信用卡、外幣帳戶、保險類型。
 * 畫面測試用 tests/fake-dom.js 跑真的 index.html 與 app.js。
 */
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var P = require("../modules/d/products.js");
var Cards = require("../modules/d/cards.js");
var Fx = require("../modules/d/fx-accounts.js");
var Insurance = require("../modules/d/insurance.js");
var loadApp = require("./fake-dom.js").loadApp;

var passed = 0;
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log("PASS  " + name);
  } catch (err) {
    console.error("FAIL  " + name);
    console.error("      " + (err && err.stack ? err.stack : err));
    process.exitCode = 1;
  }
}

function has(html, text) { return html.indexOf(text) !== -1; }
function byId(list, id) { return list.filter(function (item) { return item.id === id; })[0]; }

/** 不靠 auditFigures，自己再走一遍，收集所有 figure。 */
function figures(node, out) {
  out = out || [];
  if (!node || typeof node !== "object") return out;
  if (node.kind === "figure") { out.push(node); return out; }
  Object.keys(node).forEach(function (key) { figures(node[key], out); });
  return out;
}

var TODAY = "2026-11-13";
var TUITION = { amountGbp: 30000, fxRate: 41, count: 1 }; // 1,230,000 TWD

check("資料：每個數字都有 sourceUrl 與 checkedAt，否則為 null 並標待確認", function () {
  var all = figures(P.allData());
  assert.ok(all.length >= 40, "figure 數量太少：" + all.length);
  all.forEach(function (fig) {
    assert.ok(Object.prototype.hasOwnProperty.call(fig, "sourceUrl") && Object.prototype.hasOwnProperty.call(fig, "checkedAt"));
    if (fig.value === null) {
      assert.strictEqual(fig.status, "待確認");
    } else {
      assert.strictEqual(typeof fig.value, "number");
      assert.ok(/^https:\/\//.test(fig.sourceUrl), "有數字但沒有來源：" + JSON.stringify(fig));
      assert.strictEqual(fig.checkedAt, TODAY);
      assert.strictEqual(fig.status, "已查明");
    }
  });
  var audit = P.auditFigures(P.allData());
  assert.strictEqual(audit.count, all.length);
  assert.deepStrictEqual(audit.problems, []);
});

check("資料：figure() 沒有來源就把數字退回 null；稽核抓得到被塞進來的無來源數字", function () {
  var noSource = Cards.figure(1.5, "pct", null, "憑記憶");
  assert.strictEqual(noSource.value, null);
  assert.strictEqual(noSource.status, "待確認");
  var bad = { x: { kind: "figure", value: 1.5, unit: "pct", status: "已查明", sourceUrl: null, checkedAt: TODAY } };
  assert.strictEqual(P.auditFigures(bad).problems.length, 1);
  var zeroPending = { x: { kind: "figure", value: 0, unit: "TWD", status: "待確認", sourceUrl: null, checkedAt: null } };
  assert.ok(P.auditFigures(zeroPending).problems.length >= 1, "待確認不能寫 0");
});

check("資料：三類各 3～5 筆，list() 回傳副本", function () {
  [Cards.list(), Fx.list()].forEach(function (list) {
    assert.ok(list.length >= 3 && list.length <= 5);
  });
  assert.strictEqual(Insurance.list().length, 3);
  var copy = Cards.list();
  copy[0].bankFeePct.value = 99;
  assert.notStrictEqual(Cards.list()[0].bankFeePct.value, 99);
});

check("信用卡：手續費＝發卡組織費＋銀行費（中信 1%＋0.5%）", function () {
  var ctbc = byId(Cards.list(), "ctbc-general");
  assert.strictEqual(ctbc.networkFeePct.value, 1);
  assert.strictEqual(ctbc.bankFeePct.value, 0.5);
  var est = P.estimateCard(ctbc, TUITION);
  assert.strictEqual(est.baseTwd, 1230000);
  assert.strictEqual(est.networkFeeTwd, 12300);
  assert.strictEqual(est.bankFeeTwd, 6150);
  assert.strictEqual(est.feeTwd, 18450);
  assert.strictEqual(est.feeTwd, est.networkFeeTwd + est.bankFeeTwd);
  assert.strictEqual(est.feePct, 1.5);
  assert.strictEqual(est.status, "估計");
  assert.ok(has(est.note, "估計，非報價") && has(est.note, "匯率點差未必公開"));
  // 每月生活費 £1,200 × 12 筆
  assert.strictEqual(P.estimateCard(ctbc, { amountGbp: 1200, fxRate: 41, count: 12 }).feeTwd, 8856);
});

check("信用卡：拆項缺一項時用官方合計；合計也沒有就是待確認，不是 0", function () {
  var esun = byId(Cards.list(), "esun-general");
  assert.strictEqual(esun.networkFeePct.value, null);
  var est = P.estimateCard(esun, TUITION);
  assert.strictEqual(est.feeTwd, 18450);
  assert.strictEqual(est.networkFeeTwd, null, "未知的發卡組織費不能顯示成 0");
  assert.deepStrictEqual(est.pending, ["發卡組織費"]);

  var unknown = Cards.list()[0];
  unknown.networkFeePct = Cards.figure(null, "pct", null, "");
  unknown.totalFeePct = Cards.figure(null, "pct", null, "");
  var none = P.estimateCard(unknown, TUITION);
  assert.strictEqual(none.feeTwd, null);
  assert.strictEqual(none.status, "待確認");
  assert.notStrictEqual(none.bankFeeTwd, null, "已知的銀行費照樣列出");
  // 不能只拿已知的 0.5% 充當整筆手續費
  assert.notStrictEqual(none.feeTwd, none.bankFeeTwd);
});

check("信用卡：回饋另列不抵手續費；星展學雜費與英國實體店不適用", function () {
  var dbs = byId(Cards.list(), "dbs-eco-select");
  assert.strictEqual(dbs.tuitionReward, "不適用");
  assert.strictEqual(dbs.ukInStoreReward, "不適用");
  assert.strictEqual(P.estimateCard(dbs, TUITION).feeTwd, 18450, "回饋不從手續費扣掉");
  Cards.list().forEach(function (card) {
    assert.ok(["適用", "不適用", "待確認"].indexOf(card.tuitionReward) >= 0);
    if (card.rewardPct.value === null) assert.strictEqual(card.tuitionReward, "待確認");
  });
});

check("外幣帳戶：臺銀 0.05%、最低 120、最高 800 的邊界", function () {
  var bot = byId(Fx.list(), "bot-online");
  assert.strictEqual(P.handlingFeeTwd(bot, 100000), 120, "50 元拉到最低 120");
  assert.strictEqual(P.handlingFeeTwd(bot, 239999), 120);
  assert.strictEqual(P.handlingFeeTwd(bot, 240000), 120, "剛好等於最低");
  assert.strictEqual(P.handlingFeeTwd(bot, 242000), 121, "超過最低後按比例");
  assert.strictEqual(P.handlingFeeTwd(bot, 1000000), 500);
  assert.strictEqual(P.handlingFeeTwd(bot, 1598000), 799);
  assert.strictEqual(P.handlingFeeTwd(bot, 1600000), 800, "剛好等於最高");
  assert.strictEqual(P.handlingFeeTwd(bot, 5000000), 800, "超過後封頂 800");
  assert.strictEqual(P.handlingFeeTwd(bot, 0), null);

  var est = P.estimateFxAccount(bot, TUITION);
  assert.strictEqual(est.handlingFeeTwd, 615);
  assert.strictEqual(est.cableFeeTwd, 300);
  assert.strictEqual(est.feeTwd, 915);
  assert.strictEqual(est.fxSpreadTwd, null);
  assert.strictEqual(est.spreadIncluded, false);
  assert.deepStrictEqual(est.pending, ["換匯點差"]);
  // 每月 £1,200 × 12：每筆 49,200 → 最低 120，加電報 300
  assert.strictEqual(P.estimateFxAccount(bot, { amountGbp: 1200, fxRate: 41, count: 12 }).feeTwd, (120 + 300) * 12);
});

check("外幣帳戶：定額與級距費率（星展、國泰世華、中信）", function () {
  var list = Fx.list();
  assert.strictEqual(P.estimateFxAccount(byId(list, "dbs-tw"), TUITION).feeTwd, 900);
  assert.strictEqual(P.estimateFxAccount(byId(list, "cathay-counter"), TUITION).feeTwd, 600);
  var ctbc = byId(list, "ctbc-tw");
  assert.strictEqual(P.handlingFeeTwd(ctbc, 1000000), 600);
  assert.strictEqual(P.handlingFeeTwd(ctbc, 1000001), 700);
  assert.strictEqual(P.handlingFeeTwd(ctbc, 2000000), 700);
  assert.strictEqual(P.handlingFeeTwd(ctbc, 3000000), 800);
  assert.strictEqual(P.handlingFeeTwd(ctbc, 3000001), 900);
});

check("外幣帳戶：null 費率不當 0 算進總費用，顯示待確認", function () {
  var list = Fx.list();
  // 中信：手續費已知、郵電費 null → 總費用 null，只給已知小計
  var ctbc = P.estimateFxAccount(byId(list, "ctbc-tw"), TUITION);
  assert.strictEqual(ctbc.handlingFeeTwd, 700);
  assert.strictEqual(ctbc.cableFeeTwd, null);
  assert.strictEqual(ctbc.feeTwd, null, "郵電費未知時不能把 700 當成總費用");
  assert.strictEqual(ctbc.knownSubtotalTwd, 700);
  assert.strictEqual(ctbc.status, "待確認");
  assert.ok(ctbc.pending.indexOf("郵電費／匯出費") >= 0);
  // Wise：全部 null
  var wise = P.estimateFxAccount(byId(list, "wise"), TUITION);
  assert.strictEqual(wise.feeTwd, null);
  assert.strictEqual(wise.knownSubtotalTwd, null);
  assert.strictEqual(wise.handlingFeeTwd, null);
  assert.strictEqual(wise.status, "待確認");
  // 各家換匯點差都還是 null
  list.forEach(function (account) {
    assert.strictEqual(account.fxSpreadPct.value, null);
    assert.strictEqual(P.estimateFxAccount(account, TUITION).fxSpreadTwd, null);
  });
});

check("試算：金額、匯率、筆數缺一就不算，不補預設值", function () {
  [{ fxRate: 41, count: 1 }, { amountGbp: 30000, count: 1 }, { amountGbp: 30000, fxRate: 41 }, { amountGbp: 0, fxRate: 41, count: 1 }, { amountGbp: -5, fxRate: 41, count: 1 }].forEach(function (input) {
    var card = P.estimateCard(Cards.list()[1], input);
    var fx = P.estimateFxAccount(Fx.list()[0], input);
    assert.strictEqual(card.feeTwd, null);
    assert.strictEqual(fx.feeTwd, null);
    assert.ok(card.error && fx.error);
  });
});

check("比較：同條件試算，不排名、沒有最划算", function () {
  var result = P.compare(TUITION);
  assert.strictEqual(result.ranking, null);
  assert.strictEqual(result.cheapest, null);
  assert.deepStrictEqual(result.cards.map(function (c) { return c.id; }), Cards.list().map(function (c) { return c.id; }));
  assert.deepStrictEqual(result.fxAccounts.map(function (a) { return a.id; }), Fx.list().map(function (a) { return a.id; }));
  assert.ok(has(result.disclaimer, "僅供比較，非金融建議"));
  result.cards.concat(result.fxAccounts).forEach(function (row) {
    assert.ok(!("rank" in row) && !("best" in row));
  });
});

check("保險：三條線分開，不加總成一個數", function () {
  var summary = Insurance.summary();
  assert.deepStrictEqual(summary.lines.map(function (l) { return l.id; }), ["ihs", "school", "commercial"]);
  assert.strictEqual(summary.total, null);
  Object.keys(summary).forEach(function (key) {
    assert.notStrictEqual(typeof summary[key], "number", key + " 不能是加總的數字");
  });
  assert.strictEqual(P.compare(TUITION).insurance.total, null);
  var ihs = summary.lines[0];
  var school = summary.lines[1];
  var commercial = summary.lines[2];
  assert.strictEqual(ihs.mandatory, "是");
  assert.strictEqual(ihs.amount.value, 776);
  assert.ok(/^https:\/\/www\.gov\.uk\//.test(ihs.amount.sourceUrl));
  assert.strictEqual(school.mandatory, "待確認");
  assert.strictEqual(school.amount.value, null, "校方保險待確認，不是 0");
  assert.strictEqual(commercial.mandatory, "否");
  assert.strictEqual(commercial.amount.value, null, "商業保險不列報價");
  summary.lines.forEach(function (line) {
    assert.ok(line.collectedBy && line.overlapNote && line.mayOverlapWith.length >= 1);
  });
});

function openD() {
  var app = loadApp();
  return {
    html: function () { return app.html("page-d"); },
    tab: function (id) {
      assert.ok(has(app.html("page-d"), 'data-d-tab="' + id + '"'), "畫面上沒有子分頁 " + id);
      app.dispatch("click", { "data-d-tab": id });
    },
    type: function (field, value) {
      assert.ok(has(app.html("page-d"), 'data-d-field="' + field + '"'), "畫面上沒有欄位 " + field);
      app.dispatch("change", { "data-d-field": field }, { value: String(value) });
    },
    app: app,
  };
}

check("畫面：D 頁有四個子分頁，預設仍是原本的匯款／支付", function () {
  var ui = openD();
  ["匯款／支付", "信用卡", "外幣帳戶", "保險類型"].forEach(function (label) {
    assert.ok(has(ui.html(), label), label);
  });
  assert.ok(has(ui.html(), "訂金和學費分開付"));
  assert.ok(has(ui.html(), "最低成本：沒有"));
});

check("畫面：信用卡分頁預設 £30,000，顯示試算、聲明與來源", function () {
  var ui = openD();
  ui.tab("cards");
  var html = ui.html();
  assert.ok(has(html, "僅供比較，非金融建議"));
  assert.ok(has(html, "估計，非報價；匯率點差未必公開"));
  assert.ok(has(html, "NT$1,230,000"));
  assert.ok(has(html, "NT$18,450"));
  assert.ok(has(html, "查閱 2026-11-13"));
  assert.ok(has(html, "https://service.ctbcbank.com/FAQ/Page01?kmid=4724"));
  assert.ok(!has(html, "最划算") || has(html, "不選最划算"));
  assert.ok(!has(html, "訂金和學費分開付"));
  ui.type("amountGbp", "10000");
  assert.ok(has(ui.html(), "NT$6,150"), "10,000 × 41 × 1.5%");
  ui.type("amountGbp", "");
  assert.ok(has(ui.html(), "請輸入大於 0 的金額"));
  assert.ok(!has(ui.html(), "NT$6,150"));
});

check("畫面：外幣帳戶分頁，未知費率顯示待確認，不出現 NT$0", function () {
  var ui = openD();
  ui.tab("fx");
  var html = ui.html();
  assert.ok(has(html, "NT$915"), "臺銀 615＋300");
  assert.ok(has(html, "已知小計 NT$700，不是總費用"), "中信只給已知小計");
  assert.ok(has(html, "待確認：手續費、郵電費／匯出費、換匯點差"), "Wise 全部待確認");
  assert.ok(!has(html, "NT$0"));
  assert.ok(has(html, "不含匯差"));
  ui.type("count", "12");
  ui.type("amountGbp", "1200");
  assert.ok(has(ui.html(), "NT$5,040"), "(120＋300)×12");
});

check("畫面：保險分頁列三條線，寫明不加總，也沒有合計金額", function () {
  var ui = openD();
  ui.tab("insurance");
  var html = ui.html();
  ["IHS 移民醫療附加費", "學校強制保險", "選用商業保險"].forEach(function (name) { assert.ok(has(html, name), name); });
  assert.ok(has(html, "不要把這三條線加成一個「保險費」"));
  assert.ok(has(html, "合計：不加總"));
  assert.ok(has(html, "£776／年"));
  assert.ok(has(html, "https://www.gov.uk/healthcare-immigration-application/how-much-pay"));
  assert.ok(has(html, "不推薦特定保單"));
  assert.ok(!/合計[:：]\s*(£|NT\$)/.test(html));
  ui.tab("pay");
  assert.ok(has(ui.html(), "訂金和學費分開付"));
});

check("畫面：引導流程第 3 步有連到 D 比較的提示；index.html 載入新資料檔", function () {
  var flow = fs.readFileSync(path.join(__dirname, "..", "modules/guided/flow.js"), "utf8");
  assert.ok(has(flow, 'data-page="d" data-d-tab="cards"'));
  var app = loadApp();
  app.dispatch("click", { "data-page": "d", "data-d-tab": "cards" });
  assert.ok(has(app.html("page-d"), "海外刷卡手續費試算"));
  var html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  var order = ["modules/d/cards.js", "modules/d/fx-accounts.js", "modules/d/insurance.js", "modules/d/products.js", "app.js"].map(function (src) {
    var at = html.indexOf('src="' + src + '"');
    assert.ok(at >= 0, src);
    return at;
  });
  for (var i = 1; i < order.length; i++) assert.ok(order[i] > order[i - 1], "載入順序");
});

if (process.exitCode) console.error("\nD products tests failed.");
else console.log("\nAll " + passed + " D products tests passed.");
