#!/usr/bin/env node
/**
 * 第 6 節驗收數字，加上 B／D／E 與快照切換。
 * 合成 TWD 案例的金額是驗收包，不是校方報價。
 */
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var A = require("../modules/a/aggregate.js");
var B = require("../modules/b/programmes.js");
var C = require("../modules/c/engine.js");
var D = require("../modules/d/payments.js");
var E = require("../modules/e/review.js");

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

function fee(partial) {
  return Object.assign({
    school_id: "synthetic",
    program_id: "case",
    intake: "n/a",
    fee_type: partial.fee_id,
    name: partial.fee_id,
    currency: "TWD",
    inclusion_flag: "另計",
    included_in_fee_id: null,
    source_ref: {
      url: "https://docs.google.com/spreadsheets/d/13TbRNuRq4fHk82y9PqMkcMUGN8-EEzGuyPzcQe3W62Q/edit",
      label: "合成驗收",
      retrieved: "2026-11-11",
    },
    status: "已查明",
    assumption: true,
    required: true,
    zero_evidence: false,
    amount: 0,
    note: "合成驗收，不是報價",
  }, partial);
}

function submitAll(ledger, fees) {
  var versions = {};
  fees.forEach(function (item) {
    var res = A.submitFee(ledger, item);
    if (!res.ok) throw new Error(res.reason);
    versions[item.fee_id] = res.item_version;
  });
  return versions;
}

function publishVersions(ledger, versions, required) {
  var ids = Object.keys(versions);
  var res = A.publish(ledger, {
    plan_id: "case",
    required_fee_ids: required || ids,
    items: ids.map(function (id) { return { fee_id: id, item_version: versions[id] }; }),
  });
  if (!res.ok) throw new Error(res.reason);
  return res.snapshot;
}

function calcActive(ledger, extra) {
  var snap = A.activeSnapshot(ledger);
  return C.calculatePlan(Object.assign({
    fees: A.toEngineFees(snap.fees),
    fxRate: 1,
    reserveRate: 0,
    funds: { savings: 500000, family: 0, scholarship: 0 },
  }, extra || {}));
}

check("t02① 保險已含：確定總額 1,000,000，不會變成 1,020,000", function () {
  var ledger = A.createLedger();
  var versions = submitAll(ledger, [
    fee({ fee_id: "tuition-01", amount: 1000000, name: "基礎成本" }),
    fee({ fee_id: "ins-01", amount: 20000, name: "保險", inclusion_flag: "已含", included_in_fee_id: "tuition-01" }),
  ]);
  publishVersions(ledger, versions);
  var result = calcActive(ledger);
  assert.strictEqual(result.complete, true);
  assert.strictEqual(result.finalTotal, 1000000);
  assert.strictEqual(result.confirmedGap, 500000);
});

check("t02② 保險另計：1,020,000，缺口 520,000", function () {
  var ledger = A.createLedger();
  publishVersions(ledger, submitAll(ledger, [
    fee({ fee_id: "tuition-01", amount: 1000000 }),
    fee({ fee_id: "ins-01", amount: 20000 }),
  ]));
  var result = calcActive(ledger);
  assert.strictEqual(result.finalTotal, 1020000);
  assert.strictEqual(result.confirmedGap, 520000);
  assert.strictEqual(result.complete, true);
});

check("t02③ 待確認：已知 1,000,000，確定總額與缺口是 null", function () {
  var ledger = A.createLedger();
  publishVersions(ledger, submitAll(ledger, [
    fee({ fee_id: "tuition-01", amount: 1000000 }),
    fee({ fee_id: "ins-01", amount: null, inclusion_flag: "待確認", status: "待查" }),
  ]));
  var result = calcActive(ledger);
  assert.strictEqual(result.knownSubtotal, 1000000);
  assert.strictEqual(result.complete, false);
  assert.strictEqual(result.finalTotal, null);
  assert.strictEqual(result.confirmedGap, null);
  assert.strictEqual(result.loanAmount, null);
});

check("22a1③ 同內容重送仍是 1,020,000", function () {
  var ledger = A.createLedger();
  var first = fee({ fee_id: "ins-01", amount: 20000 });
  var versions = submitAll(ledger, [fee({ fee_id: "tuition-01", amount: 1000000 }), first, fee({ fee_id: "ins-01", amount: 20000 })]);
  assert.strictEqual(versions["ins-01"], 1);
  publishVersions(ledger, versions);
  assert.strictEqual(calcActive(ledger).finalTotal, 1020000);
});

