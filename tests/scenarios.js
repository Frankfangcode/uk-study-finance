#!/usr/bin/env node
/**
 * C 模組「情境模擬」驗收：匯率 ±、已核定獎學金落空、最壞情況。
 * 手算案例：學費 £10,000＋台幣支出 100,000，匯率 40、不留預備金，
 * 自備 300,000，已核定減免 £1,000（基準計入 40,000）。
 */
var assert = require("assert");
var C = require("../engine.js");
var A = require("../modules/a/aggregate.js");
var B = require("../modules/b/programmes.js");
var E = require("../modules/e/review.js");
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

var AWARD = { id: "synth-award", name: "虛構減免", amount: 1000, currency: "GBP" };

function input(more) {
  return Object.assign({
    fxRate: 40,
    reserveRate: 0,
    fees: [
      { id: "tuition", version: 1, amount: 10000, currency: "GBP", inclusion: "extra", required: true },
      { id: "twd-expenses", version: 1, amount: 100000, currency: "TWD", inclusion: "extra", required: true },
    ],
    funds: { savings: 300000, family: 0, scholarship: 40000 },
    loan: { annualRate: 0.03, termMonths: 108, graceMonths: 0 },
    incomeMonthly: 50000,
  }, more || {});
}

function simulate(more, opts) {
  var plan = C.calculatePlan(input(more));
  return C.simulateScenarios(plan, Object.assign({ awardedScholarships: [AWARD], reviewVerdict: "PASS" }, opts || {}));
}

function byId(sim, id) {
  return sim.scenarios.filter(function (item) { return item.id === id; })[0];
}

/** 用引擎本身重算一次，確認情境數字不是另一套算術。 */
function recompute(fxRate, scholarship) {
  return C.calculatePlan(input({ fxRate: fxRate, funds: { savings: 300000, family: 0, scholarship: scholarship } }));
}

function sameAsEngine(item, plan) {
  assert.strictEqual(item.finalTotal, plan.finalTotal);
  assert.strictEqual(item.confirmedGap, plan.confirmedGap);
  assert.strictEqual(item.loanAmount, plan.loanAmount);
  assert.strictEqual(item.monthlyPayment, plan.monthlyPayment);
  assert.strictEqual(item.burdenPercent, plan.burdenPercent);
  assert.strictEqual(item.available, plan.available);
}

check("基準情境：與目前方案完全相同，差額都是 0", function () {
  var plan = C.calculatePlan(input());
  var sim = C.simulateScenarios(plan, { awardedScholarships: [AWARD], reviewVerdict: "PASS" });
  assert.strictEqual(sim.ok, true);
  assert.strictEqual(sim.confirmed, true);
  assert.strictEqual(sim.fxShockPct, 10, "預設幅度 10%");
  assert.deepStrictEqual(sim.scenarios.map(function (item) { return item.id; }), ["baseline", "fx-up", "fx-down", "scholarship-lost", "worst"]);
  var base = byId(sim, "baseline");
  sameAsEngine(base, plan);
  assert.strictEqual(base.finalTotal, 500000);
  assert.strictEqual(base.confirmedGap, 160000);
  assert.strictEqual(base.loanAmount, 160000);
  Object.keys(base.delta).forEach(function (key) { assert.strictEqual(base.delta[key], 0, key); });
});

check("英鎊 +10%：總成本 540,000、缺口 196,000、貸款 200,000，月付跟著變", function () {
  var sim = simulate();
  var up = byId(sim, "fx-up");
  assert.strictEqual(up.fxRate, 44);
  assert.strictEqual(up.finalTotal, 540000);
  assert.strictEqual(up.available, 344000, "英鎊計價的減免也跟著換成 44,000");
  assert.strictEqual(up.confirmedGap, 196000);
  assert.strictEqual(up.loanAmount, 200000);
  assert.strictEqual(up.monthlyPayment, C.monthlyPayment(200000, 0.03, 108));
  sameAsEngine(up, recompute(44, 44000));
  assert.strictEqual(up.delta.finalTotal, 40000);
  assert.strictEqual(up.delta.confirmedGap, 36000);
  assert.strictEqual(up.delta.loanAmount, 40000);
  assert.strictEqual(up.delta.monthlyPayment, Math.round((C.monthlyPayment(200000, 0.03, 108) - C.monthlyPayment(160000, 0.03, 108)) * 100) / 100);
  assert.ok(up.delta.monthlyPayment > 0 && up.delta.burdenPercent > 0);
});

