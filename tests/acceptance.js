#!/usr/bin/env node
/**
 * 規格第 6 節與 B／D／E 驗收。合成 TWD 案例不加預備金、可用資金 500,000。
 */
var assert = require("assert");
var C = require("../engine.js");
var A = require("../modules/a/aggregate.js");
var B = require("../modules/b/programmes.js");
var D = require("../modules/d/payments.js");
var E = require("../modules/e/review.js");
var Constants = require("../shared/constants.js");

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

function synth(id, version, amount, flag, more) {
  more = more || {};
  var pending = flag === "待確認";
  return Object.assign({
    fee_id: id,
    item_version: version,
    school_id: "synth",
    program_id: "synth-prog",
    intake: "synth",
    coverage_start: "synth-start",
    coverage_end: "synth-end",
    fee_type: id,
    currency: "TWD",
    amount: amount,
    status: pending ? "待查" : "已查明",
    inclusion_flag: flag,
    included_in_fee_id: flag === "已含" ? (more.included_in_fee_id || "tuition-01") : null,
    zero_evidence: !!more.zero_evidence,
    source_ref: more.source_ref || { url: "https://example.test/synth", label: "虛構收據", assumption: false },
  }, more, {
    inclusion_flag: flag,
    amount: amount,
    item_version: version,
    fee_id: id,
  });
}

function baseFunds() {
  return {
    fxRate: 1,
    reserveRate: 0,
    funds: { savings: 500000, family: 0, scholarship: 0 },
    loan: { annualRate: 0.03, termMonths: 108, graceMonths: 0 },
    incomeMonthly: 55000,
  };
}

function publishCase(versions, snapshotId) {
  var ws = publishCase.ws || A.createWorkspace();
  publishCase.ws = ws;
  versions.forEach(function (fee) {
    var saved = A.ingest(ws, fee);
    if (!saved.ok && !saved.conflict) throw new Error(saved.error || "ingest 失敗");
  });
  return A.publish(ws, Object.assign({
    plan_id: "p-synth-a01",
    revision: 1,
    snapshot_id: snapshotId,
    publication_state: "published",
    required_fee_ids: ["tuition-01", "ins-01"],
    items: [
      { fee_id: "tuition-01", item_version: 1 },
      { fee_id: "ins-01", item_version: versions.filter(function (fee) { return fee.fee_id === "ins-01"; }).slice(-1)[0].item_version },
    ],
    assumptions_ref: "synth-no-reserve",
    published_at: "2026-11-10T09:56:28+08:00",
    assumptions: baseFunds(),
  }));
}

check("t02① 保險已含：總額 1,000,000，不會變成 1,020,000", function () {
  publishCase.ws = null;
  var pub = publishCase([
    synth("tuition-01", 1, 1000000, "另計"),
    synth("ins-01", 1, 20000, "已含"),
  ], "S-included");
  assert.strictEqual(pub.ok, true);
  assert.strictEqual(pub.scenario.final_total_twd, 1000000);
  assert.strictEqual(pub.scenario.confirmed_gap_twd, 500000);
  assert.strictEqual(pub.scenario.complete, true);
});

check("t02②／0956a S1 保險另計：1,020,000、缺口 520,000", function () {
  publishCase.ws = null;
  var pub = publishCase([
    synth("tuition-01", 1, 1000000, "另計"),
    synth("ins-01", 1, 20000, "另計"),
  ], "S1");
  assert.strictEqual(pub.scenario.final_total_twd, 1020000);
  assert.strictEqual(pub.scenario.confirmed_gap_twd, 520000);
  assert.strictEqual(pub.scenario.complete, true);
});

check("t02③ 待確認不當 0：已知 1,000,000，確定總額與缺口是 null", function () {
  publishCase.ws = null;
  var pub = publishCase([
    synth("tuition-01", 1, 1000000, "另計"),
    synth("ins-01", 1, null, "待確認"),
  ], "S-pending");
  assert.strictEqual(pub.scenario.known_subtotal_twd, 1000000);
  assert.strictEqual(pub.scenario.complete, false);
  assert.strictEqual(pub.scenario.final_total_twd, null);
  assert.strictEqual(pub.scenario.confirmed_gap_twd, null);
  assert.strictEqual(pub.scenario.loan_amount_twd, null);
});

check("22a1③ 同內容重送仍是 1,020,000", function () {
  var ws = A.createWorkspace();
  var tuition = synth("tuition-01", 1, 1000000, "另計");
  var ins = synth("ins-01", 1, 20000, "另計");
  assert.strictEqual(A.ingest(ws, ins).ok, true);
  assert.strictEqual(A.ingest(ws, ins).idempotent, true);
  A.ingest(ws, tuition);
  var pub = A.publish(ws, Object.assign({
    plan_id: "p-synth-a01",
    revision: 1,
    snapshot_id: "S-once",
    publication_state: "published",
    required_fee_ids: ["tuition-01", "ins-01"],
    items: [
      { fee_id: "tuition-01", item_version: 1 },
      { fee_id: "ins-01", item_version: 1 },
      { fee_id: "ins-01", item_version: 1 },
    ],
    assumptions_ref: "synth",
    published_at: "2026-11-10T09:56:28+08:00",
    assumptions: baseFunds(),
  }));
  assert.strictEqual(pub.scenario.final_total_twd, 1020000);
});

