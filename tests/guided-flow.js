#!/usr/bin/env node
/**
 * 引導流程驗收。畫面測試用 tests/fake-dom.js 跑真的 index.html、flow.js 與 app.js，
 * 操作一律走 document 上的委派事件，跟使用者點按鈕、打字是同一條路。
 */
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var G = require("../modules/guided/flow.js");
var A = require("../modules/a/aggregate.js");
var B = require("../modules/b/programmes.js");
var C = require("../engine.js");
var E = require("../modules/e/review.js");
var Contract = require("../shared/contract.js");
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

var NOT_FINAL = "尚未確定";
var SELF = "學生自報，非本站查證";

function has(html, text) { return html.indexOf(text) !== -1; }

/** 包一層操作：按鈕必須真的畫在畫面上才點得到。 */
function open() {
  var app = loadApp();
  var ui = {
    html: function () { return app.html("g-root"); },
    type: function (field, value) {
      assert.ok(has(ui.html(), 'data-g-field="' + field + '"'), "畫面上沒有欄位 " + field);
      app.dispatch("input", { "data-g-field": field }, { value: String(value) });
    },
    click: function (action, extra) {
      assert.ok(has(ui.html(), 'data-g-action="' + action + '"'), "畫面上沒有按鈕 " + action);
      app.dispatch("click", Object.assign({ "data-g-action": action }, extra || {}));
    },
    next: function () { ui.click("next"); },
    prev: function () { ui.click("prev"); },
    pick: function (key, on) {
      assert.ok(has(ui.html(), 'data-g-programme="' + key + '"'), "畫面上沒有學程 " + key);
      app.dispatch("change", { "data-g-programme": key }, { checked: on !== false });
    },
    choose: function (key, choice) {
      assert.ok(has(ui.html(), 'data-g-choice="' + choice + '" data-g-key="' + key + '"'), "畫面上沒有選項 " + choice);
      app.dispatch("change", { "data-g-choice": choice, "data-g-key": key }, { checked: true });
    },
    fillPending: function (key, field, value) {
      assert.ok(has(ui.html(), 'data-g-pending-field="' + field + '" data-g-key="' + key + '"'), "畫面上沒有待確認欄位 " + field);
      app.dispatch("input", { "data-g-pending-field": field, "data-g-key": key }, { value: String(value) });
    },
    apply: function (key) { ui.click("apply-pending", { "data-g-key": key }); },
    step: function () {
      var m = /class="g-step current"[^>]*data-g-step="(\d)"/.exec(ui.html());
      return m ? Number(m[1]) : null;
    },
    app: app,
  };
  return ui;
}

function fillProfile(ui, more) {
  var values = Object.assign({ intakeYear: 2027, savings: 500000, family: 1000000, monthlyCap: 20000 }, more || {});
  Object.keys(values).forEach(function (field) { ui.type(field, values[field]); });
}

/** 填好第 1 步、選格拉斯哥，停在第 2 步。 */
function atStep2(more) {
  var ui = open();
  fillProfile(ui, more);
  ui.next();
  assert.strictEqual(ui.step(), 2);
  ui.pick("glasgow");
  return ui;
}

function profileState(more) {
  var state = G.createState();
  Object.assign(state.profile, { intakeYear: "2027", savings: "500000", family: "1000000", monthlyCap: "20000" }, more || {});
  state.selected = ["glasgow"];
  return state;
}

// 格拉斯哥、預設假設、校保「無此費用」時的手算：
// (34,815 + 1,164 + 558 + 1,500×12) × 41 + 55,000 = 2,291,017；×1.05 = 2,405,567.85
var GLASGOW_TOTAL = 2405567.85;
var GLASGOW_GAP = 905567.85; // 減 1,500,000
var GLASGOW_LOAN = 910000;