check("英鎊 −10%：總成本 460,000、缺口 124,000、貸款 130,000", function () {
  var down = byId(simulate(), "fx-down");
  assert.strictEqual(down.fxRate, 36);
  assert.strictEqual(down.finalTotal, 460000);
  assert.strictEqual(down.available, 336000);
  assert.strictEqual(down.confirmedGap, 124000);
  assert.strictEqual(down.loanAmount, 130000);
  sameAsEngine(down, recompute(36, 36000));
  assert.strictEqual(down.delta.finalTotal, -40000);
  assert.strictEqual(down.delta.confirmedGap, -36000);
  assert.strictEqual(down.delta.loanAmount, -30000);
  assert.ok(down.delta.monthlyPayment < 0);
});

check("已核定獎學金落空：總成本不變，缺口 200,000、貸款 200,000", function () {
  var lost = byId(simulate(), "scholarship-lost");
  assert.strictEqual(lost.fxRate, 40);
  assert.strictEqual(lost.scholarshipLost, true);
  assert.strictEqual(lost.finalTotal, 500000);
  assert.strictEqual(lost.available, 300000);
  assert.strictEqual(lost.confirmedGap, 200000);
  assert.strictEqual(lost.loanAmount, 200000);
  sameAsEngine(lost, recompute(40, 0));
  assert.strictEqual(lost.delta.finalTotal, 0);
  assert.strictEqual(lost.delta.available, -40000);
  assert.strictEqual(lost.delta.confirmedGap, 40000);
});

check("最壞情況（英鎊 +10% 且獎學金落空）：缺口 240,000、貸款 240,000，是所有情境裡最大的", function () {
  var sim = simulate();
  var worst = byId(sim, "worst");
  assert.strictEqual(worst.fxRate, 44);
  assert.strictEqual(worst.finalTotal, 540000);
  assert.strictEqual(worst.available, 300000);
  assert.strictEqual(worst.confirmedGap, 240000);
  assert.strictEqual(worst.loanAmount, 240000);
  sameAsEngine(worst, recompute(44, 0));
  assert.strictEqual(worst.delta.confirmedGap, 80000);
  sim.scenarios.forEach(function (item) {
    assert.ok(item.confirmedGap <= worst.confirmedGap, item.id);
    assert.ok(item.monthlyPayment <= worst.monthlyPayment, item.id);
  });
});

check("未核定的獎學金沒有落空情境，也沒有最壞情況；其他已入帳的錢不會被拿掉", function () {
  var sim = simulate({ funds: { savings: 300000, family: 0, scholarship: 40000 } }, { awardedScholarships: [] });
  assert.deepStrictEqual(sim.scenarios.map(function (item) { return item.id; }), ["baseline", "fx-up", "fx-down"]);
  assert.strictEqual(sim.hasAwardedScholarship, false);
  assert.ok(sim.scholarshipNote.indexOf("未核定") >= 0);
  // 沒列為已核定的 40,000 是已入帳的台幣，匯率變動時不跟著換算。
  assert.strictEqual(byId(sim, "fx-up").available, 340000);
  // 金額是 null 或 0 的獎項不算已核定。
  var blank = simulate({}, { awardedScholarships: [{ name: "沒金額", amount: null, currency: "GBP" }, { name: "零", amount: 0 }] });
  assert.strictEqual(blank.hasAwardedScholarship, false);
  assert.strictEqual(blank.scenarios.length, 3);
});

check("已核定與已入帳並存：落空只拿掉已核定那一筆", function () {
  var sim = simulate({ funds: { savings: 300000, family: 0, scholarship: 65000 } });
  assert.strictEqual(byId(sim, "baseline").available, 365000);
  assert.strictEqual(byId(sim, "scholarship-lost").available, 325000);
  assert.strictEqual(byId(sim, "fx-up").available, 369000);
  var mismatch = simulate({ funds: { savings: 300000, family: 0, scholarship: 10000 } });
  assert.strictEqual(mismatch.ok, false, "已核定額超過基準計入額時不硬算");
});