check("0956a S2 新版未發布：仍用舊快照 1,020,000", function () {
  var ws = A.createWorkspace();
  A.ingest(ws, synth("tuition-01", 1, 1000000, "另計"));
  A.ingest(ws, synth("ins-01", 1, 20000, "另計"));
  var s1 = A.publish(ws, {
    plan_id: "p-synth-a01",
    revision: 1,
    snapshot_id: "S1",
    publication_state: "published",
    required_fee_ids: ["tuition-01", "ins-01"],
    items: [
      { fee_id: "tuition-01", item_version: 1 },
      { fee_id: "ins-01", item_version: 1 },
    ],
    assumptions_ref: "synth",
    published_at: "2026-11-10T09:56:28+08:00",
    assumptions: baseFunds(),
  });
  assert.strictEqual(s1.scenario.final_total_twd, 1020000);
  A.ingest(ws, synth("ins-01", 2, 25000, "另計"));
  var draft = A.publish(ws, {
    plan_id: "p-synth-a01",
    revision: 1,
    snapshot_id: "S2-draft",
    publication_state: "draft",
    required_fee_ids: ["tuition-01", "ins-01"],
    items: [
      { fee_id: "tuition-01", item_version: 1 },
      { fee_id: "ins-01", item_version: 2 },
    ],
    assumptions_ref: "synth",
    published_at: null,
    assumptions: baseFunds(),
  });
  assert.strictEqual(draft.switched, false);
  assert.strictEqual(A.current(ws).scenario.snapshot_id, "S1");
  assert.strictEqual(A.current(ws).scenario.final_total_twd, 1020000);
});

check("22a1④／0956a S3 發布 v2 後整案切換：1,025,000、缺口 525,000", function () {
  var ws = A.createWorkspace();
  A.ingest(ws, synth("tuition-01", 1, 1000000, "另計"));
  A.ingest(ws, synth("ins-01", 1, 20000, "另計"));
  A.ingest(ws, synth("ins-01", 2, 25000, "另計"));
  A.publish(ws, {
    plan_id: "p-synth-a01",
    revision: 1,
    snapshot_id: "S1",
    publication_state: "published",
    required_fee_ids: ["tuition-01", "ins-01"],
    items: [
      { fee_id: "tuition-01", item_version: 1 },
      { fee_id: "ins-01", item_version: 1 },
    ],
    assumptions_ref: "synth",
    published_at: "2026-11-10T09:56:28+08:00",
    assumptions: baseFunds(),
  });
  var s2 = A.publish(ws, {
    plan_id: "p-synth-a01",
    revision: 2,
    snapshot_id: "S2",
    publication_state: "published",
    required_fee_ids: ["tuition-01", "ins-01"],
    items: [
      { fee_id: "tuition-01", item_version: 1 },
      { fee_id: "ins-01", item_version: 2 },
    ],
    assumptions_ref: "synth",
    published_at: "2026-11-10T10:00:00+08:00",
    assumptions: baseFunds(),
  });
  assert.strictEqual(s2.switched, true);
  assert.strictEqual(s2.scenario.final_total_twd, 1025000);
  assert.strictEqual(s2.scenario.confirmed_gap_twd, 525000);
  s2.snapshot.items[1].fee.amount = 1;
  assert.strictEqual(A.current(ws).scenario.final_total_twd, 1025000);
});

check("0956a S4 完全缺 amount 欄：拒收，保留舊有效值", function () {
  var ws = A.createWorkspace();
  A.ingest(ws, synth("tuition-01", 1, 1000000, "另計"));
  A.ingest(ws, synth("ins-01", 2, 25000, "另計"));
  A.publish(ws, {
    plan_id: "p-synth-a01",
    revision: 1,
    snapshot_id: "S2",
    publication_state: "published",
    required_fee_ids: ["tuition-01", "ins-01"],
    items: [
      { fee_id: "tuition-01", item_version: 1 },
      { fee_id: "ins-01", item_version: 2 },
    ],
    assumptions_ref: "synth",
    published_at: "2026-11-10T10:00:00+08:00",
    assumptions: baseFunds(),
  });
  var bad = synth("ins-01", 3, 0, "另計");
  delete bad.amount;
  var rejected = A.ingest(ws, bad);
  assert.strictEqual(rejected.ok, false);
  assert.ok(rejected.error.indexOf("amount") >= 0);
  assert.strictEqual(A.current(ws).scenario.final_total_twd, 1025000);
  var engine = C.calculatePlan({
    fxRate: 1,
    reserveRate: 0,
    funds: { savings: 500000, family: 0, scholarship: 0 },
    fees: [
      { id: "tuition-01", version: 1, amount: 1000000, currency: "TWD", inclusion: "extra", required: true },
      { id: "ins-01", version: 2, amount: 25000, currency: "TWD", inclusion: "extra", required: true },
      { id: "ins-01", version: 3, currency: "TWD", inclusion: "extra", required: true },
    ],
  });
  assert.strictEqual(engine.finalTotal, 1025000);
  assert.ok(engine.warnings.length > 0);
});