check("0956a S2 新版未發布：仍用舊快照 1,020,000", function () {
  var ledger = A.createLedger();
  var versions = submitAll(ledger, [
    fee({ fee_id: "tuition-01", amount: 1000000 }),
    fee({ fee_id: "ins-01", amount: 20000 }),
  ]);
  publishVersions(ledger, versions);
  var bumped = A.submitFee(ledger, fee({ fee_id: "ins-01", amount: 25000 }));
  assert.strictEqual(bumped.item_version, 2);
  assert.strictEqual(calcActive(ledger).finalTotal, 1020000);
});

check("22a1④／S3 發布 v2 後才換成 1,025,000、缺口 525,000", function () {
  var ledger = A.createLedger();
  submitAll(ledger, [
    fee({ fee_id: "tuition-01", amount: 1000000 }),
    fee({ fee_id: "ins-01", amount: 20000 }),
  ]);
  publishVersions(ledger, { "tuition-01": 1, "ins-01": 1 });
  A.submitFee(ledger, fee({ fee_id: "ins-01", amount: 25000 }));
  publishVersions(ledger, { "tuition-01": 1, "ins-01": 2 });
  var result = calcActive(ledger);
  assert.strictEqual(result.finalTotal, 1025000);
  assert.strictEqual(result.confirmedGap, 525000);
  assert.strictEqual(A.activeSnapshot(ledger).fees.length, 2);
  assert.strictEqual(ledger.publications[0].result_digest, null);
  var oldInsurance = ledger.publications[0].fees.filter(function (item) { return item.fee_id === "ins-01"; })[0];
  assert.strictEqual(oldInsurance.amount, 20000);
});

check("0956a S4 完全缺 amount 欄：拒收，舊值還在", function () {
  var ledger = A.createLedger();
  publishVersions(ledger, submitAll(ledger, [
    fee({ fee_id: "tuition-01", amount: 1000000 }),
    fee({ fee_id: "ins-01", amount: 25000 }),
  ]));
  var broken = fee({ fee_id: "ins-01", amount: 1 });
  delete broken.amount;
  var rejected = A.submitFee(ledger, broken);
  assert.strictEqual(rejected.ok, false);
  assert.strictEqual(calcActive(ledger).finalTotal, 1025000);
  assert.strictEqual(ledger.fees["ins-01"].versions.length, 1);
});

check("0956a S5 明示 null：已知 1,000,000，確定總額 null", function () {
  var ledger = A.createLedger();
  submitAll(ledger, [
    fee({ fee_id: "tuition-01", amount: 1000000 }),
    fee({ fee_id: "ins-01", amount: 25000 }),
  ]);
  A.submitFee(ledger, fee({ fee_id: "ins-01", amount: null, inclusion_flag: "待確認", status: "待查" }));
  publishVersions(ledger, { "tuition-01": 1, "ins-01": 2 });
  var result = calcActive(ledger);
  assert.strictEqual(result.knownSubtotal, 1000000);
  assert.strictEqual(result.complete, false);
  assert.strictEqual(result.finalTotal, null);
  assert.strictEqual(result.confirmedGap, null);
});

check("22a1⑦ 無此費用且有零費證據：1,000,000", function () {
  var ledger = A.createLedger();
  publishVersions(ledger, submitAll(ledger, [
    fee({ fee_id: "tuition-01", amount: 1000000 }),
    fee({
      fee_id: "ins-01",
      amount: 0,
      inclusion_flag: "無此費用",
      zero_evidence: true,
      source_ref: { url: "https://example.com/zero", label: "零費證據", retrieved: "2026-11-11" },
    }),
  ]));
  var result = calcActive(ledger);
  assert.strictEqual(result.complete, true);
  assert.strictEqual(result.finalTotal, 1000000);
});

check("22a1⑧ 無此費用但沒有證據：A 拒收，不能進快照", function () {
  var rejected = A.submitFee(A.createLedger(), fee({
    fee_id: "ins-01",
    amount: 0,
    inclusion_flag: "無此費用",
    zero_evidence: false,
  }));
  assert.strictEqual(rejected.ok, false);
});