check("匯率變動幅度可調：20% 時 48／32；留空、0、負數、100 以上被擋", function () {
  var sim = simulate({}, { fxShockPct: 20 });
  assert.strictEqual(sim.fxShockPct, 20);
  assert.strictEqual(byId(sim, "fx-up").fxRate, 48);
  assert.strictEqual(byId(sim, "fx-up").finalTotal, 580000);
  assert.strictEqual(byId(sim, "fx-down").fxRate, 32);
  assert.strictEqual(byId(sim, "fx-down").finalTotal, 420000);
  assert.ok(byId(sim, "worst").label.indexOf("20%") >= 0);
  assert.strictEqual(byId(simulate({}, { fxShockPct: "7.5" }), "fx-up").fxRate, 43);
  [null, "", 0, -10, 100, 250, "abc"].forEach(function (bad) {
    var out = simulate({}, { fxShockPct: bad });
    assert.strictEqual(out.ok, false, String(bad));
    assert.strictEqual(out.scenarios, undefined);
  });
});

check("必要費用待確認：每個情境的確定值都是 null，只有已知小計的變化，標「尚未確定」", function () {
  var more = {
    fees: input().fees.concat([{ id: "school-insurance", version: 1, amount: null, currency: "GBP", inclusion: "pending", required: true }]),
  };
  var plan = C.calculatePlan(input(more));
  assert.strictEqual(plan.finalTotal, null);
  var sim = C.simulateScenarios(plan, { awardedScholarships: [AWARD], reviewVerdict: "PASS" });
  assert.strictEqual(sim.ok, true);
  assert.strictEqual(sim.confirmed, false);
  assert.strictEqual(sim.status, "尚未確定");
  assert.ok(sim.unconfirmedReason.indexOf("待確認") >= 0);
  assert.strictEqual(sim.scenarios.length, 5);
  sim.scenarios.forEach(function (item) {
    assert.strictEqual(item.status, "尚未確定");
    ["finalTotal", "confirmedGap", "loanAmount", "monthlyPayment", "burdenPercent"].forEach(function (key) {
      assert.strictEqual(item[key], null, item.id + "." + key);
      assert.strictEqual(item.delta[key], null, item.id + ".delta." + key);
    });
  });
  assert.strictEqual(byId(sim, "baseline").knownSubtotal, plan.knownSubtotal);
  assert.strictEqual(byId(sim, "fx-up").knownSubtotal, 540000);
  assert.strictEqual(byId(sim, "fx-up").delta.knownSubtotal, 40000);
  assert.strictEqual(byId(sim, "fx-down").delta.knownSubtotal, -40000);
  assert.strictEqual(byId(sim, "scholarship-lost").delta.knownSubtotal, 0);
  assert.strictEqual(byId(sim, "worst").delta.knownSubtotal, 40000);
  // 待確認的金額是 null，不是 0：若誤填 0 才會得到確定總額。
  assert.strictEqual(plan.lines.filter(function (line) { return line.id === "school-insurance"; })[0].amount, null);
});

check("E 審查不是 PASS（或沒給審查結果）：金額都齊也不輸出確定值", function () {
  var plan = C.calculatePlan(input());
  assert.strictEqual(plan.complete, true);
  ["退修", "轉真人", undefined].forEach(function (verdict) {
    var sim = C.simulateScenarios(plan, { awardedScholarships: [AWARD], reviewVerdict: verdict });
    assert.strictEqual(sim.confirmed, false, String(verdict));
    assert.ok(sim.unconfirmedReason.indexOf("E 審查") >= 0);
    sim.scenarios.forEach(function (item) {
      assert.strictEqual(item.finalTotal, null);
      assert.strictEqual(item.confirmedGap, null);
      assert.strictEqual(item.loanAmount, null);
      assert.strictEqual(item.monthlyPayment, null);
      assert.strictEqual(item.delta.confirmedGap, null);
    });
    assert.strictEqual(byId(sim, "worst").delta.knownSubtotal, 40000);
  });
});