check("0956a S5 明示 null：已知 1,000,000，確定總額與缺口是 null", function () {
  var ws = A.createWorkspace();
  A.ingest(ws, synth("tuition-01", 1, 1000000, "另計"));
  A.ingest(ws, synth("ins-01", 2, 25000, "另計"));
  A.ingest(ws, synth("ins-01", 3, null, "待確認"));
  var s3 = A.publish(ws, {
    plan_id: "p-synth-a01",
    revision: 3,
    snapshot_id: "S3",
    publication_state: "published",
    required_fee_ids: ["tuition-01", "ins-01"],
    items: [
      { fee_id: "tuition-01", item_version: 1 },
      { fee_id: "ins-01", item_version: 3 },
    ],
    assumptions_ref: "synth",
    published_at: "2026-11-10T11:00:00+08:00",
    assumptions: baseFunds(),
  });
  assert.strictEqual(s3.scenario.known_subtotal_twd, 1000000);
  assert.strictEqual(s3.scenario.complete, false);
  assert.strictEqual(s3.scenario.final_total_twd, null);
  assert.strictEqual(s3.scenario.confirmed_gap_twd, null);
});

check("0956a S6 清單缺學費：不發布、不切換", function () {
  var ws = A.createWorkspace();
  A.ingest(ws, synth("tuition-01", 1, 1000000, "另計"));
  A.ingest(ws, synth("ins-01", 1, 20000, "另計"));
  A.publish(ws, {
    plan_id: "p-synth-a01",
    revision: 1,
    snapshot_id: "S1",
    publication_state: "published",
    required_fee_ids: ["tuition-01", "ins-01"],
    items: [
      { fee_id: "tuition-01", item_version: 1 },
      { fee_id: "ins-01", item_version: 1 },
    ],
    assumptions_ref: "synth",
    published_at: "2026-11-10T09:56:28+08:00",
    assumptions: baseFunds(),
  });
  var refused = A.publish(ws, {
    plan_id: "p-synth-a01",
    revision: 2,
    snapshot_id: "S-missing",
    publication_state: "published",
    required_fee_ids: ["tuition-01", "ins-01"],
    items: [{ fee_id: "ins-01", item_version: 1 }],
    assumptions_ref: "synth",
    published_at: "2026-11-10T12:00:00+08:00",
    assumptions: baseFunds(),
  });
  assert.strictEqual(refused.ok, false);
  assert.strictEqual(A.current(ws).snapshot.snapshot_id, "S1");
  assert.strictEqual(A.current(ws).scenario.final_total_twd, 1020000);
});

check("22a1⑦⑧ 無此費用：有證據才是 1,000,000；沒證據不能填 0", function () {
  publishCase.ws = null;
  var withEvidence = publishCase([
    synth("tuition-01", 1, 1000000, "另計"),
    synth("ins-01", 1, 0, "無此費用", { zero_evidence: true }),
  ], "S-zero");
  assert.strictEqual(withEvidence.scenario.complete, true);
  assert.strictEqual(withEvidence.scenario.final_total_twd, 1000000);
  var missing = synth("ins-01", 1, 0, "無此費用", { zero_evidence: false });
  assert.ok(A.ingest(A.createWorkspace(), missing).error.indexOf("零費") >= 0);
  var engine = C.calculatePlan({
    fxRate: 1,
    reserveRate: 0,
    funds: { savings: 500000, family: 0, scholarship: 0 },
    fees: [
      { id: "tuition-01", version: 1, amount: 1000000, currency: "TWD", inclusion: "extra", required: true },
      { id: "ins-01", version: 1, amount: 0, currency: "TWD", inclusion: "none", required: true, zeroEvidence: false },
    ],
  });
  assert.strictEqual(engine.complete, false);
  assert.strictEqual(engine.finalTotal, null);
});

check("同版本不同內容：衝突，已發布總額不被蓋掉", function () {
  var ws = A.createWorkspace();
  A.ingest(ws, synth("tuition-01", 1, 1000000, "另計"));
  A.ingest(ws, synth("ins-01", 1, 20000, "另計"));
  A.publish(ws, {
    plan_id: "p-synth-a01",
    revision: 1,
    snapshot_id: "S1",
    publication_state: "published",
    required_fee_ids: ["tuition-01", "ins-01"],
    items: [
      { fee_id: "tuition-01", item_version: 1 },
      { fee_id: "ins-01", item_version: 1 },
    ],
    assumptions_ref: "synth",
    published_at: "2026-11-10T09:56:28+08:00",
    assumptions: baseFunds(),
  });
  var conflict = A.ingest(ws, synth("ins-01", 1, 25000, "另計"));
  assert.strictEqual(conflict.conflict, true);
  assert.strictEqual(A.current(ws).scenario.final_total_twd, 1020000);
});