check("同版不同內容：不輸出確定總額", function () {
  var result = C.calculatePlan({
    fxRate: 1,
    reserveRate: 0,
    funds: { savings: 500000, family: 0, scholarship: 0 },
    fees: [
      { id: "tuition-01", version: 1, amount: 1000000, currency: "TWD", inclusion: "extra" },
      { id: "ins-01", version: 1, amount: 20000, currency: "TWD", inclusion: "extra" },
      { id: "ins-01", version: 1, amount: 25000, currency: "TWD", inclusion: "extra" },
    ],
  });
  assert.strictEqual(result.complete, false);
  assert.strictEqual(result.finalTotal, null);
});

check("未填資金不當 0：總額可以有，缺口與貸款是 null", function () {
  var result = C.calculatePlan({
    fxRate: 1,
    reserveRate: 0,
    funds: { savings: null, family: 0, scholarship: 0 },
    fees: [{ id: "tuition-01", version: 1, amount: 1000000, currency: "TWD", inclusion: "extra" }],
  });
  assert.strictEqual(result.complete, true);
  assert.strictEqual(result.finalTotal, 1000000);
  assert.strictEqual(result.confirmedGap, null);
  assert.strictEqual(result.loanAmount, null);
  assert.strictEqual(result.available, null);
});

check("訂金付款狀態未知：balance_due 是 null，總學費不變", function () {
  var result = C.calculatePlan({
    fxRate: 41,
    reserveRate: 0,
    funds: { savings: 0, family: 0, scholarship: 0 },
    fees: [
      { id: "tuition", version: 1, amount: 34815, currency: "GBP", inclusion: "extra" },
      { id: "deposit", version: 1, amount: 2000, currency: "GBP", inclusion: "included" },
    ],
    deposit: { amount: 2000, currency: "GBP", paid: null, partOfFeeId: "tuition" },
  });
  assert.strictEqual(result.gbpKnown, 34815);
  assert.strictEqual(result.deposit.paid, null);
  assert.strictEqual(result.deposit.balanceDue, null);
});

check("m01 55,000：總成本 2,266,215，缺口 761,215，貸款 770,000", function () {
  var ledger = A.createLedger();
  publishVersions(ledger, submitAll(ledger, [
    fee({ fee_id: "tuition", amount: 32000, currency: "GBP" }),
    fee({ fee_id: "living", amount: 1500 * 12, currency: "GBP" }),
    fee({ fee_id: "other", amount: 1300, currency: "GBP" }),
    fee({ fee_id: "twd", amount: 55000, currency: "TWD" }),
  ]));
  var result = calcActive(ledger, { fxRate: 41, reserveRate: 0.05, funds: { savings: 1505000, family: 0, scholarship: 0 } });
  assert.strictEqual(result.finalTotal, 2266215);
  assert.strictEqual(result.confirmedGap, 761215);
  assert.strictEqual(result.loanAmount, 770000);
});

check("m01 60,000：總成本 2,271,465，缺口 766,465，貸款 770,000", function () {
  var ledger = A.createLedger();
  publishVersions(ledger, submitAll(ledger, [
    fee({ fee_id: "tuition", amount: 32000, currency: "GBP" }),
    fee({ fee_id: "living", amount: 18000, currency: "GBP" }),
    fee({ fee_id: "other", amount: 1300, currency: "GBP" }),
    fee({ fee_id: "twd", amount: 60000, currency: "TWD" }),
  ]));
  var result = calcActive(ledger, { fxRate: 41, reserveRate: 0.05, funds: { savings: 1505000, family: 0, scholarship: 0 } });
  assert.strictEqual(result.finalTotal, 2271465);
  assert.strictEqual(result.confirmedGap, 766465);
  assert.strictEqual(result.loanAmount, 770000);
});

function student(partial, ledger) {
  return A.buildStudentPlan(Object.assign({
    programmeId: "uog-dsai-2027",
    fxRate: 41,
    reserveRate: 0,
    livingMonthlyGbp: 0,
    livingMonths: 12,
    twdExpenses: 0,
    savings: 0,
    family: 0,
    confirmedScholarshipTwd: 0,
    depositPaid: false,
    loan: { annualRate: 0.03, termMonths: 108, graceMonths: 0 },
    incomeMonthly: 55000,
    awardedScholarshipIds: [],
    courseLengthMonths: undefined,
  }, partial), ledger);
}

