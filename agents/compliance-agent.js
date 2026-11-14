/**
 * E agent｜來源、假設與待確認的審查。
 * 呼叫 EModule.review 與 EModule.presentLine，審 C 的費用列與整案；結論交回協調者，
 * 由協調者決定 C 的確定值能不能顯示。E 不是 PASS 的學校，說明裡一定寫「尚未確定」。
 *
 * auditSummaries 是最後一道：把每個 agent 定稿的說明再對一次模組資料，確認沒有模組沒算過的數字。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./base.js"), require("../modules/e/review.js"));
  } else {
    root.ComplianceAgent = factory(root.AgentBase, root.EModule);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (Base, E) {
  "use strict";

  var NOT_FINAL = Base.NOT_FINAL;
  var NOT_RELEASED = "尚未放行";
  var BLOCKER_TEXT = {
    "unknown-as-zero": "把未知當成零",
    "zero-without-evidence": "沒有零費證據卻寫成無此費用",
    unsourced: "沒有來源也沒有標成假設",
    "rejected-figure": "用了已排除的對照數字",
    "false-complete": "還有待確認卻宣稱算完",
    "known-as-final": "把已知小計說成確定總額",
    "benchmark-conflict": "基準假設互相衝突",
    catalog: "共用常數表有問題",
  };

  function compute(ctx) {
    ctx = ctx || {};
    var plans = (ctx.c && ctx.c.plans) || {};
    var keys = Object.keys(plans);
    var data = { reviews: {}, lines: {}, formal_demo: NOT_RELEASED };
    var pending = [];
    var text = [];
    var anyBlocked = false;

    if (!keys.length) {
      text.push("沒有可以審查的方案（A 還沒有發布快照）。總成本、缺口、貸款額與月付都" + NOT_FINAL + "。正式 Demo " + NOT_RELEASED + "。");
      return {
        data: data,
        pending: [{ id: "snapshot", label: "沒有可以審查的方案" }],
        sources: [],
        template: text.join("\n"),
        mustInclude: [NOT_FINAL, NOT_RELEASED],
      };
    }

    keys.forEach(function (key) {
      var entry = plans[key];
      var school = entry.school || key;
      if (!entry.ok) {
        anyBlocked = true;
        data.reviews[key] = { verdict: "退修", formal_demo: NOT_RELEASED, blockers: [], pending: [], assumptions: [], self_reported: [], note: entry.error };
        data.lines[key] = [];
        pending.push({ id: key + "-plan", label: school + "｜方案還不能算，無法審查" });
        text.push(school + "：方案還不能算，無法審查。總成本、缺口、貸款額與月付都" + NOT_FINAL + "。");
        return;
      }
      var lines = entry.plan.lines;
      var review = E.review({ lines: lines, scenario: entry.scenario });
      var nameOf = {};
      lines.forEach(function (line) { nameOf[line.id] = line.name; });
      data.reviews[key] = review;
      data.lines[key] = lines.map(function (line) {
        var view = E.presentLine(line);
        return { id: line.id, name: line.name, status: view.status, blocked: view.blocked, reason: view.reason || null, selfReported: !!view.selfReported };
      });
      function named(ids) { return ids.map(function (id) { return nameOf[id] || id; }).join("、"); }

      var line = school + "：審查結果「" + review.verdict + "」。" + review.note;
      if (review.assumptions.length) line += "標成假設的項目：" + named(review.assumptions) + "。";
      if (review.self_reported.length) line += review.self_reported_note + "：" + named(review.self_reported) + "。";
      text.push(line);

      if (review.verdict !== "PASS") {
        anyBlocked = true;
        review.pending.forEach(function (id) {
          var guard = school + "的" + (nameOf[id] || id);
          pending.push({ id: key + "-" + id, label: school + "｜" + (nameOf[id] || id), guard: guard });
          text.push(guard + "：待確認，金額未知，不能當成零。");
        });
        review.blockers.forEach(function (item) {
          text.push(school + "被擋下的項目——" + item.name + "：" + (BLOCKER_TEXT[item.code] || item.code) + "。");
        });
        text.push(school + "的總成本、缺口、貸款額與月付一律" + NOT_FINAL + "，只能看已知小計。");
      }
    });

    text.push("E 只審這份試算的來源與標記，不等於正式放行。正式 Demo " + NOT_RELEASED + "。");
    return {
      data: data,
      pending: pending,
      sources: [{ label: "審查規則：未知不當零、數字要有來源或標假設、已知小計不是確定總額", kind: "E 模組規則" }],
      template: text.join("\n"),
      mustInclude: anyBlocked ? [NOT_FINAL, NOT_RELEASED] : [NOT_RELEASED],
    };
  }

  var agent = Base.makeAgent({ id: "compliance", module: "E", title: "合規審查（E）", compute: compute });

  /** items: [{ prep, result }]。回傳每段定稿說明的檢查結果。 */
  agent.auditSummaries = function (items) {
    var checks = (items || []).map(function (item) {
      var check = Base.verifyFor(item.prep, item.result.summary);
      return { agent: item.result.agent, module: item.result.module, ok: check.ok, problems: check.problems };
    });
    return { ok: checks.every(function (c) { return c.ok; }), checks: checks };
  };

  return agent;
});
