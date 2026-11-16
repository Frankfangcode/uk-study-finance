/**
 * C agent｜成本、缺口、貸款與情境模擬。
 * 吃 A 已發布快照的那一份 plan（A 發布時就是用 CModule.calculatePlan 算的，C 只對已發布的版本計價），
 * 再呼叫 CModule.toScenario 與 CModule.simulateScenarios。這裡不重算、不改任何數字。
 *
 * E 還沒審查、或審查不是 PASS 時（ctx.review 沒有 PASS）：
 *   - 情境模擬不輸出確定值；
 *   - 說明文字一定要有「尚未確定」，而且確定總額、缺口、貸款、月付不列入可引用的數字。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./base.js"), require("../modules/c/engine.js"));
  } else {
    root.CostAgent = factory(root.AgentBase, root.CModule);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (Base, C) {
  "use strict";

  var twd = Base.twd;
  var gbp = Base.gbp;
  var NOT_FINAL = Base.NOT_FINAL;
  var SELF_REPORTED = "學生自報，非本站查證";
  var PLAN_CONFIRMED_KEYS = ["finalTotal", "confirmedGap", "loanAmount", "monthlyPayment", "graceInterestMonthly", "burdenPercent", "reference"];
  var SCENARIO_CONFIRMED_KEYS = ["final_total_twd", "confirmed_gap_twd", "loan_amount_twd", "monthly_payment_twd", "grace_interest_monthly_twd", "burden_percent", "reference_only"];

  function money(amount, currency) {
    return currency === "GBP" ? gbp(amount) : twd(amount);
  }

  function isPendingLine(line) {
    return line.inclusion === "pending" || (!line.known && line.inclusion !== "included");
  }

  function lineText(line) {
    if (line.inclusion === "included") return line.name + " " + money(line.amount, line.currency) + "（已含，不另加）";
    if (line.inclusion === "none") return line.name + "：無此費用（" + (line.selfReported ? SELF_REPORTED : "有零費證據") + "）";
    var tag = line.assumption ? "假設" : line.selfReported ? SELF_REPORTED : line.sourceUrl ? "有來源" : "";
    return line.name + " " + money(line.amount, line.currency) + (tag ? "（" + tag + "）" : "");
  }

  /** 跟引導流程一樣：只有已核定的獎學金才進「落空」情境。 */
  function awardedFor(state, published) {
    var v = (state && state.profileValues) || {};
    var funding = published.funding || {};
    var list = [];
    if (v.awardedTwd > 0 && !funding.warning) {
      list.push({ id: "student-awarded", name: "已核定獎學金", amount: v.awardedTwd, currency: "TWD", countedTwd: v.awardedTwd });
    }
    var school = published.awarded_school_scholarships || [];
    var waiverGbp = school.reduce(function (sum, item) { return sum + (item.amount_gbp || 0); }, 0);
    if (waiverGbp > 0 && funding.waiverTwd > 0) {
      list.push({ id: school[0].id, name: school[0].name, amount: waiverGbp, currency: "GBP", countedTwd: funding.waiverTwd });
    }
    return list;
  }

  function hideConfirmed(entry) {
    var copy = Base.clone(entry);
    PLAN_CONFIRMED_KEYS.forEach(function (k) { if (copy.plan && k in copy.plan) copy.plan[k] = null; });
    SCENARIO_CONFIRMED_KEYS.forEach(function (k) { if (copy.scenario && k in copy.scenario) copy.scenario[k] = null; });
    return copy;
  }

  function compute(ctx) {
    ctx = ctx || {};
    var a = ctx.a || {};
    var snapshots = a.snapshots || {};
    var reviews = ctx.review || null;
    var profile = a.profile || {};
    var data = { reviewed: !!reviews, plans: {} };
    var facts = { plans: {} };
    var pending = [];
    var sources = [];
    var text = [];
    var anyUnreleased = false;
    var keys = (a.selected || []).filter(function (key) { return !!snapshots[key]; });

    if (!keys.length) {
      text.push("A 還沒有發布任何快照，所以沒有成本可以說明。總成本、缺口、貸款額與月付都" + NOT_FINAL + "。");
      return { data: data, pending: [{ id: "snapshot", label: "A 還沒有發布快照" }], sources: [], template: text.join("\n"), mustInclude: [NOT_FINAL] };
    }

    keys.forEach(function (key) {
      var published = snapshots[key];
      var school = (published.programme && published.programme.school_name_zh) || key;
      var plan = published.plan;
      if (!published.ok || !plan || plan.ok === false) {
        anyUnreleased = true;
        var error = (plan && plan.error) || published.error || "這份方案還不能算。";
        data.plans[key] = { school: school, ok: false, error: error };
        facts.plans[key] = data.plans[key];
        pending.push({ id: key + "-plan", label: school + "｜方案還不能算：" + error });
        text.push(school + "：方案還不能算（" + error + "）總成本、缺口、貸款額與月付都" + NOT_FINAL + "。");
        return;
      }

      var scenario = C.toScenario(plan, {
        plan_id: published.snapshot.plan_id,
        revision: published.snapshot.revision,
        snapshot_id: published.snapshot.snapshot_id,
      });
      var review = reviews && reviews[key];
      var released = !!(scenario.complete && review && review.verdict === "PASS" && !(review.blockers && review.blockers.length));
      var sim = C.simulateScenarios(plan, {
        fxShockPct: Base.isNum(ctx.fxShockPct) ? ctx.fxShockPct : C.asNum(ctx.state && ctx.state.profile && ctx.state.profile.fxShockPct),
        awardedScholarships: awardedFor({ profileValues: profile }, published),
        reviewVerdict: released ? review.verdict : "未放行",
      });
      var cap = Base.isNum(profile.monthlyCap) ? profile.monthlyCap : null;
      var entry = {
        school: school,
        ok: true,
        snapshot_id: scenario.snapshot_id,
        released: released,
        release_note: released
          ? "E 審查 PASS，確定值可以顯示。"
          : !reviews
            ? "E 還沒審查，確定值先不顯示。"
            : !scenario.complete
              ? "還有待確認的必要費用。"
              : "E 審查不是 PASS。",
        plan: plan,
        scenario: scenario,
        sim: sim,
        monthly_cap_twd: cap,
        within_monthly_cap: released && cap !== null && Base.isNum(plan.monthlyPayment) ? plan.monthlyPayment <= cap : null,
      };
      data.plans[key] = entry;
      facts.plans[key] = released ? entry : hideConfirmed(entry);
      if (!released) anyUnreleased = true;

      var known = [];
      plan.lines.forEach(function (line) {
        if (isPendingLine(line)) {
          pending.push({ id: key + "-" + line.id, label: school + "｜" + line.name, guard: school + "的" + line.name });
          return;
        }
        known.push(lineText(line));
        if (line.sourceUrl) sources.push({ label: school + " " + line.name, url: line.sourceUrl, kind: "有來源" });
        else if (line.assumption) sources.push({ label: school + " " + line.name, kind: "假設" });
        else if (line.selfReported) sources.push({ label: school + " " + line.name + "：" + line.source, kind: SELF_REPORTED });
      });

      text.push(school + "（快照 " + scenario.snapshot_id + "）費用：" + known.join("、") + "。");
      plan.lines.filter(isPendingLine).forEach(function (line) {
        text.push(school + "的" + line.name + "：待確認，金額未知，不當成零，也不計入小計。");
      });
      text.push(
        "以匯率假設 " + Base.num(plan.fxRate) + "、預備金 " + Base.pct(plan.reserveRate * 100) + "（假設）換算，已知小計 " +
        twd(plan.knownSubtotal) + "，可用資金 " + twd(plan.available) + "。"
      );

      if (released) {
        var result = "E 審查通過，確定值：總成本 " + twd(plan.finalTotal) + "，缺口 " + twd(plan.confirmedGap);
        if (plan.loanAmount > 0) {
          result += "，建議貸款額 " + twd(plan.loanAmount) + "（缺口向上取整到萬元）";
          if (Base.isNum(plan.monthlyPayment)) {
            result += "，估算月付 " + twd(plan.monthlyPayment) + "（年利率 " + Base.pct(plan.annualRate * 100) + "、" +
              Base.num(plan.termMonths) + " 期，都是假設，不保證核貸）";
          }
          result += "。";
          if (entry.within_monthly_cap !== null) {
            result += "估算月付" + (entry.within_monthly_cap ? "沒有超過" : "超過了") + "你設定的每月還款上限 " + twd(cap) + "。";
          }
        } else {
          result += "，可用資金足以支應，不需要貸款。";
        }
        text.push(result);
      } else {
        text.push(school + "的總成本、缺口、貸款額與月付：" + NOT_FINAL + "（" + entry.release_note + "）已知小計不是確定總額。");
      }

      if (!sim.ok) {
        text.push("情境模擬沒有執行：" + sim.error);
      } else {
        var parts = sim.scenarios.filter(function (item) { return item.id !== "baseline"; }).map(function (item) {
          if (sim.confirmed) {
            return item.label + "：總成本 " + twd(item.finalTotal) + "、缺口 " + twd(item.confirmedGap) +
              "、貸款額 " + twd(item.loanAmount) + "、月付 " + twd(item.monthlyPayment);
          }
          return item.label + "：已知小計 " + twd(item.knownSubtotal) + "、可用資金 " + twd(item.available);
        });
        text.push(
          "情境模擬（演練，不是預測）——" + parts.join("；") + "。" +
          (sim.confirmed ? "" : "各情境的總成本、缺口、貸款額與月付都" + NOT_FINAL + "。") + sim.scholarshipNote
        );
      }
    });

    return {
      data: data,
      facts: facts,
      pending: pending,
      sources: sources,
      template: text.join("\n"),
      mustInclude: anyUnreleased ? [NOT_FINAL] : [],
    };
  }

  return Base.makeAgent({ id: "cost", module: "C", title: "成本、缺口與情境模擬（C）", compute: compute });
});
