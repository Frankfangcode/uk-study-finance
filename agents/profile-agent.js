/**
 * A agent｜個人資料與快照。
 * 檢查學生填的個人資料，再請 A 模組（AModule.buildStudentPlan）為每個選定的學程發布快照。
 * 數字全部來自學生輸入與 A 模組的輸出，這裡不做任何計算。
 *
 * 個案（ctx.state）沿用引導流程的格式：{ profile, selected, awards, pending, demo }。
 * 欄位檢查用引導流程既有的 validateProfile／insuranceFor，不另寫一套。
 * 發布快照需要學程紀錄，所以這裡會讀 BModule.buildOutput（跟引導流程的做法相同）；
 * 學程本身的說明由 B agent 負責。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(
      require("./base.js"),
      require("../modules/a/aggregate.js"),
      require("../modules/b/programmes.js"),
      require("../modules/guided/flow.js")
    );
  } else {
    root.ProfileAgent = factory(root.AgentBase, root.AModule, root.BModule, root.GuidedFlow);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (Base, A, B, G) {
  "use strict";

  var twd = Base.twd;
  var gbp = Base.gbp;

  function schoolOf(programme) {
    return (programme && (programme.school_name_zh || programme.school_name || programme.key)) || "未命名學校";
  }

  /** 跟引導流程 evaluate 相同的輸入，交給 A.buildStudentPlan。 */
  function publish(state, key, v) {
    var programme = B.buildOutput(key);
    if (!programme || !programme.tuition || programme.tuition.amount == null) {
      return { ok: false, error: "這個學程還不能試算。", programme: programme ? { school_name_zh: programme.school_name_zh } : null };
    }
    var intakeYear = parseInt(String(programme.intake || ""), 10);
    var yearMismatch = !isFinite(intakeYear) || intakeYear !== v.intakeYear;
    programme.course_length_months = v.courseMonths;
    var awards = (state.awards && state.awards[key]) || {};
    var schoolAwards = (programme.scholarships || []).filter(function (item) { return !!awards[item.id]; });
    var waiverGbp = schoolAwards.reduce(function (sum, item) { return sum + (item.amount_gbp || 0); }, 0);
    var published = A.buildStudentPlan({
      programme: programme,
      depositPaid: null,
      insurance: G.insuranceFor(state, key),
      awardedWaiverGbp: waiverGbp,
      tuitionAssumption: yearMismatch,
      depositAssumption: yearMismatch,
      snapshot_id: "snap-agent-" + programme.program_id,
      assumptions: {
        fxRate: v.fxRate,
        reserveRate: v.reservePct / 100,
        livingMonthlyGbp: v.livingMonthly,
        livingMonths: v.livingMonths,
        otherGbp: v.otherGbp,
        twdExpenses: v.twdExpenses,
        savings: v.savings,
        family: v.family,
        manualScholarshipTwd: (v.awardedTwd || 0) + (v.otherScholarshipTwd || 0),
        incomeMonthly: null,
        loan: { annualRate: v.ratePct / 100, termMonths: v.termMonths, graceMonths: 0 },
      },
    });
    published.year_mismatch = yearMismatch;
    published.awarded_school_scholarships = schoolAwards.map(function (item) {
      return { id: item.id, name: item.name, amount_gbp: item.amount_gbp };
    });
    return published;
  }

  function optionalTwd(value) {
    return value === null || value === undefined ? "未填（不計入資金）" : twd(value);
  }

  function compute(ctx) {
    var state = (ctx && ctx.state) || {};
    var selected = (state.selected || []).slice();
    var checked = G.validateProfile(state.profile || {});
    var v = checked.values;
    var data = {
      demo: !!state.demo,
      profile_ok: checked.ok,
      profile: v,
      profile_errors: checked.errors,
      selected: selected,
      snapshots: {},
    };
    var pending = [];
    var text = [];
    if (state.demo) text.push("這是示範用虛構個案：個人資料、資金，以及校方強制保險的來源與金額都是虛構的。");

    if (!checked.ok) {
      Object.keys(checked.errors).forEach(function (id) {
        pending.push({ id: "profile-" + id, label: "個人資料：" + checked.errors[id] });
      });
      text.push("個人資料還沒填好，先不發布快照，後面的成本也不會計算。空白不會被當成零。請先補齊待確認清單裡的欄位。");
      return { data: data, pending: pending, sources: [], template: text.join("\n") };
    }

    text.push("個人資料：預計 " + Base.num(v.intakeYear) + " 年入學，課程 " + Base.num(v.courseMonths) + " 個月。");
    text.push(
      "可用資金（學生自填）：自備款 " + twd(v.savings) + "、家庭支援 " + twd(v.family) +
      "、已核定獎學金 " + optionalTwd(v.awardedTwd) + "、其他已入帳獎學金 " + optionalTwd(v.otherScholarshipTwd) + "。"
    );
    text.push(
      "假設（可以改，不是官方數字）：匯率假設 " + Base.num(v.fxRate) + "（一英鎊換多少台幣）、預備金 " + Base.pct(v.reservePct) +
      "、每月生活費 " + gbp(v.livingMonthly) + "、生活費 " + Base.num(v.livingMonths) + " 個月、其他外幣支出 " + gbp(v.otherGbp) +
      "、台幣支出 " + twd(v.twdExpenses) + "、貸款年利率 " + Base.pct(v.ratePct) + "、攤還 " + Base.num(v.termMonths) +
      " 期、可接受的每月還款上限 " + twd(v.monthlyCap) + "。"
    );

    if (!selected.length) {
      pending.push({ id: "selected", label: "還沒有選學程" });
      text.push("還沒有選學程，所以沒有發布任何快照。");
    }

    var facts = { profile: v, snapshots: {} };
    selected.forEach(function (key) {
      var published = publish(state, key, v);
      data.snapshots[key] = published;
      var school = schoolOf(published.programme);
      if (!published.ok || !published.plan || published.plan.ok === false) {
        var error = (published.plan && published.plan.error) || published.error || "這份方案還不能算。";
        facts.snapshots[key] = { error: error };
        pending.push({ id: key + "-snapshot", label: school + "｜快照沒有發布：" + error });
        text.push(school + "：快照沒有發布。" + error);
        return;
      }
      // 給說明文字比對用：只放快照與資金，不放 C 算出的總額（總額要等 E 審查，由 C agent 說明）。
      facts.snapshots[key] = {
        snapshot: published.snapshot,
        funding: published.funding,
        programme: published.programme,
        ihs: published.ihs,
        warnings: published.warnings,
        rejected: published.rejected,
        available_funds_twd: published.plan.available,
        awarded_school_scholarships: published.awarded_school_scholarships,
      };
      var line = school + "：已發布快照 " + published.snapshot.snapshot_id + "，可用資金合計 " + twd(published.plan.available) + "。";
      if (published.year_mismatch) line += "你填的入學年和本站收錄的公告年度不同，學費與訂金改標成假設。";
      if (published.funding && published.funding.warning) line += published.funding.warning;
      published.awarded_school_scholarships.forEach(function (item) {
        line += "已核定的校方減免 " + item.name + " " + gbp(item.amount_gbp) + " 只計一次。";
      });
      (published.rejected || []).forEach(function (item) {
        line += "契約檢查拒收「" + item.name + "」，這一筆先標待確認。";
      });
      text.push(line);
      var selfReported = [];
      published.snapshot.items.forEach(function (item) {
        var fee = item.fee;
        if (fee.inclusion_flag === "待確認") {
          var guard = school + "的" + fee.name;
          pending.push({ id: key + "-" + fee.fee_id, label: school + "｜" + fee.name, guard: guard });
          text.push(guard + "：待確認，金額是空的，不當成零。");
        } else if (fee.source_ref && fee.source_ref.self_reported) {
          selfReported.push(fee.name);
        }
      });
      if (selfReported.length) text.push(school + "的" + selfReported.join("、") + "：來源是學生自報，非本站查證。");
    });

    return {
      data: data,
      facts: facts,
      pending: pending,
      sources: [
        { label: "個人資料與可用資金", kind: "學生自填" },
        { label: "匯率、預備金、生活費、台幣支出、利率與期數", kind: "假設" },
      ],
      template: text.join("\n"),
    };
  }

  return Base.makeAgent({ id: "profile", module: "A", title: "個人資料與快照（A）", compute: compute });
});