function findLine(plan, slug) {
  return plan.calc.lines.filter(function (line) { return line.id.slice(-slug.length - 1) === ":" + slug; })[0];
}

check("B 格拉斯哥與愛丁堡學費、訂金，切換後 C 跟著變", function () {
  var glasgow = B.getProgramme("uog-dsai-2027");
  var edinburgh = B.getProgramme("uoe-ds-2027");
  assert.strictEqual(glasgow.tuition.amount, 34815);
  assert.strictEqual(glasgow.deposit.amount, 2000);
  assert.strictEqual(edinburgh.tuition.amount, 47680);
  assert.strictEqual(edinburgh.deposit.amount, 1500);
  assert.ok(glasgow.tuition.source.url.indexOf("https://www.gla.ac.uk/") === 0);
  assert.ok(edinburgh.tuition.source.url.indexOf("https://study.ed.ac.uk/") === 0);
  var unpaid = student({ depositPaid: false });
  var paid = student({ depositPaid: true });
  assert.strictEqual(findLine(unpaid, "tuition").amount, 34815);
  assert.strictEqual(unpaid.calc.gbpKnown, paid.calc.gbpKnown);
  assert.strictEqual(unpaid.calc.deposit.balanceDue, 34815);
  assert.strictEqual(paid.calc.deposit.balanceDue, 32815);
  assert.strictEqual(findLine(unpaid, "deposit").contributeTwd, 0);
  var ed = student({ programmeId: "uoe-ds-2027", depositPaid: true });
  assert.strictEqual(findLine(ed, "tuition").amount, 47680);
  assert.strictEqual(ed.calc.deposit.balanceDue, 46180);
  assert.strictEqual(findLine(unpaid, "school-insurance").amount, null);
  assert.strictEqual(unpaid.calc.finalTotal, null);
  assert.strictEqual(unpaid.review.status, "退修");
  assert.strictEqual(unpaid.review.student_claim.may_show_final_total, false);
});

check("獎學金未核定不減學費；核定後只反映一次，資金不再扣", function () {
  var plain = B.resolveFunding(B.getProgramme("uog-dsai-2027"), []);
  assert.strictEqual(plain.net_tuition_gbp, 34815);
  assert.strictEqual(plain.cash_twd, 0);
  var awarded = B.resolveFunding(B.getProgramme("uog-dsai-2027"), ["uog-gls-2027"]);
  assert.strictEqual(awarded.net_tuition_gbp, 24815);
  assert.strictEqual(awarded.cash_twd, 0);
  var off = student({});
  var on = student({ awardedScholarshipIds: ["uog-gls-2027"] });
  assert.strictEqual(findLine(on, "tuition").amount, 24815);
  assert.strictEqual(on.calc.funds.scholarship, 0);
  assert.strictEqual(on.calc.gbpKnown, off.calc.gbpKnown - 10000);
  assert.strictEqual(findLine(on, "school-discount").contributeTwd, 0);
  var picked = B.selectSchoolDiscount([
    { funding_type: "school_discount", amount_gbp: 10000 },
    { funding_type: "school_discount", amount_gbp: 5000 },
  ]);
  assert.strictEqual(picked.applied.amount_gbp, 10000);
  assert.strictEqual(picked.dropped.length, 1);
});

check("換學程不會改寫已經發布的快照", function () {
  var ledger = A.createLedger();
  var first = student({ twdExpenses: 55000 }, ledger);
  var second = student({ programmeId: "uoe-ds-2027", twdExpenses: 60000 }, ledger);
  assert.notStrictEqual(first.publication.snapshot_id, second.publication.snapshot_id);
  var oldTuition = first.publication.fees.filter(function (item) { return item.fee_id.indexOf(":tuition") > 0; })[0];
  assert.strictEqual(oldTuition.amount, 34815);
  assert.strictEqual(first.publication.result_digest.programme_id, "uog-dsai-2027");
  var third = student({ programmeId: "uoe-ds-2027", twdExpenses: 60000 }, ledger);
  assert.strictEqual(third.publication.snapshot_id, second.publication.snapshot_id);
});