check("基準方案算不出來時不模擬；模擬不改動原方案", function () {
  assert.strictEqual(C.simulateScenarios(C.calculatePlan(input({ fxRate: null }))).ok, false);
  assert.strictEqual(C.simulateScenarios(null).ok, false);
  var plan = C.calculatePlan(input());
  var before = JSON.stringify(plan);
  C.simulateScenarios(plan, { awardedScholarships: [AWARD], reviewVerdict: "PASS" });
  assert.strictEqual(JSON.stringify(plan), before);
});

check("預備金照樣套用；缺口為負時貸款與月付是 0", function () {
  var sim = simulate({ reserveRate: 0.05, funds: { savings: 600000, family: 0, scholarship: 40000 } });
  assert.strictEqual(byId(sim, "fx-up").finalTotal, 567000);
  assert.strictEqual(byId(sim, "baseline").confirmedGap, -115000);
  assert.strictEqual(byId(sim, "baseline").loanAmount, 0);
  assert.strictEqual(byId(sim, "baseline").monthlyPayment, 0);
  assert.strictEqual(byId(sim, "worst").confirmedGap, -33000);
  assert.strictEqual(byId(sim, "worst").loanAmount, 0);
});

function glasgowPlan(awarded, insurance) {
  return A.buildStudentPlan({
    programme: B.buildOutput("glasgow"),
    depositPaid: false,
    insurance: insurance || { flag: "pending", amount: null },
    awardedWaiverGbp: awarded ? 10000 : 0,
    assumptions: {
      fxRate: 41, reserveRate: 0.05, livingMonthlyGbp: 1500, livingMonths: 12, otherGbp: 0, twdExpenses: 55000,
      savings: 500000, family: 1000000, manualScholarshipTwd: null, incomeMonthly: 55000,
      loan: { annualRate: 0.03, termMonths: 108, graceMonths: 0 },
    },
  });
}

check("格拉斯哥真實路徑：校保待確認，減免 £10,000 已核定時五個情境都只有已知小計", function () {
  var pub = glasgowPlan(true);
  var review = E.review({ lines: pub.plan.lines, scenario: pub.scenario });
  var summary = A.summarize(pub, review);
  assert.strictEqual(summary.complete, false);
  var sim = C.simulateScenarios(pub.plan, {
    awardedScholarships: [{ name: "Global Leadership Scholarship", amount: 10000, currency: "GBP", countedTwd: pub.funding.waiverTwd }],
    reviewVerdict: summary.complete ? review.verdict : "未放行",
  });
  assert.strictEqual(sim.scenarios.length, 5);
  assert.strictEqual(sim.confirmed, false);
  var base = byId(sim, "baseline");
  assert.strictEqual(base.knownSubtotal, pub.scenario.known_subtotal_twd);
  assert.strictEqual(base.available, 1910000);
  assert.strictEqual(byId(sim, "fx-up").fxRate, 45.1);
  assert.strictEqual(byId(sim, "fx-up").available, 1951000);
  assert.strictEqual(byId(sim, "scholarship-lost").available, 1500000);
  // 已知小計裡只有外幣部分跟著匯率動：(小計 − 台幣支出 55,000×1.05) × 10%。
  var gbpPart = base.knownSubtotal - 55000 * 1.05;
  assert.strictEqual(byId(sim, "fx-up").delta.knownSubtotal, Math.round(gbpPart * 0.1 * 100) / 100);
  sim.scenarios.forEach(function (item) { assert.strictEqual(item.finalTotal, null); });
});

function scenarioCard(html) {
  var at = html.indexOf("<h3>情境模擬</h3>");
  assert.ok(at >= 0, "C 頁有情境模擬區塊");
  return html.slice(at, html.indexOf("</article>", at));
}

