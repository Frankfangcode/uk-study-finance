/**
 * 協調者：依序呼叫 A→B→C→D→E 五個 agent，把結果交給 E 審核，最後組成一份回覆。
 *
 * 流程分兩段：
 *   1. 計算：A→B→C→D→E 依序讓各自的模組算出 data。C 在 E 審查前不輸出確定值。
 *   2. 放行與說明：拿到 E 的審查結論後，請 C 依結論重整一次（PASS 才顯示確定值，否則「尚未確定」），
 *      再依 A→B→C→D→E 的順序產生說明文字；每段說明都過數字檢查，最後由 E agent 再對一次。
 *
 * 協調者自己不算數字，也不寫數字：回覆裡的數字只會出現在各 agent 已檢查過的說明裡。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(
      require("./base.js"),
      require("./model.js"),
      require("./profile-agent.js"),
      require("./programme-agent.js"),
      require("./cost-agent.js"),
      require("./finance-agent.js"),
      require("./compliance-agent.js"),
      require("../modules/guided/flow.js")
    );
  } else {
    root.AgentCoordinator = factory(
      root.AgentBase, root.AgentModel, root.ProfileAgent, root.ProgrammeAgent,
      root.CostAgent, root.FinanceAgent, root.ComplianceAgent, root.GuidedFlow
    );
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (Base, Model, Profile, Programme, Cost, Finance, Compliance, G) {
  "use strict";

  var AGENTS = [Profile, Programme, Cost, Finance, Compliance];
  var ORDER = AGENTS.map(function (agent) { return agent.module; });
  var HEADINGS = ["一", "二", "三", "四", "五"];
  var DISCLAIMER = "僅供比較，不保證錄取、簽證或核貸，也不是金融建議。正式 Demo 尚未放行。";

  /** 示範用虛構個案：沿用引導流程的那一份，不另外編一組數字。 */
  function demoCase() {
    return G.demoState();
  }

  function resolveModel(opts) {
    opts = opts || {};
    if (opts.model) return opts.model;
    return Model.createModel(opts.provider || "rule");
  }

  /** 第一段：依序計算。trace 記下實際的呼叫順序。 */
  function prepareAll(state, trace) {
    var ctx = { state: state };
    var preps = [];
    function step(index, slot, phase) {
      var agent = AGENTS[index];
      var prep = agent.prepare(ctx);
      preps[index] = prep;
      ctx[slot] = prep.data;
      trace.push({ phase: phase, agent: agent.id, module: agent.module });
      return prep;
    }
    step(0, "a", "計算");
    step(1, "b", "計算");
    step(2, "c", "計算");
    step(3, "d", "計算");
    var review = step(4, "e", "計算");
    // 把結果交給 E 審核：C 依 E 的結論決定確定值能不能顯示。
    ctx.review = review.data.reviews;
    step(2, "c", "E 審核後放行");
    return preps;
  }

  function verdicts(preps) {
    var cost = preps[2].data.plans || {};
    var reviews = preps[4].data.reviews || {};
    return Object.keys(reviews).map(function (key) {
      return {
        key: key,
        school: (cost[key] && cost[key].school) || key,
        verdict: reviews[key].verdict,
        released: !!(cost[key] && cost[key].released),
      };
    });
  }

  function mergePending(results) {
    var seen = {};
    var out = [];
    results.forEach(function (result) {
      result.pending.forEach(function (item) {
        var id = result.module + "|" + item.label;
        if (seen[id]) return;
        seen[id] = true;
        out.push({ module: result.module, agent: result.agent, id: item.id, label: item.label });
      });
    });
    return out;
  }

  function compose(state, model, preps, results, trace) {
    var audit = Compliance.auditSummaries(results.map(function (result, i) { return { prep: preps[i], result: result }; }));
    var review = verdicts(preps);
    var pending = mergePending(results);
    var rejected = results.filter(function (r) { return r.summary_rejected; });
    var failed = results.filter(function (r) { return r.model_error; });
    var provider = (model && model.provider) || "rule";
    var label = (model && model.label) || provider;

    var lines = ["留學財務長 AI｜AI 助理（試作）回覆"];
    if (state && state.demo) lines.push("【示範用虛構個案】個人資料、資金與校方強制保險的來源都是虛構的，不是真實個案。");
    lines.push("說明文字來源：" + label + "。數字全部來自模組計算，模型只整理文字。");
    if (failed.length) {
      lines.push("注意：模型呼叫失敗（" + failed[0].model_error + "）以下 " + failed.map(function (r) { return r.module; }).join("、") + " 的說明改用規則模板。");
    }
    if (rejected.length) {
      lines.push("注意：" + rejected.map(function (r) { return r.module; }).join("、") + " 的模型說明沒有通過數字檢查，已丟棄並改用規則模板。");
    }
    results.forEach(function (result, i) {
      lines.push("");
      lines.push(HEADINGS[i] + "、" + result.title);
      lines.push(result.summary);
    });
    lines.push("");
    lines.push("E 審核結論");
    if (!review.length) lines.push("沒有可以審查的方案，總成本、缺口、貸款額與月付都" + Base.NOT_FINAL + "。");
    review.forEach(function (item) {
      lines.push(
        "- " + item.school + "：" + item.verdict + "。" +
        (item.released ? "確定值見上面的成本說明。" : "總成本、缺口、貸款額與月付" + Base.NOT_FINAL + "。")
      );
    });
    lines.push("");
    lines.push("待確認清單");
    if (!pending.length) lines.push("（無）");
    pending.forEach(function (item) { lines.push("- " + item.module + "｜" + item.label + "：" + Base.PENDING); });
    lines.push("");
    lines.push(audit.ok ? "說明文字檢查：每段說明裡的數字都能在對應模組的輸出找到。" : "說明文字檢查：有說明沒通過最後檢查，請不要引用。");
    lines.push(DISCLAIMER);

    return {
      ok: audit.ok && !failed.length,
      provider: provider,
      provider_label: label,
      demo: !!(state && state.demo),
      order: ORDER.slice(),
      trace: trace,
      agents: results,
      review: review,
      pending: pending,
      audit: audit,
      summary_rejected: rejected.length > 0,
      model_failed: failed.length > 0,
      model_errors: failed.map(function (r) { return { agent: r.agent, error: r.model_error }; }),
      reply: lines.join("\n"),
    };
  }

  /** 非同步：任何 provider 都能用。回傳 Promise。 */
  function run(state, opts) {
    return Promise.resolve().then(function () {
      var model = resolveModel(opts);
      var trace = [];
      var preps = prepareAll(state, trace);
      var results = [];
      var chain = Promise.resolve();
      AGENTS.forEach(function (agent, i) {
        chain = chain.then(function () {
          return agent.complete(preps[i], { model: model });
        }).then(function (result) {
          results[i] = result;
          trace.push({ phase: "說明", agent: agent.id, module: agent.module });
        });
      });
      return chain.then(function () { return compose(state, model, preps, results, trace); });
    });
  }

  /** 同步：給瀏覽器與 rule provider 用，不需要等待。 */
  function runSync(state, opts) {
    var model = resolveModel(opts);
    var trace = [];
    var preps = prepareAll(state, trace);
    var results = AGENTS.map(function (agent, i) {
      var result = agent.completeSync(preps[i], { model: model });
      trace.push({ phase: "說明", agent: agent.id, module: agent.module });
      return result;
    });
    return compose(state, model, preps, results, trace);
  }

  return {
    AGENTS: AGENTS,
    ORDER: ORDER,
    DISCLAIMER: DISCLAIMER,
    demoCase: demoCase,
    run: run,
    runSync: runSync,
  };
});