check("D 格拉斯哥排除直接匯校；訂金與學費分開；沒有報價就不排名", function () {
  var pay = D.compare({
    school_id: "uog",
    balance_due: 32815,
    deposit_amount: 2000,
    deposit_paid: true,
    has_uk_account: false,
  });
  assert.strictEqual(pay.compared_amount.balance_due, 32815);
  assert.strictEqual(pay.compared_amount.used_full_tuition, false);
  assert.strictEqual(pay.rankable, false);
  assert.strictEqual(pay.cheapest_channel_id, null);
  assert.ok(pay.summary.indexOf("待查") >= 0);
  var tuitionDirect = pay.channels.tuition.filter(function (item) { return item.channel_id === "direct_bank"; })[0];
  assert.strictEqual(tuitionDirect.school_acceptance, "不接受");
  var depositCard = pay.channels.deposit.filter(function (item) { return item.channel_id === "applicant_self_service_card"; })[0];
  assert.strictEqual(depositCard.school_acceptance, "核准");
  var depositConvera = pay.channels.deposit.filter(function (item) { return item.channel_id === "convera"; })[0];
  assert.strictEqual(depositConvera.school_acceptance, "待確認");
  var tuitionConvera = pay.channels.tuition.filter(function (item) { return item.channel_id === "convera"; })[0];
  assert.strictEqual(tuitionConvera.school_acceptance, "核准");
  pay.channels.tuition.concat(pay.channels.deposit).forEach(function (item) {
    assert.strictEqual(item.fees.fixed_fee, null);
    assert.strictEqual(item.fees.pct_fee, null);
    assert.strictEqual(item.fees.min_fee, null);
    assert.strictEqual(item.fees.max_fee, null);
    assert.strictEqual(item.fees.fx_spread, null);
    assert.ok(item.source.url.indexOf("https://") === 0);
  });
  var debit = pay.channels.tuition.filter(function (item) { return item.channel_id === "direct_debit"; })[0];
  assert.strictEqual(debit.school_acceptance, "待確認");
  var withAccount = D.compare({ school_id: "uog", balance_due: 32815, deposit_amount: 2000, deposit_paid: true, has_uk_account: true });
  var debitOn = withAccount.channels.tuition.filter(function (item) { return item.channel_id === "direct_debit"; })[0];
  assert.strictEqual(debitOn.school_acceptance, "核准");
  assert.strictEqual(debitOn.fees.pct_fee, null);
  assert.strictEqual(withAccount.rankable, false);
  var unknown = D.compare({ school_id: "uog", balance_due: null, deposit_amount: 2000, deposit_paid: null });
  assert.strictEqual(unknown.compared_amount.balance_due, null);
  assert.strictEqual(unknown.compared_amount.deposit_due, null);
  assert.strictEqual(unknown.rankable, false);
  var edinburgh = D.compare({ school_id: "uoe", balance_due: 47680, deposit_amount: 1500, deposit_paid: false });
  var edinburghDirect = edinburgh.channels.tuition.filter(function (item) { return item.channel_id === "direct_bank"; })[0];
  assert.strictEqual(edinburghDirect.school_acceptance, "不接受");
  assert.strictEqual(edinburgh.channels.deposit[0].fee_purpose, "deposit");
  assert.notStrictEqual(edinburgh.channels.deposit[0].channel_id, edinburgh.channels.tuition[1].channel_id);
  pay.reference_tariffs.forEach(function (tariff) {
    assert.strictEqual(tariff.applies_to_school_payment, false);
    assert.strictEqual(tariff.ranked, false);
  });
});

