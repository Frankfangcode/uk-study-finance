#!/usr/bin/env node
/**
 * C 模組單元測試：對照協作表已公布的虛構預期（C-atlas-t02、t03、m01、22a1、0956a、d31e）。
 */
var assert = require("assert");
var C = require("./engine.js");

var passed = 0;
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log("PASS  " + name);
  } catch (err) {
    console.error("FAIL  " + name);
    console.error("      " + err.message);
    process.exitCode = 1;
  }
}

function plan(overrides) {
  var fees = overrides.fees;
  var rest = Object.assign({
    fxRate: 1,
    reserveRate: 0,
    funds: { savings: 500000, family: 0, scholarship: 0 },
    loan: { annualRate: 0.03, termMonths: 108, graceMonths: 0 },
    incomeMonthly: 55000,
  }, overrides);
  rest.fees = fees;
  return C.calculatePlan(rest);
}

check("C-atlas-t02① 保險已含：總成本 1,000,000，不可再加 20,000", function () {
  var r = plan({
    fees: [
      { id: "tuition-01", version: 1, name: "基礎成本", amount: 1000000, currency: "TWD", inclusion: "extra", required: true },
      { id: "ins-01", version: 1, name: "保險", amount: 20000, currency: "TWD", inclusion: "included", required: true },
    ],
  });
  assert.strictEqual(r.complete, true);
  assert.strictEqual(r.finalTotal, 1000000);
  assert.strictEqual(r.confirmedGap, 500000);
});

check("C-atlas-t02②／0956a S1 保險另計：總成本 1,020,000、缺口 520,000", function () {
  var r = plan({
    fees: [
      { id: "tuition-01", version: 1, amount: 1000000, currency: "TWD", inclusion: "extra", required: true },
      { id: "ins-01", version: 1, amount: 20000, currency: "TWD", inclusion: "extra", required: true },
    ],
  });
  assert.strictEqual(r.finalTotal, 1020000);
  assert.strictEqual(r.confirmedGap, 520000);
});

check("C-atlas-t02③ 待確認／null：known 1,000,000，complete=false，總額與缺口為 null", function () {
  var r = plan({
    fees: [
      { id: "tuition-01", version: 1, amount: 1000000, currency: "TWD", inclusion: "extra", required: true },
      { id: "ins-01", version: 1, amount: null, currency: "TWD", inclusion: "pending", required: true },
    ],
  });
  assert.strictEqual(r.knownSubtotal, 1000000);
  assert.strictEqual(r.complete, false);
  assert.strictEqual(r.finalTotal, null);
  assert.strictEqual(r.confirmedGap, null);
  assert.strictEqual(r.loanAmount, null);
});

check("C-atlas-t02④／22a1③ 同內容重送不累加：仍是 1,020,000 不是 1,040,000", function () {
  var r = plan({
    fees: [
      { id: "tuition-01", version: 1, amount: 1000000, currency: "TWD", inclusion: "extra", required: true },
      { id: "ins-01", version: 1, amount: 20000, currency: "TWD", inclusion: "extra", required: true },
      { id: "ins-01", version: 1, amount: 20000, currency: "TWD", inclusion: "extra", required: true },
    ],
  });
  assert.strictEqual(r.finalTotal, 1020000);
});

check("C-22a1④ 新版本替換不累加：保險 25,000 → 1,025,000", function () {
  var r = plan({
    fees: [
      { id: "tuition-01", version: 1, amount: 1000000, currency: "TWD", inclusion: "extra", required: true },
      { id: "ins-01", version: 1, amount: 20000, currency: "TWD", inclusion: "extra", required: true },
      { id: "ins-01", version: 2, amount: 25000, currency: "TWD", inclusion: "extra", required: true },
    ],
  });
  assert.strictEqual(r.finalTotal, 1025000);
  assert.strictEqual(r.confirmedGap, 525000);
});

check("C-0956a S5 明示 null 撤回舊額：known 1,000,000，確定總額 null", function () {
  var r = plan({
    fees: [
      { id: "tuition-01", version: 1, amount: 1000000, currency: "TWD", inclusion: "extra", required: true },
      { id: "ins-01", version: 2, amount: 25000, currency: "TWD", inclusion: "extra", required: true },
      { id: "ins-01", version: 3, amount: null, currency: "TWD", inclusion: "pending", required: true },
    ],
  });
  assert.strictEqual(r.knownSubtotal, 1000000);
  assert.strictEqual(r.complete, false);
  assert.strictEqual(r.finalTotal, null);
});

check("C-22a1⑧ 無此費用但缺證據：不能填 0，總額未定", function () {
  var r = plan({
    fees: [
      { id: "tuition-01", version: 1, amount: 1000000, currency: "TWD", inclusion: "extra", required: true },
      { id: "ins-01", version: 1, amount: 0, currency: "TWD", inclusion: "none", required: true, zeroEvidence: false },
    ],
  });
  assert.strictEqual(r.complete, false);
  assert.strictEqual(r.finalTotal, null);
});

check("C-22a1⑦ 無此費用且有零費證據：總成本 1,000,000", function () {
  var r = plan({
    fees: [
      { id: "tuition-01", version: 1, amount: 1000000, currency: "TWD", inclusion: "extra", required: true },
      { id: "ins-01", version: 1, amount: 0, currency: "TWD", inclusion: "none", required: true, zeroEvidence: true },
    ],
  });
  assert.strictEqual(r.complete, true);
  assert.strictEqual(r.finalTotal, 1000000);
});

