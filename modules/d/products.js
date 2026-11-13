/**
 * D｜金融工具同條件試算。吃 cards.js、fx-accounts.js、insurance.js 的資料。
 * 規則：
 * - 任何一個必要費率是 null，該工具的估計費用就是 null（待確認），不把 null 當 0。
 * - 不排名、不選「最划算」。輸出順序就是資料順序。
 * - 匯率點差沒有公開，估計費用一律不含匯差，並在結果上註明。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./cards.js"), require("./fx-accounts.js"), require("./insurance.js"));
  } else {
    root.DProducts = factory(root.DCards, root.DFxAccounts, root.DInsurance);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (Cards, FxAccounts, Insurance) {
  "use strict";

  var DISCLAIMER = "僅供比較，非金融建議。";
  var ESTIMATE_NOTE = "估計，非報價；匯率點差未必公開，以下金額不含匯差。";
  var PENDING = "待確認";

  function isNum(value) {
    return typeof value === "number" && isFinite(value);
  }

  function val(fig) {
    return fig && isNum(fig.value) ? fig.value : null;
  }

  /** 金額、匯率、筆數任何一個不是正數就不試算，不默默補預設值。 */
  function normaliseInput(input) {
    input = input || {};
    var amount = isNum(input.amountGbp) && input.amountGbp > 0 ? input.amountGbp : null;
    var fx = isNum(input.fxRate) && input.fxRate > 0 ? input.fxRate : null;
    var count = isNum(input.count) && input.count >= 1 ? Math.floor(input.count) : null;
    var ok = amount !== null && fx !== null && count !== null;
    return {
      ok: ok,
      amountGbp: amount,
      fxRate: fx,
      count: count,
      perTransferTwd: ok ? amount * fx : null,
      totalTwd: ok ? amount * fx * count : null,
      error: ok ? null : "請輸入大於 0 的金額、匯率與筆數。",
    };
  }

  function cardFeePct(card) {
    var network = val(card.networkFeePct);
    var bank = val(card.bankFeePct);
    if (network !== null && bank !== null) return { pct: network + bank, basis: "發卡組織費＋銀行費" };
    var total = val(card.totalFeePct);
    if (total !== null) return { pct: total, basis: "官方合計費率（拆項待確認）" };
    return { pct: null, basis: PENDING };
  }

  function estimateCard(card, input) {
    var base = normaliseInput(input);
    var network = val(card.networkFeePct);
    var bank = val(card.bankFeePct);
    var rate = cardFeePct(card);
    var out = {
      id: card.id,
      label: card.issuer + "｜" + card.name,
      ok: base.ok,
      baseTwd: base.totalTwd,
      feePct: rate.pct,
      feeBasis: rate.basis,
      networkFeeTwd: null,
      bankFeeTwd: null,
      feeTwd: null,
      status: PENDING,
      pending: [],
      note: ESTIMATE_NOTE,
    };
    if (network === null) out.pending.push("發卡組織費");
    if (bank === null) out.pending.push("銀行費");
    if (!base.ok) {
      out.error = base.error;
      return out;
    }
    if (network !== null) out.networkFeeTwd = Math.round(base.totalTwd * network / 100);
    if (bank !== null) out.bankFeeTwd = Math.round(base.totalTwd * bank / 100);
    if (rate.pct === null) return out;
    out.feeTwd = Math.round(base.totalTwd * rate.pct / 100);
    out.status = "估計";
    return out;
  }

  /** 單筆匯款的銀行手續費（不含郵電費）。任何必要數字缺就回 null。 */
  function handlingFeeTwd(account, transferTwd) {
    var h = account && account.handling;
    if (!h || !isNum(transferTwd) || transferTwd <= 0) return null;
    if (h.type === "flat") return val(h.amountTwd);
    if (h.type === "pct") {
      var pct = val(h.pct);
      var min = val(h.minTwd);
      var max = val(h.maxTwd);
      if (pct === null || min === null || max === null) return null;
      return Math.round(Math.min(Math.max(transferTwd * pct / 100, min), max));
    }
    if (h.type === "tiered") {
      for (var i = 0; i < h.tiers.length; i++) {
        var tier = h.tiers[i];
        if (tier.upToTwd === null || transferTwd <= tier.upToTwd) return val(tier.feeTwd);
      }
    }
    return null;
  }

  function estimateFxAccount(account, input) {
    var base = normaliseInput(input);
    var out = {
      id: account.id,
      label: account.provider + "｜" + account.name,
      ok: base.ok,
      count: base.count,
      perTransferTwd: base.perTransferTwd,
      handlingFeeTwd: null,
      cableFeeTwd: null,
      knownSubtotalTwd: null,
      feeTwd: null,
      fxSpreadTwd: null,
      spreadIncluded: false,
      status: PENDING,
      pending: [],
      note: ESTIMATE_NOTE,
    };
    if (!base.ok) {
      out.error = base.error;
      return out;
    }
    var handling = handlingFeeTwd(account, base.perTransferTwd);
    var cable = val(account.cableFeeTwd);
    if (handling === null) out.pending.push("手續費");
    else out.handlingFeeTwd = handling * base.count;
    if (cable === null) out.pending.push("郵電費／匯出費");
    else out.cableFeeTwd = cable * base.count;
    if (val(account.fxSpreadPct) === null) out.pending.push("換匯點差");
    if (handling !== null || cable !== null) {
      out.knownSubtotalTwd = ((handling || 0) + (cable || 0)) * base.count;
    }
    if (handling !== null && cable !== null) {
      out.feeTwd = (handling + cable) * base.count;
      out.status = "估計（不含匯差）";
    }
    return out;
  }

  /** 同一組輸入套到每個工具。不排序、不選最低。 */
  function compare(input) {
    var base = normaliseInput(input);
    return {
      input: base,
      cards: Cards.list().map(function (card) { return estimateCard(card, input); }),
      fxAccounts: FxAccounts.list().map(function (account) { return estimateFxAccount(account, input); }),
      insurance: Insurance.summary(),
      ranking: null,
      cheapest: null,
      disclaimer: DISCLAIMER,
      note: ESTIMATE_NOTE,
    };
  }

  /** 走過整份資料，找出「有數字但缺 sourceUrl 或 checkedAt」以及「待確認卻有數字」的 figure。 */
  function auditFigures(data) {
    var problems = [];
    var count = 0;
    (function walk(node, path) {
      if (!node || typeof node !== "object") return;
      if (node.kind === "figure") {
        count += 1;
        var hasValue = node.value !== null && node.value !== undefined;
        if (hasValue && !isNum(node.value)) problems.push(path + "：value 不是數字");
        if (hasValue && !/^https:\/\//.test(node.sourceUrl || "")) problems.push(path + "：有數字但沒有 sourceUrl");
        if (hasValue && !/^\d{4}-\d{2}-\d{2}$/.test(node.checkedAt || "")) problems.push(path + "：有數字但沒有 checkedAt");
        if (hasValue && node.status !== "已查明") problems.push(path + "：有數字但狀態不是已查明");
        if (!hasValue && node.status !== PENDING) problems.push(path + "：null 必須標待確認");
        return;
      }
      Object.keys(node).forEach(function (key) { walk(node[key], path + "." + key); });
    })(data, "$");
    return { count: count, problems: problems };
  }

  function allData() {
    return { cards: Cards.list(), fxAccounts: FxAccounts.list(), insurance: Insurance.list() };
  }

  return {
    DISCLAIMER: DISCLAIMER,
    ESTIMATE_NOTE: ESTIMATE_NOTE,
    PENDING: PENDING,
    cards: Cards.list,
    fxAccounts: FxAccounts.list,
    insurance: Insurance.summary,
    allData: allData,
    normaliseInput: normaliseInput,
    cardFeePct: cardFeePct,
    estimateCard: estimateCard,
    handlingFeeTwd: handlingFeeTwd,
    estimateFxAccount: estimateFxAccount,
    compare: compare,
    auditFigures: auditFigures,
  };
});