check("分頁：引導流程排第一個且預設開啟，原有五個分頁都還在", function () {
  var html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  var nav = html.slice(html.indexOf("<nav"), html.indexOf("</nav>"));
  var order = (nav.match(/data-page="(\w)"/g) || []).map(function (s) { return s.slice(11, 12); });
  assert.deepStrictEqual(order, ["g", "a", "b", "c", "d", "e"]);
  assert.ok(/data-page="g" aria-current="page"/.test(nav));
  assert.ok(/<section id="page-g">/.test(html), "引導流程頁預設不隱藏");
  ["a", "b", "c", "d", "e"].forEach(function (p) {
    assert.ok(new RegExp('<section id="page-' + p + '" class="hidden">').test(html), "page-" + p + " 預設隱藏");
  });
  assert.ok(!/https?:\/\/[^"]+\.(js|css)"/.test(html), "不載入外部腳本或樣式");
  var ui = open();
  assert.strictEqual(ui.step(), 1);
  assert.ok(has(ui.html(), "第 1 步"));
});

check("第 1 步驗證：空值、負數、0 或負的貸款期數都擋下，停在第 1 步", function () {
  var ui = open();
  ui.next();
  assert.strictEqual(ui.step(), 1, "必填沒填不能前進");
  assert.ok(has(ui.html(), "「自備款（台幣）」不能留空"));
  assert.ok(has(ui.html(), "空白不會被當成 0"));
  assert.ok(has(ui.html(), "「預計入學年（西元）」不能留空"));

  fillProfile(ui, { savings: -1 });
  ui.next();
  assert.strictEqual(ui.step(), 1);
  assert.ok(has(ui.html(), "「自備款（台幣）」不能是負數"));

  ui.type("savings", 500000);
  ui.type("termMonths", 0);
  ui.next();
  assert.strictEqual(ui.step(), 1);
  assert.ok(has(ui.html(), "攤還期數必須大於 0"));
  ui.type("termMonths", -12);
  ui.next();
  assert.strictEqual(ui.step(), 1);
  assert.ok(has(ui.html(), "攤還期數必須大於 0"));

  ui.type("termMonths", 108);
  ui.type("fxRate", 0);
  ui.next();
  assert.strictEqual(ui.step(), 1);
  assert.ok(has(ui.html(), "「匯率假設（1 英鎊換多少台幣）」必須大於 0"));

  ui.type("fxRate", 41);
  ui.type("reservePct", -5);
  ui.next();
  assert.strictEqual(ui.step(), 1);
  ui.type("reservePct", 5);
  ui.next();
  assert.strictEqual(ui.step(), 2);
});

check("第 2 步：列出 B 的每個學程，含學費、訂金與來源；沒選學程不能前進", function () {
  var ui = open();
  fillProfile(ui);
  ui.next();
  var html = ui.html();
  B.list().forEach(function (p) {
    assert.ok(has(html, p.school_name_zh));
    assert.ok(has(html, "£" + p.tuition.amount.toLocaleString("en-GB")));
    assert.ok(has(html, "£" + p.deposit.amount.toLocaleString("en-GB")));
    assert.ok(has(html, p.tuition.source.url.replace(/&/g, "&amp;")));
    assert.ok(has(html, p.deposit.source.url.replace(/&/g, "&amp;")));
  });
  ui.next();
  assert.strictEqual(ui.step(), 2);
  assert.ok(has(ui.html(), "請至少選一個學程"));
  ui.pick("glasgow");
  assert.ok(has(ui.html(), "待確認項目"));
  assert.ok(has(ui.html(), "格拉斯哥大學　校方強制保險"));
  assert.ok(!has(ui.html(), "愛丁堡大學　校方強制保險"), "沒選的學校不列待確認項目");
});

check("未處理待確認：第 3 步顯示尚未確定，不出現總成本數字，並說明缺什麼", function () {
  var ui = atStep2();
  ui.next();
  assert.strictEqual(ui.step(), 3);
  var html = ui.html();
  assert.ok(has(html, "<span>總成本</span><strong>" + NOT_FINAL + "</strong>"));
  assert.ok(has(html, "<span>資金缺口</span><strong>" + NOT_FINAL + "</strong>"));
  assert.ok(has(html, "<span>建議貸款</span><strong>" + NOT_FINAL + "</strong>"));
  assert.ok(has(html, "<span>每月還款</span><strong>" + NOT_FINAL + "</strong>"));
  assert.ok(has(html, "校方強制保險"));
  assert.ok(has(html, "怎麼補"));
  assert.ok(has(html, "已知小計（不是總成本）"));
  // 已知小計可以列（有標「不是總成本」），但不能出現在總成本欄，也不能據此算出貸款與月付。
  assert.ok(!/<span>總成本<\/span><strong>NT\$/.test(html), "pending 沒有被當成 0 算出總額");
  assert.ok(!has(html, "NT$910,000"), "沒有用已知小計推出建議貸款");
  assert.ok(!has(html, "在月付上限內") && !has(html, "超過月付上限"), "沒有月付可比");

  ui.next();
  assert.strictEqual(ui.step(), 4);
  html = ui.html();
  assert.ok(has(html, "E 審查：<b>退修</b>"));
  assert.ok(has(html, "還缺什麼"));
  assert.ok(has(html, "<span>總成本</span><strong>" + NOT_FINAL + "</strong>"));

  var model = G.evaluate(profileState(), "glasgow");
  assert.strictEqual(model.review.verdict, "退修");
  assert.strictEqual(model.summary.final_total_twd, null);
  assert.strictEqual(model.sim.confirmed, false);
  var ins = model.plan.lines.filter(function (l) { return l.id === "school-insurance"; })[0];
  assert.strictEqual(ins.inclusion, "pending");
  assert.strictEqual(ins.amount, null, "pending 的金額是 null，不是 0");
});

check("選 (a) 沒填來源：套用按鈕擋下並說明原因，仍是待確認", function () {
  var ui = atStep2();
  ui.choose("glasgow", "none");
  ui.apply("glasgow");
  var html = ui.html();
  assert.ok(has(html, "沒有填來源，不能改成「無此費用」"));
  assert.ok(has(html, "目前生效：待確認"));
  assert.ok(!has(html, "目前生效：無此費用"));

  // 只有空白也不算來源；太短看不出文件也擋。
  ui.fillPending("glasgow", "source", "   ");
  ui.apply("glasgow");
  assert.ok(has(ui.html(), "沒有填來源"));
  ui.fillPending("glasgow", "source", "有");
  ui.apply("glasgow");
  assert.ok(has(ui.html(), "來源太短"));
  assert.ok(has(ui.html(), "目前生效：待確認"));

  // 下一步按鈕也擋：不會帶著沒來源的 none 進第 3 步。
  ui.fillPending("glasgow", "source", "");
  ui.next();
  assert.strictEqual(ui.step(), 2);
  assert.ok(has(ui.html(), "有待確認項目的選擇被擋下"));

  // 改回 (c) 就能走，但數字仍是尚未確定。
  ui.choose("glasgow", "pending");
  ui.next();
  assert.strictEqual(ui.step(), 3);
  assert.ok(has(ui.html(), "<span>總成本</span><strong>" + NOT_FINAL + "</strong>"));
});

check("選 (b) 沒填來源或金額無效：一樣擋下", function () {
  var ui = atStep2();
  ui.choose("glasgow", "amount");
  ui.fillPending("glasgow", "amount", "300");
  ui.apply("glasgow");
  assert.ok(has(ui.html(), "沒有填來源，不能改成「另計」"));
  assert.ok(has(ui.html(), "目前生效：待確認"));

  ui.fillPending("glasgow", "source", "2026-11-20 校方 Admissions 回信");
  ui.fillPending("glasgow", "amount", "");
  ui.apply("glasgow");
  assert.ok(has(ui.html(), "空白不會被當成 0"));
  ui.fillPending("glasgow", "amount", "-5");
  ui.apply("glasgow");
  assert.ok(has(ui.html(), "金額不能是負數"));
  ui.fillPending("glasgow", "amount", "0");
  ui.apply("glasgow");
  assert.ok(has(ui.html(), "請改選 (a)"));
  assert.ok(has(ui.html(), "目前生效：待確認"));
});

check("選 (a) 有來源：E 放行、出現數字，結果與審查都標學生自報", function () {
  var ui = atStep2();
  ui.choose("glasgow", "none");
  ui.fillPending("glasgow", "source", "2026-11-20 校方 Admissions 回信：本學程沒有強制保險");
  ui.apply("glasgow");
  assert.ok(has(ui.html(), "目前生效：無此費用"));
  assert.ok(has(ui.html(), SELF));
  ui.next();
  assert.strictEqual(ui.step(), 3);
  var html = ui.html();
  assert.ok(has(html, "<span>總成本</span><strong>NT$2,405,568</strong>"));
  assert.ok(has(html, "<span>資金缺口</span><strong>NT$905,568</strong>"));
  assert.ok(has(html, "<span>建議貸款</span><strong>NT$910,000</strong>"));
  assert.ok(!has(html, "<strong>" + NOT_FINAL + "</strong>"));
  assert.ok(has(html, SELF));
  assert.ok(has(html, "2026-11-20 校方 Admissions 回信"));
  assert.ok(has(html, "英鎊兌台幣 +10%"));
  assert.ok(has(html, "英鎊兌台幣 −10%"));

  ui.next();
  html = ui.html();
  assert.ok(has(html, "E 審查：<b>PASS</b>"));
  assert.ok(has(html, "1 項來源是" + SELF));
  assert.ok(has(html, "尚未放行"), "E PASS 不等於正式 Demo 放行");

  // 同一份資料直接對模組：數字來自既有引擎，不是另一套算術。
  var state = profileState();
  state.pending.glasgow = { choice: "none", source: "2026-11-20 校方 Admissions 回信：本學程沒有強制保險", amount: "", applied: { flag: "pending" }, error: "" };
  assert.strictEqual(G.applyPending(state, "glasgow").ok, true);
  var model = G.evaluate(state, "glasgow");
  assert.strictEqual(model.review.verdict, "PASS");
  assert.deepStrictEqual(model.review.blockers, []);
  assert.deepStrictEqual(model.review.self_reported, ["school-insurance"]);
  assert.strictEqual(model.review.self_reported_note, SELF);
  assert.strictEqual(model.review.formal_demo, "尚未放行");
  assert.strictEqual(model.summary.final_total_twd, GLASGOW_TOTAL);
  assert.strictEqual(model.summary.confirmed_gap_twd, GLASGOW_GAP);
  assert.strictEqual(model.summary.loan_amount_twd, GLASGOW_LOAN);
  assert.strictEqual(model.summary.monthly_payment_twd, C.monthlyPayment(GLASGOW_LOAN, 0.03, 108));
  assert.strictEqual(model.sim.confirmed, true);
  var ins = model.plan.lines.filter(function (l) { return l.id === "school-insurance"; })[0];
  assert.strictEqual(ins.inclusion, "none");
  assert.strictEqual(ins.zeroEvidence, true);
  assert.strictEqual(ins.selfReported, true);
  assert.strictEqual(ins.source, "2026-11-20 校方 Admissions 回信：本學程沒有強制保險");
  assert.strictEqual(E.presentLine(ins).status, "學生自報");
  // 快照裡也留著學生自報的標記與零費證據。
  var fee = model.published.snapshot.items.filter(function (i) { return i.fee_id === "school-insurance"; })[0].fee;
  assert.strictEqual(fee.inclusion_flag, "無此費用");
  assert.strictEqual(fee.zero_evidence, true);
  assert.strictEqual(fee.source_ref.self_reported, true);
});

check("選 (b) 有金額與來源：金額加入總成本，並標學生自報", function () {
  var ui = atStep2();
  ui.choose("glasgow", "amount");
  ui.fillPending("glasgow", "amount", "300");
  ui.fillPending("glasgow", "source", "https://example.org/fees/insurance");
  ui.apply("glasgow");
  assert.ok(has(ui.html(), "目前生效：另計 £300"));
  ui.next();
  var html = ui.html();
  // 多 £300：300 × 41 × 1.05 = 12,915
  assert.ok(has(html, "<span>總成本</span><strong>NT$2,418,483</strong>"));
  assert.ok(has(html, SELF));
  assert.ok(has(html, 'href="https://example.org/fees/insurance"'));

  var state = profileState();
  state.pending.glasgow = { choice: "amount", source: "https://example.org/fees/insurance", amount: "300", applied: { flag: "pending" }, error: "" };
  G.applyPending(state, "glasgow");
  var model = G.evaluate(state, "glasgow");
  assert.strictEqual(model.review.verdict, "PASS");
  assert.strictEqual(model.summary.final_total_twd, GLASGOW_TOTAL + 12915);
  var ins = model.plan.lines.filter(function (l) { return l.id === "school-insurance"; })[0];
  assert.strictEqual(ins.inclusion, "extra");
  assert.strictEqual(ins.amount, 300);
  assert.strictEqual(ins.contributeTwd, 12300);
  assert.strictEqual(ins.selfReported, true);
  assert.deepStrictEqual(model.review.self_reported, ["school-insurance"]);
});

check("套用後把來源清掉再套用：退回待確認，不留下沒有來源的 none", function () {
  var state = profileState();
  var entry = { choice: "none", source: "校方 2026-11-20 回信", amount: "", applied: { flag: "pending" }, error: "" };
  state.pending.glasgow = entry;
  assert.strictEqual(G.applyPending(state, "glasgow").ok, true);
  assert.strictEqual(G.insuranceFor(state, "glasgow").flag, "none");
  entry.source = "";
  var result = G.applyPending(state, "glasgow");
  assert.strictEqual(result.ok, false);
  assert.strictEqual(G.insuranceFor(state, "glasgow").flag, "pending");
  assert.strictEqual(G.evaluate(state, "glasgow").summary.final_total_twd, null);
});

check("示範按鈕：有數字、有虛構標示、來源寫明示範，且可清除", function () {
  var ui = open();
  assert.ok(!has(ui.html(), "g-demo\""), "沒按之前不是示範模式");
  ui.click("demo");
  assert.strictEqual(ui.step(), 3);
  var html = ui.html();
  assert.ok(has(html, "<b>示範用虛構個案</b>"));
  assert.ok(has(html, "都是虛構的"));
  assert.ok(has(html, G.DEMO_SOURCE));
  assert.ok(has(html, SELF));
  assert.ok(!has(html, "<strong>" + NOT_FINAL + "</strong>"), "示範放行後每格都有數字");
  assert.ok(/<span>總成本<\/span><strong>NT\$[\d,]+<\/strong>/.test(html));
  assert.ok(has(html, "格拉斯哥大學"));
  assert.ok(has(html, "愛丁堡大學"));
  assert.ok(has(html, "已核定的獎學金落空"));
  assert.ok(has(html, "最壞情況"));

  // 每一步都看得到虛構標示。
  ui.next();
  assert.ok(has(ui.html(), "<b>示範用虛構個案</b>"));
  assert.ok(has(ui.html(), "E 審查：<b>PASS</b>"));
  ui.click("goto", { "data-g-step": "2" });
  assert.ok(has(ui.html(), "<b>示範用虛構個案</b>"));
  assert.ok(has(ui.html(), G.DEMO_SOURCE));
  ui.click("goto", { "data-g-step": "1" });
  assert.ok(has(ui.html(), "<b>示範用虛構個案</b>"));

  var demo = G.demoState();
  demo.selected.forEach(function (key) {
    var model = G.evaluate(demo, key);
    assert.strictEqual(model.review.verdict, "PASS");
    assert.ok(model.summary.final_total_twd > 0);
    var applied = demo.pending[key].applied;
    assert.ok(applied.source.indexOf(G.DEMO_SOURCE) === 0, "示範來源一律以「示範：虛構來源」開頭");
    assert.deepStrictEqual(model.review.self_reported, ["school-insurance"]);
  });

  ui.click("reset");
  assert.strictEqual(ui.step(), 1);
  assert.ok(!has(ui.html(), "<b>示範用虛構個案</b>"));
  assert.ok(!has(ui.html(), 'value="600000"'), "清除後不留示範資料");
});

check("示範資料不改變預設：一般流程的待確認仍然是待確認", function () {
  var state = G.createState();
  assert.strictEqual(state.demo, false);
  assert.deepStrictEqual(state.pending, {});
  assert.deepStrictEqual(state.selected, []);
  assert.strictEqual(G.insuranceFor(state, "glasgow").flag, "pending");
  assert.strictEqual(G.insuranceFor(state, "edinburgh").flag, "pending");
});

check("步驟前後切換：個人資料、選校、待確認的選擇與來源都不遺失", function () {
  var ui = atStep2({ savings: 432100, family: 765400, awardedTwd: 123400 });
  ui.pick("edinburgh");
  ui.choose("glasgow", "none");
  ui.fillPending("glasgow", "source", "2026-11-20 校方回信，無強制保險");
  ui.apply("glasgow");
  ui.choose("edinburgh", "amount");
  ui.fillPending("edinburgh", "amount", "250");
  ui.fillPending("edinburgh", "source", "還沒套用的草稿來源文字");
  ui.next();
  ui.next();
  assert.strictEqual(ui.step(), 4);
  ui.prev();
  ui.prev();
  ui.prev();
  assert.strictEqual(ui.step(), 1);
  var html = ui.html();
  assert.ok(has(html, 'data-g-field="savings" value="432100"'));
  assert.ok(has(html, 'data-g-field="family" value="765400"'));
  assert.ok(has(html, 'data-g-field="awardedTwd" value="123400"'));
  assert.ok(has(html, 'data-g-field="intakeYear" value="2027"'));
  assert.ok(has(html, 'data-g-field="monthlyCap" value="20000"'));

  ui.next();
  html = ui.html();
  assert.ok(has(html, 'data-g-programme="glasgow" checked'));
  assert.ok(has(html, 'data-g-programme="edinburgh" checked'));
  assert.ok(has(html, 'data-g-choice="none" data-g-key="glasgow" checked'));
  assert.ok(has(html, "2026-11-20 校方回信，無強制保險"));
  assert.ok(has(html, "目前生效：無此費用"));
  assert.ok(has(html, 'data-g-choice="amount" data-g-key="edinburgh" checked'));
  assert.ok(has(html, 'data-g-pending-field="amount" data-g-key="edinburgh" value="250"'));
  assert.ok(has(html, "還沒套用的草稿來源文字"));

  // 取消再勾回同一所學校，填過的也還在。
  ui.pick("glasgow", false);
  assert.ok(!has(ui.html(), "格拉斯哥大學　校方強制保險"));
  ui.pick("glasgow", true);
  assert.ok(has(ui.html(), "2026-11-20 校方回信，無強制保險"));
  assert.ok(has(ui.html(), "目前生效：無此費用"));
});

check("多校：一校放行、一校待確認時各自顯示，待確認的那校沒有數字", function () {
  var ui = atStep2();
  ui.pick("edinburgh");
  ui.choose("glasgow", "none");
  ui.fillPending("glasgow", "source", "2026-11-20 校方回信，無強制保險");
  ui.next();
  assert.strictEqual(ui.step(), 3, "下一步會自動套用有來源的選擇");
  var html = ui.html();
  assert.ok(has(html, "一起看"));
  assert.ok(has(html, "<span>總成本</span><strong>NT$2,405,568</strong>"));
  assert.ok(has(html, "<span>總成本</span><strong>" + NOT_FINAL + "</strong>"));
  var edinburgh = html.slice(html.lastIndexOf("<h3>愛丁堡大學"));
  assert.ok(has(edinburgh, "<span>總成本</span><strong>" + NOT_FINAL + "</strong>"));
  assert.ok(!/<span>總成本<\/span><strong>NT\$/.test(edinburgh));
});

check("已核定獎學金（台幣）計入資金，並出現落空與最壞情況；月付對照上限", function () {
  var state = profileState({ awardedTwd: "200000", monthlyCap: "5000" });
  state.pending.glasgow = { choice: "none", source: "校方 2026-11-20 回信", amount: "", applied: { flag: "pending" }, error: "" };
  G.applyPending(state, "glasgow");
  var model = G.evaluate(state, "glasgow");
  assert.strictEqual(model.plan.funds.scholarship, 200000);
  assert.strictEqual(model.summary.confirmed_gap_twd, GLASGOW_GAP - 200000);
  var ids = model.sim.scenarios.map(function (s) { return s.id; });
  assert.deepStrictEqual(ids, ["baseline", "fx-up", "fx-down", "scholarship-lost", "worst"]);
  var lost = model.sim.scenarios[3];
  assert.strictEqual(lost.confirmedGap, GLASGOW_GAP);
  state.step = 3;
  var html = G.renderHtml(state);
  assert.ok(has(html, "超過月付上限"));
  state.profile.monthlyCap = "50000";
  html = G.renderHtml(state);
  assert.ok(has(html, "在月付上限內"));
  assert.ok(!has(html, "超過月付上限"));
});

check("入學年與收錄年度不同：學費改標假設並提醒，不假裝是該年公告價", function () {
  var state = profileState({ intakeYear: "2028" });
  var model = G.evaluate(state, "glasgow");
  assert.strictEqual(model.yearMismatch, true);
  var tuition = model.plan.lines.filter(function (l) { return l.id === "tuition"; })[0];
  assert.strictEqual(tuition.assumption, true);
  state.step = 2;
  assert.ok(has(G.renderHtml(state), "會標成假設"));
});

check("學生填的來源會跳脫，不會變成 HTML 或可執行連結", function () {
  var state = profileState();
  state.pending.glasgow = { choice: "none", source: '<img src=x onerror="alert(1)"> javascript:alert(1)', amount: "", applied: { flag: "pending" }, error: "" };
  G.applyPending(state, "glasgow");
  [2, 3, 4].forEach(function (step) {
    state.step = step;
    var html = G.renderHtml(state);
    assert.ok(!has(html, "<img"), "第 " + step + " 步");
    assert.ok(!has(html, 'href="javascript'), "第 " + step + " 步");
    assert.ok(has(html, "&lt;img"));
  });
});

check("既有規則沒被放寬：沒有自報來源時，另計無來源仍退回待確認、無此費用無證據仍被擋", function () {
  // 契約：沒有 self_reported 說明的另計，仍然缺來源。
  var base = {
    fee_id: "x", item_version: 1, school_id: "s", program_id: "p", intake: "i", coverage_start: "a", coverage_end: "b",
    fee_type: "x", currency: "GBP", amount: 10, status: "已查明", inclusion_flag: "另計", included_in_fee_id: null,
  };
  assert.ok(Contract.validateFeeSnapshot(Object.assign({}, base, { source_ref: {} })));
  assert.ok(Contract.validateFeeSnapshot(Object.assign({}, base, { source_ref: { self_reported: true, label: "  " } })));
  assert.strictEqual(Contract.validateFeeSnapshot(Object.assign({}, base, { source_ref: { self_reported: true, label: "校方回信" } })), null);

  // E：標了自報卻沒有來源文字，照樣是 unsourced；無此費用沒有零費證據照樣擋。
  assert.ok(E.issuesFor({ id: "x", inclusion: "extra", amount: 10, selfReported: true, source: "" }).indexOf("unsourced") !== -1);
  assert.ok(E.issuesFor({ id: "x", inclusion: "none", amount: 0, selfReported: true, source: "校方回信" }).indexOf("zero-without-evidence") !== -1);
  assert.deepStrictEqual(E.issuesFor({ id: "x", inclusion: "extra", amount: 10, selfReported: true, source: "校方回信" }), []);

  // A：C 頁原本的路徑（不帶 source）行為不變，另計沒有來源仍是待確認、整案不放行。
  var programme = B.buildOutput("glasgow");
  var assumptions = { fxRate: 41, reserveRate: 0.05, livingMonthlyGbp: 1500, livingMonths: 12, otherGbp: 0, twdExpenses: 55000, savings: 500000, family: 1000000, loan: { annualRate: 0.03, termMonths: 108, graceMonths: 0 } };
  var old = A.buildStudentPlan({ programme: programme, insurance: { flag: "extra", amount: 300 }, assumptions: assumptions });
  var line = old.plan.lines.filter(function (l) { return l.id === "school-insurance"; })[0];
  assert.strictEqual(line.inclusion, "pending");
  assert.strictEqual(line.selfReported, false);
  assert.strictEqual(old.scenario.complete, false);
  var oldNone = A.buildStudentPlan({ programme: B.buildOutput("glasgow"), insurance: { flag: "none", amount: 0, zeroEvidence: true }, assumptions: assumptions });
  var review = E.review({ lines: oldNone.plan.lines, scenario: oldNone.scenario });
  assert.strictEqual(review.verdict, "退修", "沒有來源的零費仍不放行");
  assert.deepStrictEqual(review.self_reported, []);
});

if (process.exitCode) console.error("\nGuided flow tests failed.");
else console.log("\nAll " + passed + " guided flow tests passed.");
