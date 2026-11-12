/**
 * A｜統籌與彙整（Andy／陳致安）
 *
 * 費用進來後由這裡配 fee_id 的版本、發布不可變的 plan_snapshot，再請 C 計算。
 * C 不改快照。已知小計不是確定總額。校方減免只反映在淨學費。
 *
 * 給同學接的入口：
 * - submitFee(ledger, fee) / publish(ledger, spec) / activeSnapshot(ledger)
 * - buildStudentPlan(input, ledger) 把 B、C、D、E 收成學生頁用的一包
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(
      require("../../shared/contract.js"),
      require("../b/programmes.js"),
      require("../c/engine.js"),
      require("../d/payments.js"),
      require("../e/review.js")
    );
  } else {
    root.AModule = factory(root.Contract, root.BModule, root.CModule, root.DModule, root.EModule);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (Contract, B, C, D, E) {
  "use strict";

  function createLedger() {
    return { fees: {}, publications: [], currentSnapshotId: null, seq: 0 };
  }

  function contentKey(fee) {
    return JSON.stringify({
      amount: fee.amount,
      inclusion_flag: fee.inclusion_flag,
      currency: fee.currency,
      included_in_fee_id: fee.included_in_fee_id,
      zero_evidence: !!fee.zero_evidence,
      assumption: !!fee.assumption,
      program_id: fee.program_id,
      intake: fee.intake,
      url: fee.source_ref && fee.source_ref.url,
      note: fee.note || "",
    });
  }

  function submitFee(ledger, fee) {
    var check = Contract.validateFeeInput(fee);
    if (!check.ok) return { ok: false, reason: check.reason };
    var stored = Contract.clone(fee);
    var bucket = ledger.fees[stored.fee_id];
    if (!bucket) {
      bucket = { versions: [] };
      ledger.fees[stored.fee_id] = bucket;
    }
    if (bucket.versions.length) {
      var latest = bucket.versions[bucket.versions.length - 1];
      if (contentKey(latest) === contentKey(stored)) {
        return { ok: true, fee_id: stored.fee_id, item_version: latest.item_version, unchanged: true };
      }
      stored.item_version = latest.item_version + 1;
    } else {
      stored.item_version = 1;
    }
    bucket.versions.push(stored);
    return { ok: true, fee_id: stored.fee_id, item_version: stored.item_version, unchanged: false };
  }

  function versionOf(ledger, feeId, itemVersion) {
    var bucket = ledger.fees[feeId];
    if (!bucket) return null;
    var found = null;
    bucket.versions.forEach(function (version) {
      if (version.item_version === itemVersion) found = version;
    });
    return found;
  }

  function checkLinks(fees) {
    var byId = {};
    fees.forEach(function (fee) { byId[fee.fee_id] = fee; });
    var ids = Object.keys(byId);
    for (var i = 0; i < ids.length; i++) {
      var fee = byId[ids[i]];
      if (Contract.TO_ENGINE[fee.inclusion_flag] !== "included") continue;
      var targetId = fee.included_in_fee_id;
      var seen = {};
      var guard = 0;
      while (targetId) {
        if (seen[targetId]) return "已含關係循環：" + fee.fee_id;
        seen[targetId] = true;
        var target = byId[targetId];
        if (!target) return "已含指向這版快照裡沒有的費用：" + targetId;
        var targetFlag = Contract.TO_ENGINE[target.inclusion_flag];
        if (targetFlag === "extra") { targetId = null; break; }
        if (targetFlag !== "included") return "已含只能指向另計項目：" + targetId;
        targetId = target.included_in_fee_id;
        guard += 1;
        if (guard > 8) return "已含關係過深。";
      }
      if (targetId) return "已含沒有指到另計項目：" + fee.fee_id;
    }
    return null;
  }

  function publish(ledger, spec) {
    spec = spec || {};
    var state = spec.publication_state || "published";
    var items = spec.items || [];
    if (!items.length) return { ok: false, reason: "整案清單是空的，不發布。" };
    var required = spec.required_fee_ids || [];
    var itemIds = items.map(function (item) { return item.fee_id; });
    var missing = required.filter(function (id) { return itemIds.indexOf(id) === -1; });
    if (missing.length) return { ok: false, reason: "必需費用未列入整案清單，不發布：" + missing.join("、") };
    var embedded = [];
    for (var i = 0; i < items.length; i++) {
      var found = versionOf(ledger, items[i].fee_id, items[i].item_version);
      if (!found) return { ok: false, reason: "清單指向不存在的版本：" + items[i].fee_id };
      embedded.push(Contract.clone(found));
    }
    var linkError = checkLinks(embedded);
    if (linkError) return { ok: false, reason: linkError };
    ledger.seq += 1;
    var snapshot = {
      plan_id: spec.plan_id || "plan",
      revision: spec.revision || ledger.publications.length + 1,
      snapshot_id: "snap-" + ledger.seq,
      publication_state: state,
      required_fee_ids: required.slice(),
      items: items.map(function (item) { return { fee_id: item.fee_id, item_version: item.item_version }; }),
      fees: embedded,
      assumptions_ref: spec.assumptions_ref || "",
      signature: spec.signature || "",
      calc_input: spec.calc_input ? Contract.clone(spec.calc_input) : null,
      result_digest: spec.result_digest ? Contract.clone(spec.result_digest) : null,
      published_at: spec.published_at || null,
    };
    ledger.publications.push(snapshot);
    if (state === "published" && spec.activate !== false) ledger.currentSnapshotId = snapshot.snapshot_id;
    return { ok: true, snapshot: snapshot };
  }

  function activeSnapshot(ledger) {
    if (!ledger || !ledger.currentSnapshotId) return null;
    var found = null;
    ledger.publications.forEach(function (snapshot) {
      if (snapshot.snapshot_id === ledger.currentSnapshotId) found = snapshot;
    });
    return found;
  }

  function toEngineFees(fees) {
    return (fees || []).map(function (fee) {
      return {
        id: fee.fee_id,
        version: fee.item_version || 1,
        name: fee.name || fee.fee_type,
        amount: fee.amount,
        currency: fee.currency,
        inclusion: Contract.TO_ENGINE[fee.inclusion_flag] || fee.inclusion_flag,
        required: fee.required !== false,
        source: (fee.source_ref && fee.source_ref.label) || "",
        sourceUrl: (fee.source_ref && fee.source_ref.url) || "",
        assumption: !!fee.assumption,
        note: fee.note || "",
        zeroEvidence: !!fee.zero_evidence,
      };
    });
  }

  function toScenario(snapshot, calc) {
    var deposit = null;
    if (calc.deposit) {
      deposit = {
        amount: calc.deposit.amount,
        currency: calc.deposit.currency,
        paid: calc.deposit.paid,
        part_of_fee_id: calc.deposit.partOfFeeId,
        balance_due: calc.deposit.balanceDue,
      };
    }
    var scenario = {
      module: "C",
      version: "c-mvp-20261112",
      plan_id: snapshot.plan_id,
      revision: snapshot.revision,
      snapshot_id: snapshot.snapshot_id,
      complete: calc.complete,
      currency_out: "TWD",
      known_subtotal_twd: calc.knownSubtotal,
      final_total_twd: calc.finalTotal,
      confirmed_gap_twd: calc.confirmedGap,
      available_funds_twd: calc.available,
      funds_complete: calc.fundsComplete,
      funds: calc.funds,
      loan_amount_twd: calc.loanAmount,
      monthly_payment_twd: calc.monthlyPayment,
      grace_interest_monthly_twd: calc.graceInterestMonthly,
      burden_percent: calc.burdenPercent,
      deposit: deposit,
      fx_rate: calc.fxRate,
      reserve_rate: calc.reserveRate,
      warnings: calc.warnings || [],
    };
    if (!calc.complete && calc.reference) scenario.reference_only = calc.reference;
    return scenario;
  }

  function feeKey(programme, slug) {
    return programme.school_id + ":" + programme.program_id + ":" + slug;
  }

  function fromEngineFee(engineFee, programme, lengthAssumption) {
    var inclusion = Contract.TO_ZH[engineFee.inclusion] || "待確認";
    var source = {
      label: engineFee.source || "",
      url: engineFee.sourceUrl || "",
      retrieved: "2026-11-12",
    };
    if (engineFee.id === "school-insurance") {
      source = {
        label: programme.insurance.source.label,
        url: programme.insurance.source.url,
        retrieved: programme.insurance.source.retrieved,
        record: programme.insurance.source.record,
      };
    } else if (engineFee.assumption && !source.url) {
      source = {
        label: "專題原稿示例（假設，不是官價）",
        url: Contract.MANUSCRIPT_URL,
        retrieved: "2026-11-12",
        record: "C-20261109-atlas-m01",
      };
    }
    var assumption = !!engineFee.assumption;
    if (engineFee.id === "ihs" && lengthAssumption) assumption = true;
    return {
      fee_id: feeKey(programme, engineFee.id),
      school_id: programme.school_id,
      program_id: programme.program_id,
      intake: programme.intake,
      coverage_start: programme.coverage_start,
      coverage_end: programme.coverage_end,
      fee_type: engineFee.name || engineFee.id,
      name: engineFee.name || engineFee.id,
      currency: engineFee.currency,
      amount: Contract.hasOwn(engineFee, "amount") ? engineFee.amount : null,
      status: inclusion === "待確認" ? "待查" : "已查明",
      inclusion_flag: inclusion,
      included_in_fee_id: inclusion === "已含" ? feeKey(programme, "tuition") : null,
      source_ref: source,
      assumption: assumption,
      required: engineFee.required !== false,
      zero_evidence: !!engineFee.zeroEvidence,
      note: engineFee.id === "school-insurance" ? (programme.insurance.source.note || "") : (engineFee.note || ""),
      source_record_id: source.record || "",
    };
  }

  function discountFee(programme, funding) {
    var applied = funding.applied;
    return {
      fee_id: feeKey(programme, "school-discount"),
      school_id: programme.school_id,
      program_id: programme.program_id,
      intake: programme.intake,
      coverage_start: programme.coverage_start,
      coverage_end: programme.coverage_end,
      fee_type: "校方學費減免",
      name: "校方學費減免（" + (applied.name_zh || applied.name) + "）",
      currency: "GBP",
      amount: applied.amount_gbp,
      status: "已查明",
      inclusion_flag: "已含",
      included_in_fee_id: feeKey(programme, "tuition"),
      source_ref: {
        label: applied.source.label,
        url: applied.source.url,
        retrieved: applied.source.retrieved,
        record: applied.source.record,
      },
      assumption: false,
      required: false,
      zero_evidence: false,
      note: "已反映在淨學費 £" + funding.net_tuition_gbp + "（公告 £" + funding.gross_tuition_gbp + "）。不再列入資金。",
      source_record_id: applied.source.record || "",
    };
  }

  function buildStudentPlan(input, ledger) {
    input = input || {};
    ledger = ledger || createLedger();
    var programme = B.getProgramme(input.programmeId || "uog-dsai-2027");
    if (!programme) return { ok: false, error: "找不到這個學程。" };
    if (input.fxRate === null || input.fxRate === undefined || input.fxRate === "") {
      return { ok: false, error: "匯率未填。不能把缺的匯率當成 0 或 1。" };
    }
    if (input.reserveRate === null || input.reserveRate === undefined || input.reserveRate === "") {
      return { ok: false, error: "預備金未填。不能當成 0。" };
    }
    var funding = B.resolveFunding(programme, input.awardedScholarshipIds || []);
    var livingKnown = input.livingMonthlyGbp !== null && input.livingMonthlyGbp !== undefined && input.livingMonthlyGbp !== "" &&
      input.livingMonths !== null && input.livingMonths !== undefined && input.livingMonths !== "";
    var courseLength = input.courseLengthMonths === undefined ? programme.course_length_months : input.courseLengthMonths;
    var lengthAssumption = !!programme.course_length_assumption || (input.courseLengthMonths !== undefined && input.courseLengthMonths !== programme.course_length_months);
    var built = C.buildStudentFees({
      tuitionGbp: funding.net_tuition_gbp,
      depositGbp: programme.deposit.amount,
      courseLengthMonths: courseLength,
      livingMonthlyGbp: livingKnown ? input.livingMonthlyGbp : 0,
      livingMonths: livingKnown ? input.livingMonths : 0,
      otherGbp: 0,
      twdExpenses: input.twdExpenses === null || input.twdExpenses === undefined ? "" : input.twdExpenses,
      schoolInsuranceFlag: "pending",
      tuitionSource: programme.tuition.source,
      depositSource: programme.deposit.source,
      tuitionAssumption: false,
    });
    var engineFees = built.fees.filter(function (fee) {
      return fee.id !== "other-gbp" && fee.id !== "commercial-insurance";
    });
    engineFees.forEach(function (fee) {
      if (fee.id === "living" && !livingKnown) {
        fee.amount = null;
        fee.inclusion = "pending";
        fee.assumption = true;
        fee.note = "生活費未填，不當 0。";
      }
      if (fee.id === "tuition" && funding.applied) {
        fee.note = "公告學費 £" + funding.gross_tuition_gbp + "。已核定減免 £" + funding.applied.amount_gbp + " 已反映在這個淨額，不再當資金扣一次。來源仍是學費頁。";
      }
    });
    var contracts = engineFees.map(function (fee) { return fromEngineFee(fee, programme, lengthAssumption); });
    if (funding.applied) contracts.push(discountFee(programme, funding));
    for (var i = 0; i < contracts.length; i++) {
      var check = Contract.validateFeeInput(contracts[i]);
      if (!check.ok) return { ok: false, error: check.reason };
    }
    contracts.forEach(function (fee) { submitFee(ledger, fee); });

    var scholarshipCash = input.confirmedScholarshipTwd === null || input.confirmedScholarshipTwd === undefined || input.confirmedScholarshipTwd === ""
      ? null
      : input.confirmedScholarshipTwd;
    var calcInput = {
      fxRate: input.fxRate,
      reserveRate: input.reserveRate,
      funds: {
        savings: input.savings === undefined ? null : input.savings,
        family: input.family === undefined ? null : input.family,
        scholarship: scholarshipCash === null ? null : scholarshipCash,
      },
      deposit: {
        amount: programme.deposit.amount,
        currency: "GBP",
        paid: input.depositPaid === undefined ? null : input.depositPaid,
        partOfFeeId: feeKey(programme, "tuition"),
      },
      loan: input.loan || { annualRate: null, termMonths: null, graceMonths: null },
      incomeMonthly: input.incomeMonthly === undefined ? null : input.incomeMonthly,
    };
    var assumptionsRef = JSON.stringify({
      programme: programme.id,
      awarded: (input.awardedScholarshipIds || []).slice().sort(),
      calc: calcInput,
    });
    var items = contracts.map(function (fee) {
      var bucket = ledger.fees[fee.fee_id];
      var latest = bucket.versions[bucket.versions.length - 1];
      return { fee_id: fee.fee_id, item_version: latest.item_version };
    });
    var signature = items.map(function (item) { return item.fee_id + "@" + item.item_version; }).sort().join("|") + "||" + assumptionsRef;
    var current = activeSnapshot(ledger);
    if (current && current.signature === signature) {
      return pack(ledger, current, programme, funding, C.calculatePlan(Object.assign({ fees: toEngineFees(current.fees) }, current.calc_input)), !!input.hasUkAccount);
    }
    var previewFees = items.map(function (item) { return versionOf(ledger, item.fee_id, item.item_version); });
    var calc = C.calculatePlan(Object.assign({ fees: toEngineFees(previewFees) }, calcInput));
    var required = ["tuition", "ihs", "visa-fee", "living", "twd-expenses", "school-insurance"].map(function (slug) {
      return feeKey(programme, slug);
    });
    var published = publish(ledger, {
      plan_id: programme.id,
      revision: ledger.publications.length + 1,
      required_fee_ids: required,
      items: items,
      assumptions_ref: assumptionsRef,
      signature: signature,
      calc_input: calcInput,
      result_digest: {
        known_subtotal: calc.knownSubtotal,
        final_total: calc.finalTotal,
        confirmed_gap: calc.confirmedGap,
        complete: calc.complete,
        balance_due: calc.deposit ? calc.deposit.balanceDue : null,
        programme_id: programme.id,
      },
    });
    if (!published.ok) return { ok: false, error: published.reason };
    return pack(ledger, published.snapshot, programme, funding, calc, !!input.hasUkAccount);
  }

  function pack(ledger, snapshot, programme, funding, calc, hasUkAccount) {
    var scenario = toScenario(snapshot, calc);
    funding.warnings.forEach(function (warning) { scenario.warnings.push(warning); });
    var payments = D.compare({
      school_id: programme.school_id,
      balance_due: calc.deposit ? calc.deposit.balanceDue : null,
      balance_currency: "GBP",
      deposit_amount: programme.deposit.amount,
      deposit_currency: "GBP",
      deposit_paid: calc.deposit ? calc.deposit.paid : null,
      has_uk_account: !!hasUkAccount,
    });
    var review = E.review({
      scenario: scenario,
      lines: calc.lines,
      payments: payments,
      scholarship: funding,
    });
    return {
      ok: true,
      programme: programme,
      scholarship: funding,
      publication: snapshot,
      publications: ledger.publications,
      calc: calc,
      scenario: scenario,
      payments: payments,
      review: review,
    };
  }

  return {
    createLedger: createLedger,
    submitFee: submitFee,
    publish: publish,
    activeSnapshot: activeSnapshot,
    toEngineFees: toEngineFees,
    toScenario: toScenario,
    buildStudentPlan: buildStudentPlan,
  };
});