check("畫面 C 頁：預設有情境模擬表，標明是演練不是預測；待確認時缺口、貸款、月付都是「尚未確定」", function () {
  var app = loadApp();
  assert.strictEqual(app.value("fx-shock"), "10");
  var card = scenarioCard(app.html("c-results"));
  assert.ok(card.indexOf("這是演練，不是預測") >= 0);
  assert.ok(card.indexOf("英鎊兌台幣 +10%") >= 0);
  assert.ok(card.indexOf("英鎊兌台幣 −10%") >= 0);
  assert.ok(card.indexOf("已知小計（不是總成本）") >= 0);
  assert.ok(card.indexOf("總成本（台幣）") < 0);
  assert.ok(card.indexOf("匯率 45.1") >= 0 && card.indexOf("匯率 36.9") >= 0);
  // 沒勾核定：沒有落空與最壞情況。
  assert.ok(card.indexOf("落空</div>") < 0 && card.indexOf("已核定的獎學金落空") < 0);
  assert.ok(card.indexOf("最壞情況：") < 0);
  assert.ok(card.indexOf("沒有已核定的獎學金") >= 0);
  // 3 列 × 缺口、貸款、月付 3 格。
  assert.strictEqual(card.split('<td class="num">尚未確定</td>').length - 1, 9);
  assert.ok(card.indexOf("負擔比") < 0);
});

check("畫面 C 頁：勾選已核定後出現落空與最壞情況；改幅度會重算；留空或 0 不模擬", function () {
  var app = loadApp();
  app.set("awarded", true);
  var card = scenarioCard(app.html("c-results"));
  assert.ok(card.indexOf("已核定的獎學金落空") >= 0);
  assert.ok(card.indexOf("最壞情況：英鎊 +10% 且獎學金落空") >= 0);
  assert.ok(card.indexOf("NT$1,910,000") >= 0, "基準可用資金含減免 410,000");
  assert.ok(card.indexOf("−NT$410,000") >= 0, "落空時可用資金少 410,000");
  assert.strictEqual(card.split('<td class="num">尚未確定</td>').length - 1, 15);
  app.set("fx-shock", "20");
  card = scenarioCard(app.html("c-results"));
  assert.ok(card.indexOf("英鎊兌台幣 +20%") >= 0 && card.indexOf("匯率 49.2") >= 0);
  ["", "0", "-5", "100"].forEach(function (bad) {
    app.set("fx-shock", bad);
    card = scenarioCard(app.html("c-results"));
    assert.ok(card.indexOf("<table>") < 0, "幅度「" + bad + "」不出表");
    assert.ok(card.indexOf("banner bad") >= 0);
  });
  // 切到沒有收錄獎學金的愛丁堡：落空情境消失。
  app.set("fx-shock", "10");
  app.set("preset", "edinburgh");
  card = scenarioCard(app.html("c-results"));
  assert.ok(card.indexOf("已核定的獎學金落空") < 0);
});

check("畫面 C 頁：金額都填了但 E 沒放行時，情境表不露出任何確定值", function () {
  var app = loadApp();
  app.set("deposit-paid", "unpaid");
  app.set("awarded", true);
  app.set("ins-flag", "none");
  app.set("ins-evidence", true);
  app.set("ins-amt", "0");
  var pub = glasgowPlan(true, { flag: "none", amount: 0, zeroEvidence: true });
  assert.strictEqual(pub.scenario.complete, true, "前提：C 算得出完整總額");
  var review = E.review({ lines: pub.plan.lines, scenario: pub.scenario });
  assert.notStrictEqual(review.verdict, "PASS", "前提：E 沒有放行");
  var raw = C.simulateScenarios(pub.plan, {
    awardedScholarships: [{ amount: 10000, currency: "GBP", countedTwd: pub.funding.waiverTwd }],
    reviewVerdict: "PASS",
  });
  var html = app.html("c-results");
  var card = scenarioCard(html);
  assert.ok(card.indexOf("E 審查不是 PASS") >= 0);
  assert.strictEqual(card.split('<td class="num">尚未確定</td>').length - 1, 15);
  raw.scenarios.forEach(function (item) {
    [item.confirmedGap, item.loanAmount, item.monthlyPayment].forEach(function (n) {
      assert.ok(n > 0);
      assert.ok(html.indexOf("NT$" + Math.round(n).toLocaleString("zh-Hant")) < 0, item.id + " 不得顯示 " + n);
    });
  });
});

if (process.exitCode) console.error("\nScenario tests failed.");
else console.log("\nAll " + passed + " scenario tests passed.");
