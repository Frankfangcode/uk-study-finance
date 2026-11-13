/**
 * A｜快照發布與學生彙整。
 * C 只吃已發布的那一版。未發布的新金額不混進來。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(
      require("../c/engine.js"),
      require("../../shared/contract.js"),
      require("../../shared/constants.js"),
      require("../b/programmes.js")
    );
  } else {
    root.AModule = factory(root.CModule, root.Contract, root.SharedConstants, root.BModule);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (C, Contract, Constants, B) {
  "use strict";

  function createWorkspace() {
    return {
      fees: {},
      tainted: {},
      published: [],
      drafts: [],
      currentSnapshotId: null,
    };
  }

  function versionKey(id, version) {
    return id + "@" + version;
  }

  function findVersion(ws, id, version) {
    var list = ws.fees[id] || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].item_version === version) return list[i];
    }
    return null;
  }

  function ingest(ws, fee) {
    var error = Contract.validateFeeSnapshot(fee);
    if (error) return { ok: false, error: error };
    var copy = Contract.clone(fee);
    var existing = findVersion(ws, copy.fee_id, copy.item_version);
    if (existing) {
      if (Contract.contentKey(existing) === Contract.contentKey(copy)) {
        return { ok: true, idempotent: true, fee: Contract.clone(existing) };
      }
      ws.tainted[versionKey(copy.fee_id, copy.item_version)] = true;
      return {
        ok: false,
        conflict: true,
        error: "同 fee_id 同版本內容不一致，不覆蓋、不累加。",
      };
    }
    if (!ws.fees[copy.fee_id]) ws.fees[copy.fee_id] = [];
    ws.fees[copy.fee_id].push(copy);
    return { ok: true, fee: Contract.clone(copy) };
  }

  function toEngineFee(fee, requiredIds) {
    return {
      id: fee.fee_id,
      version: fee.item_version,
      name: fee.name || fee.fee_type,
      amount: fee.amount,
      currency: fee.currency,
      inclusion: Contract.toEngineInclusion(fee.inclusion_flag),
      required: !requiredIds || requiredIds.indexOf(fee.fee_id) !== -1,
      zeroEvidence: !!fee.zero_evidence,
      source: (fee.source_ref && (fee.source_ref.label || fee.source_ref.url)) || "",
      sourceUrl: (fee.source_ref && fee.source_ref.url) || "",
      assumption: !!(fee.assumption || (fee.source_ref && fee.source_ref.assumption)),
      selfReported: !!(fee.source_ref && fee.source_ref.self_reported),
      note: fee.note || (fee.source_ref && fee.source_ref.note) || "",
    };
  }

  function runSnapshot(snapshot) {
    var fees = snapshot.items.map(function (item) {
      return toEngineFee(item.fee, snapshot.required_fee_ids);
    });
    var assumptions = snapshot.assumptions || {};
    var plan = C.calculatePlan({
      fees: fees,
      fxRate: assumptions.fxRate,
      reserveRate: assumptions.reserveRate,
      funds: assumptions.funds,
      loan: assumptions.loan,
      deposit: assumptions.deposit,
      incomeMonthly: assumptions.incomeMonthly,
    });
    var scenario = C.toScenario(plan, {
      plan_id: snapshot.plan_id,
      revision: snapshot.revision,
      snapshot_id: snapshot.snapshot_id,
      version: "c-mvp-20261112",
    });
    return { plan: plan, scenario: scenario };
  }

  function findPublished(ws, snapshotId) {
    for (var i = 0; i < ws.published.length; i++) {
      if (ws.published[i].snapshot_id === snapshotId) return ws.published[i];
    }
    return null;
  }

  function current(ws) {
    if (!ws.currentSnapshotId) return null;
    var snapshot = findPublished(ws, ws.currentSnapshotId);
    if (!snapshot) return null;
    var ran = runSnapshot(snapshot);
    return {
      snapshot: Contract.clone(snapshot),
      plan: ran.plan,
      scenario: ran.scenario,
    };
  }

  function publish(ws, body) {
    body = body || {};
    if (!body.plan_id || !body.snapshot_id || !body.publication_state) {
      return { ok: false, switched: false, error: "缺 plan_id、snapshot_id 或 publication_state。" };
    }
    if (!body.items || !body.items.length) {
      return { ok: false, switched: false, error: "整案清單是空的，不發布。" };
    }
    var resolved = [];
    for (var i = 0; i < body.items.length; i++) {
      var item = body.items[i];
      var fee = findVersion(ws, item.fee_id, item.item_version);
      if (!fee) {
        return {
          ok: false,
          switched: false,
          error: "清單引用不存在的版本：" + item.fee_id + " v" + item.item_version,
        };
      }
      if (ws.tainted[versionKey(item.fee_id, item.item_version)]) {
        return { ok: false, switched: false, error: "該版本有衝突，不能發布：" + item.fee_id };
      }
      resolved.push({ fee_id: item.fee_id, item_version: item.item_version, fee: Contract.clone(fee) });
    }
    var required = body.required_fee_ids || [];
    for (var r = 0; r < required.length; r++) {
      var present = false;
      for (var k = 0; k < resolved.length; k++) if (resolved[k].fee_id === required[r]) present = true;
      if (!present) {
        return { ok: false, switched: false, error: "必需費用不在清單內：" + required[r] + "。不切換。" };
      }
    }
    var programId = resolved[0].fee.program_id;
    for (var p = 1; p < resolved.length; p++) {
      if (resolved[p].fee.program_id !== programId) {
        return { ok: false, switched: false, error: "不同學程不能放進同一個快照。" };
      }
    }
    var graphError = Contract.inclusionGraphError(resolved.map(function (item) { return item.fee; }));
    if (graphError) return { ok: false, switched: false, error: graphError };

    var snapshot = {
      plan_id: body.plan_id,
      revision: body.revision,
      snapshot_id: body.snapshot_id,
      publication_state: body.publication_state,
      required_fee_ids: required.slice(),
      items: resolved,
      assumptions_ref: body.assumptions_ref || null,
      assumptions: Contract.clone(body.assumptions || {}),
      published_at: body.published_at || null,
      program_id: programId,
    };

    if (body.publication_state === "draft") {
      ws.drafts.push(snapshot);
      var stayed = current(ws);
      return { ok: true, switched: false, snapshot: Contract.clone(snapshot), plan: stayed && stayed.plan, scenario: stayed && stayed.scenario };
    }
    if (body.publication_state !== "published") {
      return { ok: false, switched: false, error: "publication_state 只能是 draft 或 published。" };
    }
    if (findPublished(ws, snapshot.snapshot_id)) {
      return { ok: false, switched: false, error: "已發布的快照不能原地改。" };
    }
    ws.published.push(snapshot);
    ws.currentSnapshotId = snapshot.snapshot_id;
    var ran = runSnapshot(snapshot);
    return {
      ok: true,
      switched: true,
      snapshot: Contract.clone(snapshot),
      plan: ran.plan,
      scenario: ran.scenario,
    };
  }

  function fundingCheck(input) {
    input = input || {};
    var fx = C.asNum(input.fxRate);
    var waiverGbp = C.asNum(input.waiverGbp) || 0;
    var manual = C.asNum(input.scholarshipTwd);
    if (manual === null) manual = 0;
    var waiverTwd = waiverGbp > 0 && fx ? Math.round(waiverGbp * fx) : 0;
    if (input.waiverNettedInTuition && waiverTwd > 0 && manual > 0) {
      return {
        ok: false,
        scholarshipTwd: null,
        waiverTwd: waiverTwd,
        reason: "減免已反映在淨學費，不得再當資金扣一次。",
      };
    }
    if (input.awarded && waiverTwd > 0 && manual === waiverTwd) {
      return {
        ok: true,
        scholarshipTwd: waiverTwd,
        waiverTwd: waiverTwd,
        warning: "減免金額與現金欄相同，只計一次。",
      };
    }
    var counted = manual + (input.awarded && !input.waiverNettedInTuition ? waiverTwd : 0);
    return { ok: true, scholarshipTwd: counted, waiverTwd: input.awarded ? waiverTwd : 0, warning: null };
  }

  function normalizeStudentFee(fee) {
    var copy = {
      id: fee.id,
      version: fee.version,
      name: fee.name,
      amount: fee.amount,
      currency: fee.currency,
      inclusion: fee.inclusion,
      required: fee.required,
      zeroEvidence: fee.zeroEvidence,
      source: fee.source,
      sourceUrl: fee.sourceUrl,
      assumption: fee.assumption,
      selfReported: !!fee.selfReported,
      note: fee.note || "",
    };
    // 學生自報必須真的有來源說明，否則不算自報，照沒有來源處理。
    if (copy.selfReported && !(typeof copy.source === "string" && copy.source.trim())) copy.selfReported = false;
    if (copy.inclusion === "none" && !copy.zeroEvidence) {
      copy.inclusion = "pending";
      copy.amount = null;
      copy.note += " 沒有零費證據，不能當成 0。";
      return copy;
    }
    if (copy.inclusion === "extra" && (copy.amount === null || copy.amount === undefined)) {
      copy.inclusion = "pending";
      copy.amount = null;
      return copy;
    }
    if (copy.inclusion === "extra" && !copy.assumption && !copy.sourceUrl && !copy.selfReported) {
      copy.inclusion = "pending";
      copy.amount = null;
      copy.note += " 沒有來源，不能當成確定金額。";
      return copy;
    }
    if (copy.inclusion === "included" && (copy.amount === null || copy.amount === undefined)) {
      copy.inclusion = "pending";
      copy.amount = null;
      copy.note += " 已含但沒有金額，先標待確認。";
    }
    return copy;
  }

  function feeFromEngine(fee, programme) {
    var flag = Contract.fromEngineInclusion(fee.inclusion);
    var source = {
      label: fee.source || "",
      url: fee.sourceUrl || "",
      assumption: !!fee.assumption,
      note: fee.note || "",
      consulted: Constants.CONSULTED,
    };
    if (fee.selfReported) source.self_reported = true;
    return {
      fee_id: fee.id,
      item_version: fee.version || 1,
      school_id: programme.school_id,
      program_id: programme.program_id,
      intake: programme.intake,
      coverage_start: programme.intake,
      coverage_end: null,
      fee_type: fee.name || fee.id,
      name: fee.name || fee.id,
      currency: fee.currency,
      amount: fee.amount === undefined ? null : fee.amount,
      status: flag === "待確認" ? "待查" : "已查明",
      inclusion_flag: flag,
      included_in_fee_id: flag === "已含" ? "tuition" : null,
      source_ref: source,
      zero_evidence: !!fee.zeroEvidence,
      assumption: !!fee.assumption,
      note: fee.note || "",
    };
  }

  function buildStudentPlan(opts) {
    opts = opts || {};
    var programme = opts.programme;
    if (!programme || programme.status === "待核對" || programme.tuition == null || programme.tuition.amount == null) {
      return { ok: false, error: "這個學程還不能發布快照。", scenario: null };
    }
    var assumptions = opts.assumptions || {};
    var insurance = opts.insurance || {};
    var built = C.buildStudentFees({
      tuitionGbp: programme.tuition.amount,
      depositGbp: programme.deposit.amount,
      courseLengthMonths: programme.course_length_months,
      livingMonthlyGbp: assumptions.livingMonthlyGbp,
      livingMonths: assumptions.livingMonths,
      otherGbp: assumptions.otherGbp,
      twdExpenses: assumptions.twdExpenses,
      schoolInsuranceGbp: (insurance.flag || "pending") === "pending" ? null : insurance.amount,
      schoolInsuranceFlag: insurance.flag || "pending",
      schoolInsuranceZeroEvidence: !!insurance.zeroEvidence,
      schoolInsuranceSource: insurance.source || null,
      tuitionSource: {
        label: programme.tuition.source.label,
        url: programme.tuition.source.url,
      },
      depositSource: {
        label: programme.deposit.source.label,
        url: programme.deposit.source.url,
      },
      tuitionAssumption: !!opts.tuitionAssumption,
      depositAssumption: !!opts.depositAssumption,
    });
    var funding = fundingCheck({
      fxRate: assumptions.fxRate,
      waiverGbp: opts.awardedWaiverGbp || 0,
      scholarshipTwd: assumptions.manualScholarshipTwd,
      awarded: !!opts.awardedWaiverGbp,
      waiverNettedInTuition: !!opts.waiverNettedInTuition,
    });
    if (!funding.ok) return { ok: false, error: funding.reason, funding: funding };

    var ws = createWorkspace();
    var snapshots = [];
    var rejected = [];
    var rejectedDetail = [];
    built.fees.forEach(function (fee) {
      var normal = normalizeStudentFee(fee);
      var snap = feeFromEngine(normal, programme);
      var saved = ingest(ws, snap);
      if (saved.ok) {
        snapshots.push(snap);
        return;
      }
      // 契約拒收：把真正的原因留在這一列，金額撤成待確認，
      // 不讓整案只剩「必需費用不在清單內」。
      var name = normal.name || normal.id;
      var detail = { id: normal.id, name: name, reason: saved.error, kept_as_pending: false };
      rejected.push(name + "：" + saved.error);
      rejectedDetail.push(detail);
      var fallback = normalizeStudentFee(fee);
      fallback.inclusion = "pending";
      fallback.amount = null;
      fallback.zeroEvidence = false;
      fallback.note = "契約檢查拒收這一筆：" + saved.error + "。先標待確認，不計入總額。";
      var fallbackSnap = feeFromEngine(fallback, programme);
      if (ingest(ws, fallbackSnap).ok) {
        detail.kept_as_pending = true;
        snapshots.push(fallbackSnap);
      }
    });
    if (!snapshots.length) return { ok: false, error: rejected.join(" ") || "沒有可發布的費用。" };

    var funds = {
      savings: C.asNum(assumptions.savings) || 0,
      family: C.asNum(assumptions.family) || 0,
      scholarship: funding.scholarshipTwd || 0,
    };
    var published = publish(ws, {
      plan_id: "plan-" + programme.program_id,
      revision: 1,
      snapshot_id: opts.snapshot_id || "snap-" + programme.program_id,
      publication_state: "published",
      required_fee_ids: ["tuition", "ihs", "visa-fee", "living", "twd-expenses", "school-insurance"],
      items: snapshots.map(function (fee) {
        return { fee_id: fee.fee_id, item_version: fee.item_version };
      }),
      assumptions_ref: "student-entry-20261112",
      published_at: opts.published_at || "2026-11-12T09:00:00+08:00",
      assumptions: {
        fxRate: assumptions.fxRate,
        reserveRate: assumptions.reserveRate,
        funds: funds,
        loan: assumptions.loan || null,
        incomeMonthly: assumptions.incomeMonthly,
        deposit: {
          amount: programme.deposit.amount,
          currency: programme.deposit.currency || "GBP",
          paid: opts.depositPaid,
          partOfFeeId: "tuition",
        },
      },
    });
    published.funding = funding;
    published.programme = {
      school_id: programme.school_id,
      program_id: programme.program_id,
      program_name: programme.program_name,
      program_name_zh: programme.program_name_zh,
      school_name_zh: programme.school_name_zh,
      intake: programme.intake,
    };
    published.ihs = built.ihs;
    published.warnings = rejected;
    published.rejected = rejectedDetail;
    if (!published.ok && rejected.length) {
      published.error = "契約檢查拒收：" + rejected.join("；") + "。" + (published.error ? "（" + published.error + "）" : "");
    }
    return published;
  }

  function summarize(published, review) {
    var scenario = published && published.scenario;
    var blocked = review && (review.verdict === "退修" || review.verdict === "轉真人") && review.pending && review.pending.length;
    var showFinal = !!(scenario && scenario.complete && review && review.verdict === "PASS");
    if (review && review.blockers && review.blockers.length) showFinal = false;
    return {
      snapshot_id: scenario && scenario.snapshot_id,
      complete: showFinal,
      known_subtotal_twd: scenario && scenario.known_subtotal_twd,
      final_total_twd: showFinal ? scenario.final_total_twd : null,
      confirmed_gap_twd: showFinal ? scenario.confirmed_gap_twd : null,
      loan_amount_twd: showFinal ? scenario.loan_amount_twd : null,
      monthly_payment_twd: showFinal ? scenario.monthly_payment_twd : null,
      reference_only: showFinal ? null : scenario && scenario.reference_only,
      formal_demo: "尚未放行",
      blocked_by_pending: !!blocked,
    };
  }

  return {
    createWorkspace: createWorkspace,
    ingest: ingest,
    publish: publish,
    current: current,
    fundingCheck: fundingCheck,
    buildStudentPlan: buildStudentPlan,
    summarize: summarize,
  };
});