check("E 常數都有 URL；待確認沒有金額；未知與缺來源進不了學生畫面", function () {
  E.CONSTANTS.forEach(function (constant) {
    if (constant.status === "待確認") assert.strictEqual(constant.value, null, constant.id);
    else assert.ok(constant.url.indexOf("https://") === 0, constant.id);
  });
  assert.ok(E.CONSTANTS.some(function (constant) { return constant.id === "rejected-ihs" && constant.status === "不採用" && constant.value === 1114; }));
  assert.ok(!E.CONSTANTS.some(function (constant) { return constant.status === "採用" && (constant.value === 1114 || constant.value === 524); }));
  var hidden = E.screenLines([
    { id: "x", name: "無來源", amount: 9, inclusion: "extra", assumption: false, sourceUrl: "" },
    { id: "y", name: "待確認被填 0", amount: 0, inclusion: "pending", assumption: false, sourceUrl: "https://example.com" },
  ]);
  assert.strictEqual(hidden[0].amount, null);
  assert.strictEqual(hidden[1].amount, null);
  assert.strictEqual(hidden[0].blocked, true);
  var pending = E.review({
    scenario: { complete: false, final_total_twd: null, confirmed_gap_twd: null, loan_amount_twd: null, known_subtotal_twd: 1000, funds_complete: true },
    lines: [{ id: "ins", name: "校保", inclusion: "pending", amount: null, assumption: false, sourceUrl: "https://www.gla.ac.uk/myglasgow/policy/studentcontract/termsandconditions/" }],
    payments: D.compare({ school_id: "uog", balance_due: 1000, deposit_amount: 2000, deposit_paid: false }),
  });
  assert.strictEqual(pending.status, "退修");
  assert.strictEqual(pending.student_claim.may_show_final_total, false);
  assert.strictEqual(pending.student_claim.final_total_twd, null);
  var clean = E.review({
    release_signed: false,
    scenario: {
      complete: true,
      final_total_twd: 1000,
      confirmed_gap_twd: 0,
      loan_amount_twd: 0,
      known_subtotal_twd: 1000,
      funds_complete: true,
    },
    lines: [{ id: "a", name: "假設支出", inclusion: "extra", amount: 1000, assumption: true, sourceUrl: E.MANUSCRIPT_URL }],
    payments: D.compare({ school_id: "uog", balance_due: 1000, deposit_amount: 2000, deposit_paid: false }),
  });
  assert.strictEqual(clean.status, "轉真人");
  assert.strictEqual(clean.student_claim.may_show_final_total, true);
  var signed = E.review(Object.assign({}, {
    release_signed: true,
    scenario: clean.student_claim && {
      complete: true,
      final_total_twd: 1000,
      confirmed_gap_twd: 0,
      loan_amount_twd: 0,
      known_subtotal_twd: 1000,
      funds_complete: true,
    },
    lines: [{ id: "a", name: "假設支出", inclusion: "extra", amount: 1000, assumption: true, sourceUrl: E.MANUSCRIPT_URL }],
    payments: D.compare({ school_id: "uog", balance_due: 1000, deposit_amount: 2000, deposit_paid: false }),
  }));
  assert.strictEqual(signed.status, "PASS");
});

check("已含關係循環不能發布", function () {
  var ledger = A.createLedger();
  submitAll(ledger, [
    fee({ fee_id: "a", amount: 1, inclusion_flag: "已含", included_in_fee_id: "b" }),
    fee({ fee_id: "b", amount: 1, inclusion_flag: "已含", included_in_fee_id: "a" }),
  ]);
  var res = A.publish(ledger, {
    required_fee_ids: ["a", "b"],
    items: [{ fee_id: "a", item_version: 1 }, { fee_id: "b", item_version: 1 }],
  });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(A.activeSnapshot(ledger), null);
});

check("靜態頁引用的腳本與樣式都在倉庫裡", function () {
  var html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  var refs = html.match(/(?:src|href)="([^"]+)"/g) || [];
  assert.ok(refs.length >= 6);
  refs.forEach(function (ref) {
    var file = ref.replace(/^(?:src|href)="/, "").replace(/"$/, "");
    if (file.indexOf("http") === 0) return;
    assert.ok(fs.existsSync(path.join(__dirname, "..", file)), file);
  });
  assert.ok(fs.existsSync(path.join(__dirname, "..", ".nojekyll")));
});

check("IHS：12 個月 £1,164；長度未知是 null；不採用校方表 £1,114", function () {
  assert.strictEqual(C.ihsAmountGbp(12).amount, 1164);
  assert.strictEqual(C.ihsAmountGbp(null).amount, null);
  assert.strictEqual(C.PRESETS.glasgow.tuitionGbp, 34815);
  assert.strictEqual(C.VISA_FEE_OUTSIDE_GBP, 558);
  assert.notStrictEqual(C.ihsAmountGbp(12).amount, 1114);
});

if (process.exitCode) console.error("\nAcceptance tests failed.");
else console.log("\nAll " + passed + " acceptance tests passed.");
