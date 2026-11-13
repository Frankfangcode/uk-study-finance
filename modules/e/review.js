/**
 * E｜來源、假設與待確認。
 * 擋住未知當 0、沒有來源的數字，以及把已知小計說成確定總額。
 * 不修改別人的紀錄，也不等於正式 Demo 放行。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("../../shared/constants.js"));
  } else {
    root.EModule = factory(root.SharedConstants);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (Constants) {
  "use strict";

  function lineId(line) {
    return line.id || line.fee_id || line.name || "未命名";
  }

  function inclusion(line) {
    return line.inclusion || line.inclusion_flag || "";
  }

  function isPending(line) {
    var flag = inclusion(line);
    return flag === "pending" || flag === "待確認";
  }

  function isNone(line) {
    var flag = inclusion(line);
    return flag === "none" || flag === "無此費用";
  }

  function isExtra(line) {
    var flag = inclusion(line);
    return flag === "extra" || flag === "另計" || flag === "included" || flag === "已含";
  }

  function sourceUrl(line) {
    if (line.sourceUrl) return line.sourceUrl;
    if (line.source_ref && line.source_ref.url) return line.source_ref.url;
    return "";
  }

  function isAssumption(line) {
    return !!(line.assumption || (line.source_ref && line.source_ref.assumption));
  }

  // 學生自己向校方確認後填的來源。算有來源，但一律另外標示，不當成本站查證。
  function isSelfReported(line) {
    var flagged = !!(line.selfReported || (line.source_ref && line.source_ref.self_reported));
    if (!flagged) return false;
    var text = line.source || (line.source_ref && line.source_ref.label) || "";
    return typeof text === "string" && text.trim() !== "";
  }

  function issuesFor(line) {
    var issues = [];
    var amount = line.amount;
    if (isPending(line) && amount === 0) issues.push("unknown-as-zero");
    if (isNone(line) && !line.zeroEvidence && !line.zero_evidence) {
      issues.push("zero-without-evidence");
      if (amount === 0) issues.push("unknown-as-zero");
    }
    var counts = isExtra(line) || (isNone(line) && (line.zeroEvidence || line.zero_evidence));
    if (counts && amount !== null && amount !== undefined && !sourceUrl(line) && !isAssumption(line) && !isSelfReported(line)) {
      issues.push("unsourced");
    }
    Constants.rejected.forEach(function (item) {
      if (amount === item.amount && (line.currency === item.currency || !line.currency)) {
        if (lineId(line) === "ihs" || lineId(line) === "visa-fee" || line.uses_rejected_figure) {
          issues.push("rejected-figure");
        }
      }
    });
    return issues;
  }

  function presentLine(line) {
    var issues = issuesFor(line);
    var hide = issues.indexOf("unknown-as-zero") !== -1 || issues.indexOf("unsourced") !== -1 || issues.indexOf("zero-without-evidence") !== -1 || issues.indexOf("rejected-figure") !== -1;
    if (!hide) {
      return {
        blocked: false,
        amount: line.amount,
        contributeTwd: line.contributeTwd,
        issues: [],
        selfReported: isSelfReported(line),
        status: isPending(line) ? "待確認" : isAssumption(line) ? "假設" : isSelfReported(line) ? "學生自報" : sourceUrl(line) ? "有來源" : "待確認",
      };
    }
    return {
      blocked: true,
      amount: null,
      contributeTwd: null,
      issues: issues,
      status: "不顯示",
      reason: reasonText(issues),
    };
  }

  function reasonText(issues) {
    if (issues.indexOf("unknown-as-zero") !== -1) return "未知不能顯示成 0。";
    if (issues.indexOf("zero-without-evidence") !== -1) return "沒有零費證據，不能顯示成沒有這筆費用。";
    if (issues.indexOf("rejected-figure") !== -1) return "這個數字來自已排除的對照表，不能當收費標準。";
    if (issues.indexOf("unsourced") !== -1) return "沒有來源，也沒有標成假設，學生畫面不顯示這個數字。";
    return "這筆不進入學生畫面。";
  }

  function auditCatalog(catalog) {
    var problems = [];
    (catalog || Constants.catalog).forEach(function (entry) {
      if (entry.kind === "sourced") {
        if (!entry.url || entry.url.indexOf("http") !== 0) problems.push(entry.id + " 缺來源網址");
        if (entry.amount === null || entry.amount === undefined) problems.push(entry.id + " 標成有來源卻沒有金額");
      }
      if (entry.kind === "pending" && entry.amount !== null) problems.push(entry.id + " 待確認卻填了金額");
      if (entry.kind === "assumption" && entry.url) problems.push(entry.id + " 假設不該假裝有官方網址");
    });
    return { ok: problems.length === 0, problems: problems };
  }

  function review(input) {
    input = input || {};
    var lines = input.lines || [];
    var scenario = input.scenario || {};
    var blockers = [];
    var pending = [];
    var assumptions = [];
    var selfReported = [];
    lines.forEach(function (line) {
      var issues = issuesFor(line);
      issues.forEach(function (code) {
        blockers.push({ code: code, id: lineId(line), name: line.name || line.fee_type || lineId(line) });
      });
      if (isPending(line)) pending.push(lineId(line));
      if (isAssumption(line)) assumptions.push(lineId(line));
      if (isSelfReported(line) && !isPending(line)) selfReported.push(lineId(line));
    });
    if (scenario.complete && pending.length) {
      blockers.push({ code: "false-complete", id: "scenario", name: "整案" });
    }
    if (input.claimsKnownAsFinal) {
      blockers.push({ code: "known-as-final", id: "scenario", name: "已知小計" });
    }
    if (input.benchmarkConflict) {
      blockers.push({ code: "benchmark-conflict", id: "assumptions", name: "基準" });
    }
    var catalogAudit = auditCatalog(input.catalog || Constants.catalog);
    catalogAudit.problems.forEach(function (problem) {
      blockers.push({ code: "catalog", id: "catalog", name: problem });
    });

    var verdict = "PASS";
    if (input.needsHumanDecision) verdict = "轉真人";
    else if (blockers.length || pending.length) verdict = "退修";

    var showFinal = verdict === "PASS" && !!scenario.complete && !input.claimsKnownAsFinal;
    return {
      verdict: verdict,
      formal_demo: "尚未放行",
      blockers: blockers,
      pending: pending,
      assumptions: assumptions,
      self_reported: selfReported,
      self_reported_note: selfReported.length ? "學生自報，非本站查證" : null,
      show_final_total: showFinal,
      final_total_twd: showFinal ? scenario.final_total_twd : null,
      confirmed_gap_twd: showFinal ? scenario.confirmed_gap_twd : null,
      catalog_ok: catalogAudit.ok,
      note: verdict === "PASS"
        ? "這份試算的必要項目都有金額，假設也有標。正式 Demo 仍未放行。"
        : verdict === "轉真人"
          ? "有必須由人選定的假設或高風險判斷，先不要當成審查通過。"
          : "還有待確認、缺來源，或把未知當成 0。不能宣稱完整總額。",
    };
  }

  return {
    issuesFor: issuesFor,
    presentLine: presentLine,
    review: review,
    auditCatalog: auditCatalog,
  };
});