check("m01 55,000：總成本 2,266,215、缺口 761,215、貸款 770,000", function () {
  var result = C.calculatePlan({
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
  assert.strictEqual(result.finalTotal, 2266215);
  assert.strictEqual(result.confirmedGap, 761215);
  assert.strictEqual(result.loanAmount, 770000);
});

check("m01 60,000：總成本 2,271,465、缺口 766,465、貸款 770,000", function () {
  var result = C.calculatePlan({
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
  assert.strictEqual(result.finalTotal, 2271465);
  assert.strictEqual(result.confirmedGap, 766465);
  assert.strictEqual(result.loanAmount, 770000);
});

check("訂金不改總學費；格拉斯哥餘額 34,815 或 32,815", function () {
  function run(paid) {
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
  var unpaid = run(false);
  var paid = run(true);
  var unknown = run(null);
  assert.strictEqual(unpaid.gbpKnown, 34815);
  assert.strictEqual(paid.gbpKnown, 34815);
  assert.strictEqual(unpaid.finalTotal, paid.finalTotal);
  assert.strictEqual(unpaid.deposit.balanceDue, 34815);
  assert.strictEqual(paid.deposit.balanceDue, 32815);
  assert.strictEqual(unknown.deposit.balanceDue, null);
  assert.strictEqual(unknown.deposit.paid, null);
});

check("IHS：12 個月 £1,164；14 個月 £1,552；未知是 null；6 個月不是 1,164", function () {
  assert.strictEqual(C.ihsAmountGbp(12).amount, 1164);
  assert.strictEqual(C.ihsAmountGbp(12).visaMonthsMax, 17);
  assert.strictEqual(C.ihsAmountGbp(14).amount, 1552);
  assert.strictEqual(C.ihsAmountGbp(null).amount, null);
  assert.notStrictEqual(C.ihsAmountGbp(6).amount, 1164);
  assert.strictEqual(C.ihsAmountGbp(6).amount, 776);
});

function studentAssumptions(extra) {
  return Object.assign({
    fxRate: 41,
    reserveRate: 0.05,
    livingMonthlyGbp: 1500,
    livingMonths: 12,
    otherGbp: 0,
    twdExpenses: 55000,
    savings: 500000,
    family: 1000000,
    manualScholarshipTwd: null,
    incomeMonthly: 55000,
    loan: { annualRate: 0.03, termMonths: 108, graceMonths: 0 },
  }, extra || {});
}

function studentPlan(key, extra) {
  extra = extra || {};
  return A.buildStudentPlan({
    programme: B.buildOutput(key),
    assumptions: studentAssumptions(extra.assumptions),
    depositPaid: extra.depositPaid,
    insurance: extra.insurance || { flag: "pending", amount: null },
    awardedWaiverGbp: extra.awardedWaiverGbp || 0,
    waiverNettedInTuition: extra.waiverNettedInTuition,
  });
}

check("B 兩校學費與訂金有來源，舊稱不覆蓋新學程", function () {
  var glasgow = B.buildOutput("glasgow");
  var edinburgh = B.buildOutput("edinburgh");
  assert.strictEqual(glasgow.tuition.amount, 34815);
  assert.strictEqual(glasgow.deposit.amount, 2000);
  assert.strictEqual(glasgow.deposit.inclusion_flag, "已含");
  assert.strictEqual(glasgow.deposit.part_of_fee_id, "tuition");
  assert.strictEqual(glasgow.insurance.amount, null);
  assert.strictEqual(edinburgh.tuition.amount, 47680);
  assert.strictEqual(edinburgh.deposit.amount, 1500);
  assert.ok(glasgow.tuition.source.url.indexOf("https://") === 0);
  assert.ok(edinburgh.tuition.source.url.indexOf("year=2027") > 0);
  assert.strictEqual(glasgow.scholarships[0].awarded, false);
  assert.strictEqual(glasgow.scholarships[0].amount_gbp, 10000);
  assert.strictEqual(edinburgh.scholarships.length, 0);
  var legacy = B.buildOutput("uog-msc-datascience");
  assert.strictEqual(legacy.tuition.amount, null);
  assert.strictEqual(legacy.do_not_overwrite, "uog-msc-dsai");
  assert.strictEqual(C.PRESETS.glasgow.tuitionGbp, Constants.byId("glasgow-tuition-2027").amount);
  assert.strictEqual(C.PRESETS.edinburgh.tuitionGbp, Constants.byId("edinburgh-tuition-2027").amount);
});

check("切換學程時學費與訂金跟著變；已付未付不改總學費", function () {
  var gUnpaid = studentPlan("glasgow", { depositPaid: false });
  var gPaid = studentPlan("glasgow", { depositPaid: true });
  var ediPaid = studentPlan("edinburgh", { depositPaid: true });
  function tuition(plan) {
    return plan.plan.lines.filter(function (line) { return line.id === "tuition"; })[0].amount;
  }
  assert.strictEqual(tuition(gUnpaid), 34815);
  assert.strictEqual(tuition(gPaid), 34815);
  assert.strictEqual(gUnpaid.plan.gbpKnown, gPaid.plan.gbpKnown);
  assert.strictEqual(gUnpaid.scenario.deposit.balance_due, 34815);
  assert.strictEqual(gPaid.scenario.deposit.balance_due, 32815);
  assert.strictEqual(tuition(ediPaid), 47680);
  assert.strictEqual(ediPaid.scenario.deposit.balance_due, 46180);
  assert.notStrictEqual(tuition(gPaid), tuition(ediPaid));
  assert.strictEqual(gUnpaid.scenario.final_total_twd, null);
  assert.strictEqual(gUnpaid.plan.gbpKnown, 54537);
});

check("未核定獎學金不進資金；核定的減免只扣一次，學費仍列公告額", function () {
  var plain = studentPlan("glasgow", { depositPaid: false });
  assert.strictEqual(plain.scenario.funds.scholarship, 0);
  var awards = B.awardState(B.buildOutput("glasgow"), []);
  assert.strictEqual(awards[0].counts_as_funds, false);
  assert.strictEqual(awards[0].amount_counted_gbp, null);
  var awarded = studentPlan("glasgow", { depositPaid: false, awardedWaiverGbp: 10000 });
  assert.strictEqual(awarded.scenario.funds.scholarship, 410000);
  assert.strictEqual(awarded.plan.lines.filter(function (line) { return line.id === "tuition"; })[0].amount, 34815);
  var doubled = A.fundingCheck({
    fxRate: 41,
    waiverGbp: 10000,
    scholarshipTwd: 410000,
    awarded: true,
    waiverNettedInTuition: true,
  });
  assert.strictEqual(doubled.ok, false);
});

check("D 格拉斯哥排除直接匯校；訂金與學費管道不同；沒有報價就不排名", function () {
  var tuition = D.compare({
    school_id: "glasgow",
    fee_purpose: "tuition",
    amount_due: 32815,
    currency: "GBP",
    payer_country: "TW",
    amount_basis: "balance_due",
  });
  var deposit = D.compare({
    school_id: "glasgow",
    fee_purpose: "deposit",
    amount_due: 2000,
    currency: "GBP",
    payer_country: "TW",
    amount_basis: "deposit_outstanding",
  });
  var direct = tuition.channels.filter(function (ch) { return ch.channel_id === "uog-direct-bank"; })[0];
  assert.strictEqual(direct.school_acceptance, "不接受");
  assert.notStrictEqual(
    tuition.channels.map(function (ch) { return ch.channel_id; }).join(),
    deposit.channels.map(function (ch) { return ch.channel_id; }).join()
  );
  assert.strictEqual(tuition.ranking, null);
  assert.strictEqual(tuition.cheapest, null);
  assert.strictEqual(tuition.message, "可行性／費用待查");
  tuition.channels.forEach(function (ch) {
    assert.strictEqual(ch.payer_total, null);
    assert.strictEqual(ch.pct_fee, null);
    assert.strictEqual(ch.fixed_fee, null);
  });
  var card = deposit.channels.filter(function (ch) { return ch.channel_id === "uog-deposit-card"; })[0];
  assert.strictEqual(card.school_acceptance, "核准");
  assert.ok(card.source_url.indexOf("deposits") > 0);
  var unknown = D.outstanding({ deposit: { amount: 2000, currency: "GBP", paid: null, balance_due: null } }, "tuition");
  assert.strictEqual(unknown.amount, null);
  var compared = D.compare({ school_id: "glasgow", fee_purpose: "tuition", amount_due: unknown.amount, currency: "GBP" });
  assert.strictEqual(compared.ranking, null);
  assert.strictEqual(compared.amount_due, null);
});

check("臺銀個人網銀只作參考：最低 120、次一日、不排名", function () {
  var ref = D.referenceChannels()[0];
  assert.strictEqual(ref.min_fee, 120);
  assert.strictEqual(ref.max_fee, 800);
  assert.strictEqual(ref.fixed_fee, 300);
  assert.strictEqual(ref.pct_fee, 0.0005);
  assert.strictEqual(ref.payee_setup_lead, "次一日");
  assert.strictEqual(ref.payee_setup_is_business_day, null);
  assert.ok(ref.note.indexOf("次一營業日") >= 0);
  assert.notStrictEqual(ref.payee_setup_lead, "次一營業日");
  var compared = D.compare({ school_id: "edinburgh", fee_purpose: "tuition", amount_due: 46180, currency: "GBP" });
  assert.strictEqual(compared.ranking, null);
  assert.ok(compared.channels.every(function (ch) { return ch.channel_id !== "bot-personal-outward"; }));
  assert.ok(compared.channels.some(function (ch) { return ch.channel_id === "uoe-direct-bank" && ch.school_acceptance === "不接受"; }));
  assert.ok(compared.channels.some(function (ch) { return ch.channel_id === "uoe-flywire"; }));
});

check("付款合成：分期固定費、最低費、報價已含、基準不同不排名", function () {
  var p1 = D.payerTotal([
    { principal: 500, fixed_fee: 100, pct_fee: 0 },
    { principal: 500, fixed_fee: 100, pct_fee: 0 },
  ]);
  assert.strictEqual(p1.total, 1200);
  var p2 = D.payerTotal([{ principal: 1000, fixed_fee: 0, pct_fee: 0.005, min_fee: 20 }]);
  assert.strictEqual(p2.total, 1020);
  var p3 = D.payerTotal([{ fee_included_in_quote: true, quote_total: 1040, principal: 1000, fixed_fee: 40, pct_fee: 0 }]);
  assert.strictEqual(p3.total, 1040);
  var missing = D.payerTotal([{ principal: 1000, fixed_fee: null, pct_fee: 0.01 }]);
  assert.strictEqual(missing.total, null);
  var p4 = D.rankQuotes([
    { id: "a", quote_status: "已報價", payer_total: 100, currency: "TWD", as_of: "t1", amount_due: 1000, amount_currency: "GBP" },
    { id: "b", quote_status: "已報價", payer_total: 50, currency: "USD", as_of: "t2", amount_due: 1100, amount_currency: "GBP" },
  ]);
  assert.strictEqual(p4.ranking, null);
  var none = D.rankQuotes([{ id: "c", quote_status: "缺報價", payer_total: null, currency: "TWD", as_of: "t1", amount_due: 1000, amount_currency: "GBP" }]);
  assert.strictEqual(none.ranking, null);
  assert.strictEqual(none.cheapest, null);
});

check("E 擋未知當 0 與沒來源的數字，待確認不能宣稱完整總額", function () {
  var zero = E.presentLine({ id: "ins", name: "校保", inclusion: "pending", amount: 0, assumption: false, sourceUrl: "" });
  assert.strictEqual(zero.blocked, true);
  assert.strictEqual(zero.amount, null);
  var bare = E.presentLine({ id: "mystery", name: "未註明", inclusion: "extra", amount: 80, assumption: false, sourceUrl: "" });
  assert.strictEqual(bare.blocked, true);
  var review = E.review({
    lines: [
      { id: "tuition", inclusion: "extra", amount: 1, sourceUrl: "https://example.test/t", assumption: false },
      { id: "school-insurance", name: "校保", inclusion: "pending", amount: null, assumption: false, sourceUrl: "https://example.test/i" },
    ],
    scenario: { complete: false, final_total_twd: null, confirmed_gap_twd: null },
  });
  assert.strictEqual(review.verdict, "退修");
  assert.strictEqual(review.show_final_total, false);
  assert.strictEqual(review.formal_demo, "尚未放行");
  var falseComplete = E.review({
    lines: [{ id: "school-insurance", inclusion: "pending", amount: null, sourceUrl: "https://example.test/i" }],
    scenario: { complete: true, final_total_twd: 1, confirmed_gap_twd: 1 },
  });
  assert.strictEqual(falseComplete.verdict, "退修");
  assert.strictEqual(falseComplete.show_final_total, false);
  var known = E.review({
    lines: [{ id: "tuition", inclusion: "extra", amount: 100, sourceUrl: "https://example.test/t" }],
    scenario: { complete: true, final_total_twd: 100, confirmed_gap_twd: 0 },
    claimsKnownAsFinal: true,
  });
  assert.ok(known.blockers.some(function (item) { return item.code === "known-as-final"; }));
});

check("E 常數都帶網址；假設有標；待確認金額是 null；校方預算表數字不進目錄", function () {
  var audit = E.auditCatalog();
  assert.strictEqual(audit.ok, true, audit.problems.join("; "));
  Constants.catalog.forEach(function (entry) {
    if (entry.kind === "sourced") assert.ok(/^https:\/\//.test(entry.url), entry.id);
    if (entry.kind === "pending") assert.strictEqual(entry.amount, null);
    if (entry.kind === "assumption") assert.ok(!entry.url);
  });
  var amounts = Constants.catalog.map(function (entry) { return entry.amount; });
  assert.ok(amounts.indexOf(1114) < 0);
  assert.ok(amounts.indexOf(524) < 0);
  assert.ok(amounts.indexOf(200) < 0);
  assert.strictEqual(Constants.byId("bot-outward-min").amount, 120);
  var plan = studentPlan("glasgow", { depositPaid: null });
  var maintenance = plan.plan.lines.filter(function (line) { return line.amount === 1171 * 9; });
  assert.strictEqual(maintenance.length, 0);
  var summary = A.summarize(plan, E.review({ lines: plan.plan.lines, scenario: plan.scenario }));
  assert.strictEqual(summary.final_total_twd, null);
  assert.ok(summary.known_subtotal_twd > 0);
  assert.notStrictEqual(summary.known_subtotal_twd, summary.final_total_twd);
  var human = E.review({
    lines: [{ id: "rate", inclusion: "extra", amount: 0.03, assumption: true }],
    scenario: { complete: true, final_total_twd: 1 },
    needsHumanDecision: true,
  });
  assert.strictEqual(human.verdict, "轉真人");
});

check("C→E：plan.lines 帶 zeroEvidence，無此費用且有零費證據與來源時審查 PASS", function () {
  publishCase.ws = null;
  var pub = publishCase([
    synth("tuition-01", 1, 1000000, "另計"),
    synth("ins-01", 1, 0, "無此費用", { zero_evidence: true }),
  ], "S-zero-review");
  var line = pub.plan.lines.filter(function (item) { return item.id === "ins-01"; })[0];
  assert.strictEqual(line.zeroEvidence, true);
  var review = E.review({ lines: pub.plan.lines, scenario: pub.scenario });
  assert.deepStrictEqual(review.blockers, []);
  assert.strictEqual(review.verdict, "PASS");
  var summary = A.summarize(pub, review);
  assert.strictEqual(summary.final_total_twd, 1000000);
  var noEvidence = E.review({
    lines: pub.plan.lines.map(function (item) {
      return item.id === "ins-01" ? Object.assign({}, item, { zeroEvidence: false }) : item;
    }),
    scenario: pub.scenario,
  });
  assert.strictEqual(noEvidence.verdict, "退修");
  assert.ok(noEvidence.blockers.some(function (item) { return item.code === "zero-without-evidence"; }));
});

check("校保被契約拒收：留下真正的原因，改標待確認，不再只剩「必需費用不在清單內」", function () {
  var blankZero = studentPlan("glasgow", { depositPaid: false, insurance: { flag: "none", amount: null, zeroEvidence: true } });
  assert.strictEqual(blankZero.ok, true);
  assert.strictEqual(blankZero.rejected.length, 1);
  assert.strictEqual(blankZero.rejected[0].id, "school-insurance");
  assert.ok(blankZero.rejected[0].reason.indexOf("無此費用的 amount 必須是 0") >= 0);
  assert.ok(blankZero.warnings[0].indexOf("校方強制保險") >= 0);
  var line = blankZero.plan.lines.filter(function (item) { return item.id === "school-insurance"; })[0];
  assert.strictEqual(line.inclusion, "pending");
  assert.strictEqual(line.amount, null);
  assert.ok(line.note.indexOf("無此費用的 amount 必須是 0") >= 0);
  assert.strictEqual(blankZero.scenario.complete, false);
  assert.strictEqual(blankZero.scenario.final_total_twd, null);

  var included = studentPlan("glasgow", { depositPaid: false, insurance: { flag: "included", amount: 300, zeroEvidence: false } });
  assert.strictEqual(included.ok, true);
  assert.ok(included.rejected[0].reason.indexOf("已含缺包含證據") >= 0);
  assert.strictEqual(included.scenario.final_total_twd, null);

  var fine = studentPlan("glasgow", { depositPaid: false });
  assert.deepStrictEqual(fine.rejected, []);
});

check("攤還期數 0 或負數、預備金負數：引擎擋下，不回月付 0", function () {
  function run(extra) {
    return C.calculatePlan(Object.assign({
      fxRate: 41,
      reserveRate: 0.05,
      fees: [{ id: "tuition", version: 1, amount: 32000, currency: "GBP", inclusion: "extra", required: true }],
      funds: { savings: 0, family: 0, scholarship: 0 },
      loan: { annualRate: 0.03, termMonths: 108, graceMonths: 0 },
    }, extra));
  }
  assert.strictEqual(run({}).ok, true);
  [0, -12].forEach(function (term) {
    var bad = run({ loan: { annualRate: 0.03, termMonths: term, graceMonths: 0 } });
    assert.strictEqual(bad.ok, false);
    assert.ok(bad.error.indexOf("攤還期數") >= 0);
    assert.strictEqual(bad.monthlyPayment, undefined);
  });
  var negative = run({ reserveRate: -0.05 });
  assert.strictEqual(negative.ok, false);
  assert.ok(negative.error.indexOf("預備金") >= 0);
  assert.strictEqual(run({ reserveRate: 0 }).ok, true);
  var viaA = studentPlan("glasgow", { assumptions: { loan: { annualRate: 0.03, termMonths: 0, graceMonths: 0 } } });
  assert.strictEqual(viaA.plan.ok, false);
});

check("D channel()：物件沒有重複鍵，預設值仍在", function () {
  var source = require("fs").readFileSync(require("path").join(__dirname, "../modules/d/payments.js"), "utf8");
  var body = source.slice(source.indexOf("function channel(partial)"), source.indexOf("var GLASGOW"));
  var keys = (body.match(/^\s{6}([a-z_]+):/gm) || []).map(function (item) { return item.trim().replace(":", ""); });
  assert.ok(keys.length >= 15);
  var seen = {};
  keys.forEach(function (key) {
    assert.ok(!seen[key], "重複鍵 " + key);
    seen[key] = true;
  });
  var ch = D.compare({ school_id: "glasgow", fee_purpose: "tuition", amount_due: 1, currency: "GBP" }).channels[0];
  ["school_acceptance", "payer_eligibility", "preconditions", "quote_status", "fixed_fee", "pct_fee", "min_fee", "max_fee",
    "fx_spread", "fee_included_in_quote", "payer_total", "currency", "consulted", "source_url", "source_urls", "note", "record",
    "channel_id", "fee_purpose", "name"].forEach(function (key) {
    assert.ok(Object.prototype.hasOwnProperty.call(ch, key), key);
  });
  assert.strictEqual(ch.quote_status, "缺報價");
  assert.strictEqual(ch.payer_total, null);
  assert.deepStrictEqual(ch.preconditions, []);
});

var loadApp = require("./fake-dom.js").loadApp;

function kpi(html, label) {
  var m = new RegExp("<span>" + label + "</span><strong>([^<]*)</strong>").exec(html);
  return m ? m[1] : null;
}

check("畫面 C 頁：E 不是 PASS 時不得出現確定總額、確定缺口、建議貸款", function () {
  var app = loadApp();
  // 無此費用＋勾零費證據＋金額 0：C 算得出完整總額，但沒有來源網址，E 退修。
  app.set("deposit-paid", "unpaid");
  app.set("ins-flag", "none");
  app.set("ins-evidence", true);
  app.set("ins-amt", "0");
  var same = studentPlan("glasgow", { depositPaid: false, insurance: { flag: "none", amount: 0, zeroEvidence: true } });
  assert.strictEqual(same.scenario.complete, true, "前提：C 的情境是完整的");
  assert.ok(same.scenario.final_total_twd > 0);
  var review = E.review({ lines: same.plan.lines, scenario: same.scenario });
  assert.notStrictEqual(review.verdict, "PASS", "前提：E 沒有放行");
  assert.ok(review.blockers.every(function (item) { return item.code !== "zero-without-evidence"; }), "零費證據有帶到 E");

  var html = app.html("c-results");
  assert.strictEqual(kpi(html, "確定總額"), "尚未確定");
  assert.strictEqual(kpi(html, "確定缺口"), "尚未確定");
  assert.strictEqual(kpi(html, "建議貸款（假設）"), "尚未確定");
  var loan = same.scenario.loan_amount_twd;
  var gap = same.scenario.confirmed_gap_twd;
  assert.ok(loan > 0 && gap > 0);
  [loan, gap].forEach(function (n) {
    assert.ok(html.indexOf("NT$" + Math.round(n).toLocaleString("zh-Hant")) < 0, "不得顯示 " + n);
    assert.ok(html.indexOf(String(n)) < 0, "JSON 也不得露出 " + n);
  });
  assert.ok(html.indexOf("估月付") < 0);
  assert.ok(/final_total_twd&quot;: null/.test(html));
  assert.ok(html.indexOf("退修") >= 0);
  // A 頁同一套規則。
  assert.ok(app.html("page-a").indexOf("<span>確定總額</span><strong>尚未確定</strong>") >= 0);
});

check("畫面 C 頁：預設待確認時沒有確定總額；已知小計照常顯示", function () {
  var app = loadApp();
  var html = app.html("c-results");
  assert.strictEqual(kpi(html, "確定總額"), "尚未確定");
  assert.strictEqual(kpi(html, "確定缺口"), "尚未確定");
  assert.ok(/^NT\$/.test(kpi(html, "已知小計")));
  assert.ok(/^NT\$/.test(kpi(html, "暫估總額")));
  assert.ok(html.indexOf("交給 A 的情境 JSON") >= 0);
});

check("畫面：校保被契約拒收時顯示真正原因，頁面照常算已知小計", function () {
  var app = loadApp();
  app.set("ins-flag", "none");
  app.set("ins-evidence", true);
  var html = app.html("c-results");
  assert.ok(html.indexOf("無此費用的 amount 必須是 0") >= 0);
  assert.ok(html.indexOf("必需費用不在清單內") < 0);
  assert.ok(/^NT\$/.test(kpi(html, "已知小計")));
  assert.strictEqual(kpi(html, "確定總額"), "尚未確定");
  assert.ok(app.html("page-a").indexOf("必需費用不在清單內") < 0);
  assert.ok(app.html("page-a").indexOf("無此費用的 amount 必須是 0") >= 0);
  app.set("ins-flag", "included");
  app.set("ins-evidence", false);
  app.set("ins-amt", "300");
  assert.ok(app.html("c-results").indexOf("已含缺包含證據") >= 0);
  app.set("ins-flag", "pending");
  app.set("ins-amt", "");
  assert.ok(app.html("c-results").indexOf("契約檢查拒收") < 0);
});

check("畫面 E 頁：比率顯示成百分比，不是 NT$0", function () {
  var app = loadApp();
  var html = app.html("page-e");
  function cell(label) {
    var at = html.indexOf(label);
    assert.ok(at >= 0, label);
    return /<td class="num">([^<]*)<\/td>/.exec(html.slice(at))[1];
  }
  assert.strictEqual(cell("臺銀個人網銀外匯匯出費率"), "0.05%");
  assert.strictEqual(cell("預備金比例"), "5%");
  assert.strictEqual(cell("貸款年利率示例"), "3%");
  assert.strictEqual(cell("臺銀個人網銀外匯匯出最低費"), "NT$120");
  assert.strictEqual(cell("IHS 學生年費"), "£776");
  assert.ok(html.indexOf('<td class="num">NT$0</td>') < 0);
  Constants.catalog.forEach(function (entry) {
    if (entry.amount !== null && entry.amount > 0 && entry.amount < 1) assert.strictEqual(entry.unit, "比例", entry.id);
  });
});

check("畫面：清空學費或訂金就先不算，不默默用公告價", function () {
  var app = loadApp();
  assert.strictEqual(app.value("tuition"), "34815");
  app.set("tuition", "");
  ["c-results", "page-a", "page-d"].forEach(function (id) {
    assert.ok(app.html(id).indexOf("學費或訂金留空時先不算") >= 0, id);
  });
  assert.ok(app.html("c-results").indexOf("已知小計") < 0);
  app.set("tuition", "34815");
  assert.ok(app.html("c-results").indexOf("已知小計") >= 0);
  app.set("deposit", "");
  assert.ok(app.html("c-results").indexOf("學費或訂金留空時先不算") >= 0);
  assert.ok(app.html("c-results").indexOf("已知小計") < 0);
});

check("畫面：攤還期數 0／負數、預備金負數被擋", function () {
  var app = loadApp();
  ["0", "-12"].forEach(function (term) {
    app.set("term", term);
    assert.ok(app.html("c-results").indexOf("攤還期數必須大於 0") >= 0, term);
    assert.ok(app.html("c-results").indexOf("已知小計") < 0);
  });
  app.set("term", "108");
  assert.ok(app.html("c-results").indexOf("已知小計") >= 0);
  app.set("reserve", "-0.05");
  assert.ok(app.html("c-results").indexOf("預備金比例不能是負數") >= 0);
  assert.ok(app.html("c-results").indexOf("已知小計") < 0);
  app.set("reserve", "0");
  assert.ok(app.html("c-results").indexOf("已知小計") >= 0);
});

check("畫面 A 頁：「格拉斯哥直接匯校不接受」只在選格拉斯哥時顯示", function () {
  var app = loadApp();
  assert.ok(app.html("page-a").indexOf("格拉斯哥直接匯到學校是不接受") >= 0);
  app.set("preset", "edinburgh");
  assert.ok(app.html("page-a").indexOf("愛丁堡大學") >= 0);
  assert.ok(app.html("page-a").indexOf("格拉斯哥直接匯") < 0);
  assert.strictEqual(app.value("tuition"), "47680");
  app.set("preset", "glasgow");
  assert.ok(app.html("page-a").indexOf("格拉斯哥直接匯到學校是不接受") >= 0);
});

if (process.exitCode) console.error("\nAcceptance tests failed.");
else console.log("\nAll " + passed + " acceptance tests passed.");

// C 情境模擬的驗收在 tests/scenarios.js。從這裡載入，CI 的 Acceptance tests 步驟就會一併跑到。
console.log("");
require("./scenarios.js");

// 引導流程的驗收在 tests/guided-flow.js，同樣從這裡載入。
console.log("");
require("./guided-flow.js");