check("C-atlas-t03／22a1 訂金不重計：已付或未付，總學費都是 £34,815；只改 balance_due", function () {
  function dep(paid) {
    return C.calculatePlan({
      fxRate: 41,
      reserveRate: 0,
      fees: [
        { id: "tuition", version: 1, amount: 34815, currency: "GBP", inclusion: "extra", required: true },
        { id: "deposit", version: 1, amount: 2000, currency: "GBP", inclusion: "included", required: false },
      ],
      deposit: { amount: 2000, currency: "GBP", paid: paid, partOfFeeId: "tuition" },
      funds: { savings: 0, family: 0, scholarship: 0 },
    });
  }
  var unpaid = dep(false);
  var paid = dep(true);
  assert.strictEqual(unpaid.gbpKnown, 34815);
  assert.strictEqual(paid.gbpKnown, 34815);
  assert.strictEqual(unpaid.finalTotal, paid.finalTotal);
  assert.strictEqual(unpaid.deposit.balanceDue, 34815);
  assert.strictEqual(paid.deposit.balanceDue, 32815);
  var ifAdded = 34815 + 2000;
  assert.notStrictEqual(unpaid.gbpKnown, ifAdded);
});

check("C-atlas-m01 原稿 55,000 案：總成本 2,266,215；資金 1,505,000 時缺口 761,215、貸款 770,000", function () {
  var r = C.calculatePlan({
    fxRate: 41,
    reserveRate: 0.05,
    fees: [
      { id: "tuition", version: 1, amount: 32000, currency: "GBP", inclusion: "extra", required: true },
      { id: "living", version: 1, amount: 1500 * 12, currency: "GBP", inclusion: "extra", required: true, assumption: true },
      { id: "other", version: 1, amount: 1300, currency: "GBP", inclusion: "extra", required: true, assumption: true },
      { id: "twd", version: 1, amount: 55000, currency: "TWD", inclusion: "extra", required: true, assumption: true },
    ],
    funds: { savings: 1505000, family: 0, scholarship: 0 },
  });
  assert.strictEqual(r.gbpKnown, 51300);
  assert.strictEqual(r.knownSubtotalRaw, 2158300);
  assert.strictEqual(r.finalTotal, 2266215);
  assert.strictEqual(r.confirmedGap, 761215);
  assert.strictEqual(r.loanAmount, 770000);
});

check("C-atlas-m01 原稿 60,000 案：總成本 2,271,465，缺口 766,465，貸款仍 770,000", function () {
  var r = C.calculatePlan({
    fxRate: 41,
    reserveRate: 0.05,
    fees: [
      { id: "tuition", version: 1, amount: 32000, currency: "GBP", inclusion: "extra", required: true },
      { id: "living", version: 1, amount: 1500 * 12, currency: "GBP", inclusion: "extra", required: true, assumption: true },
      { id: "other", version: 1, amount: 1300, currency: "GBP", inclusion: "extra", required: true, assumption: true },
      { id: "twd", version: 1, amount: 60000, currency: "TWD", inclusion: "extra", required: true, assumption: true },
    ],
    funds: { savings: 1505000, family: 0, scholarship: 0 },
  });
  assert.strictEqual(r.finalTotal, 2271465);
  assert.strictEqual(r.confirmedGap, 766465);
  assert.strictEqual(r.loanAmount, 770000);
});

check("D-d31e／GOV.UK：12 個月課程 IHS＝£1,164；未知長度＝null", function () {
  var y = C.ihsAmountGbp(12);
  assert.strictEqual(y.amount, 1164);
  assert.strictEqual(y.visaMonthsMax, 17);
  assert.strictEqual(y.complete, true);
  var m13 = C.ihsAmountGbp(13);
  assert.strictEqual(m13.amount, 1164);
  assert.strictEqual(m13.visaMonthsMax, 18);
  var m14 = C.ihsAmountGbp(14);
  assert.strictEqual(m14.amount, 1552);
  var unk = C.ihsAmountGbp(null);
  assert.strictEqual(unk.amount, null);
  assert.strictEqual(unk.complete, false);
});

check("學生預設格拉斯哥路徑：校保待確認時確定總額必須是 null", function () {
  var built = C.buildStudentFees({
    tuitionGbp: 34815,
    depositGbp: 2000,
    courseLengthMonths: 12,
    livingMonthlyGbp: 1500,
    livingMonths: 12,
    otherGbp: 0,
    twdExpenses: 55000,
    schoolInsuranceFlag: "pending",
    tuitionSource: C.PRESETS.glasgow.tuitionSource,
    depositSource: C.PRESETS.glasgow.depositSource,
  });
  var r = C.calculatePlan({
    fees: built.fees,
    fxRate: 41,
    reserveRate: 0.05,
    funds: { savings: 500000, family: 1000000, scholarship: 0 },
    deposit: { amount: 2000, paid: false, partOfFeeId: "tuition" },
    loan: { annualRate: 0.03, termMonths: 108, graceMonths: 0 },
  });
  assert.strictEqual(r.complete, false);
  assert.strictEqual(r.finalTotal, null);
  assert.ok(r.reference && r.reference.total > 0);
  assert.strictEqual(r.deposit.balanceDue, 34815);
  var ihsLine = r.lines.find(function (l) { return l.id === "ihs"; });
  assert.strictEqual(ihsLine.amount, 1164);
});

if (process.exitCode) {
  console.error("Some tests failed.");
} else {
  console.log("\nAll " + passed + " tests passed.");
}
