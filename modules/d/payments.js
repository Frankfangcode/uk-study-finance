/**
 * D｜付款可行性。先看學校收不收，再看有沒有報價。
 * 沒有報價就留 null，不排名，不把「無交易費」寫成總成本 0。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("../../shared/constants.js"));
  } else {
    root.DModule = factory(root.SharedConstants);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (Constants) {
  "use strict";

  function channel(partial) {
    return {
      school_acceptance: "待確認",
      payer_eligibility: "待確認",
      preconditions: [],
      quote_status: "缺報價",
      fixed_fee: null,
      pct_fee: null,
      min_fee: null,
      max_fee: null,
      fx_spread: null,
      fee_included_in_quote: null,
      payer_total: null,
      currency: null,
      consulted: "2026-11-10",
      source_urls: partial.source_url ? [partial.source_url] : [],
      note: "",
      record: "",
      channel_id: partial.channel_id,
      fee_purpose: partial.fee_purpose,
      name: partial.name,
      school_acceptance: partial.school_acceptance,
      payer_eligibility: partial.payer_eligibility,
      preconditions: partial.preconditions || [],
      quote_status: partial.quote_status || "缺報價",
      fixed_fee: partial.fixed_fee == null ? null : partial.fixed_fee,
      pct_fee: partial.pct_fee == null ? null : partial.pct_fee,
      min_fee: partial.min_fee == null ? null : partial.min_fee,
      max_fee: partial.max_fee == null ? null : partial.max_fee,
      fx_spread: null,
      fee_included_in_quote: null,
      payer_total: null,
      source_url: partial.source_url,
      source_urls: partial.source_urls || (partial.source_url ? [partial.source_url] : []),
      consulted: partial.consulted || "2026-11-10",
      record: partial.record || "",
      note: partial.note || "",
    };
  }

  var GLASGOW = {
    tuition: [
      channel({
        channel_id: "uog-direct-bank",
        fee_purpose: "tuition",
        name: "學生直接匯款到學校帳戶",
        school_acceptance: "不接受",
        payer_eligibility: "不適用",
        source_url: Constants.urls.glasgowPay,
        record: "D-20261110-d08h",
        note: "自 2025-03-01 起，格拉斯哥不接受學生直接銀行轉帳。台灣個案排除這條，不拿它來比價。",
      }),
      channel({
        channel_id: "uog-convera",
        fee_purpose: "tuition",
        name: "Convera 付款平台",
        school_acceptance: "核准",
        payer_eligibility: "待確認",
        source_urls: [Constants.urls.glasgowPay, Constants.urls.convera],
        source_url: Constants.urls.glasgowPay,
        record: "D-20261110-d08h",
        note: "校方把自費生導向這個平台，並稱校方與 Convera 不另收交易手續費。公開的「無交易費」不等於總成本為 0，匯差與台灣付款人的實際費率都還沒有報價。",
      }),
      channel({
        channel_id: "uog-mycampus-card",
        fee_purpose: "tuition",
        name: "MyCampus 卡付",
        school_acceptance: "核准",
        payer_eligibility: "待確認",
        preconditions: ["Visa、Visa Debit 或 Mastercard", "不收 American Express"],
        source_url: Constants.urls.glasgowPay,
        record: "D-20261110-d08h",
        note: "學校收這幾種卡。臺灣發卡行的國外交易費沒有本專題報價，欄位維持 null，不套用 1.5%。",
      }),
      channel({
        channel_id: "uog-direct-debit",
        fee_purpose: "tuition",
        name: "Direct Debit／分期",
        school_acceptance: "核准",
        payer_eligibility: "待確認",
        preconditions: ["須有英國帳戶"],
        source_url: Constants.urls.glasgowPay,
        record: "D-20261110-d08h",
        note: "頁面把英國帳戶列為前提。沒有那個帳戶就不能把這條當成台灣學生已可使用的管道，也不填費率。",
      }),
    ],
    deposit: [
      channel({
        channel_id: "uog-deposit-card",
        fee_purpose: "deposit",
        name: "Applicant Self Service 卡付",
        school_acceptance: "核准",
        payer_eligibility: "待確認",
        preconditions: ["接受 offer 後於 Applicant Self Service 以信用卡或金融卡支付"],
        source_url: Constants.urls.glasgowDeposit,
        record: "D-20261110-d18r",
        note: "訂金頁列的是卡付，沒有列 Convera。國際生付清訂金後學校才發 CAS。卡費沒有本專題報價。",
      }),
      channel({
        channel_id: "uog-deposit-direct-bank",
        fee_purpose: "deposit",
        name: "直接匯款到學校帳戶",
        school_acceptance: "不接受",
        payer_eligibility: "不適用",
        source_urls: [Constants.urls.glasgowPay, Constants.urls.glasgowDeposit],
        source_url: Constants.urls.glasgowPay,
        record: "D-20261110-d18r",
        note: "自費生付款頁停收直接轉帳；訂金頁也沒有把銀行轉帳列為訂金方式。這條與學費的 Convera／MyCampus 分開記。",
      }),
      channel({
        channel_id: "uog-deposit-convera",
        fee_purpose: "deposit",
        name: "Convera",
        school_acceptance: "待確認",
        payer_eligibility: "待確認",
        source_url: Constants.urls.glasgowDeposit,
        record: "D-20261110-d18r",
        note: "訂金頁沒有列出 Convera。沒有寫不接受，所以不改写成拒絕，只維持待確認、費用 null。",
      }),
    ],
  };

  var EDINBURGH = {
    tuition: [
      channel({
        channel_id: "uoe-direct-bank",
        fee_purpose: "tuition",
        name: "直接匯款到學校帳戶",
        school_acceptance: "不接受",
        payer_eligibility: "不適用",
        source_url: Constants.urls.edinburghFaq,
        record: "B-20261110-k7m2",
        note: "財務 FAQ 寫學校不提供銀行帳號。",
      }),
      channel({
        channel_id: "uoe-flywire",
        fee_purpose: "tuition",
        name: "Flywire",
        school_acceptance: "核准",
        payer_eligibility: "待確認",
        source_urls: [Constants.urls.edinburghFaq, Constants.urls.edinburghPay],
        source_url: Constants.urls.edinburghPay,
        record: "D-20261110-d13m",
        consulted: "2026-11-10",
        note: "註冊繳費流程內建 Flywire。最佳價格保證只涵蓋部分付款方式，不能當成總成本 0。對台灣付款人的費率待確認。平台細狀態本輪不做成規則。",
      }),
      channel({
        channel_id: "uoe-convera",
        fee_purpose: "tuition",
        name: "Convera",
        school_acceptance: "核准",
        payer_eligibility: "待確認",
        source_urls: [Constants.urls.edinburghPay, Constants.urls.convera],
        source_url: Constants.urls.convera,
        record: "D-20261110-d13m",
        note: "與 Flywire 並列，不是同一條。公開說明有 72 小時報價鎖定；報價到期不等於錢沒匯出。費率 null。",
      }),
    ],
    deposit: [
      channel({
        channel_id: "uoe-deposit-card",
        fee_purpose: "deposit",
        name: "Applicant Hub 卡付",
        school_acceptance: "核准",
        payer_eligibility: "待確認",
        source_url: Constants.urls.edinburghProgramme,
        record: "B-20261110-k7m2",
        note: "研究紀錄寫 Applicant Hub 可刷卡。費率沒有報價。",
      }),
      channel({
        channel_id: "uoe-deposit-hub-transfer",
        fee_purpose: "deposit",
        name: "Applicant Hub 轉帳",
        school_acceptance: "待確認",
        payer_eligibility: "待確認",
        source_url: Constants.urls.edinburghProgramme,
        record: "B-20261110-k7m2",
        note: "紀錄寫 Hub 可轉帳，但沒有核到這是不是 Flywire／Convera，而不是學校自己的帳號。不填費率。",
      }),
      channel({
        channel_id: "uoe-deposit-direct-bank",
        fee_purpose: "deposit",
        name: "直接匯款到學校帳戶",
        school_acceptance: "不接受",
        payer_eligibility: "不適用",
        source_url: Constants.urls.edinburghFaq,
        record: "B-20261110-k7m2",
        note: "學校不提供銀行帳號。這條與 Hub 裡尚未核實的轉帳分開。",
      }),
    ],
  };

  var BY_SCHOOL = { glasgow: GLASGOW, edinburgh: EDINBURGH };

  function referenceChannels() {
    var pct = Constants.byId("bot-outward-pct");
    var min = Constants.byId("bot-outward-min");
    var max = Constants.byId("bot-outward-max");
    var cable = Constants.byId("bot-cable");
    var limit = Constants.byId("bot-daily-limit");
    return [
      {
        channel_id: "bot-personal-outward",
        name: "臺灣銀行個人網銀外匯匯出",
        applies_to_school_payment: false,
        applicability: "待確認",
        customer_segment: "個人",
        quote_status: "僅銀行端費率，不是完整跨境報價",
        pct_fee: pct.amount,
        min_fee: min.amount,
        max_fee: max.amount,
        fixed_fee: cable.amount,
        fixed_fee_unit: "每通電報",
        fx_spread: null,
        our_fee: null,
        payer_total: null,
        daily_limit_twd: limit.amount,
        daily_limit_note: "每一營業日低於等值 TWD 500,000（不含本數）",
        payee_setup_lead: "次一日",
        payee_setup_is_business_day: null,
        source_url: Constants.urls.botFee,
        source_urls: [Constants.urls.botFee, Constants.urls.botTerms],
        record: "D-20261110-d16p",
        note: "只有在某個已核准平台真的要求從臺銀個人網銀匯出時，這張表才用得上。目前兩校都沒有證實這一點。不把它排成最便宜，也不把「次一日」改成「次一營業日」。",
      },
    ];
  }

  function channelsFor(schoolId, purpose) {
    var school = BY_SCHOOL[schoolId];
    if (!school || !school[purpose]) return [];
    return JSON.parse(JSON.stringify(school[purpose]));
  }

  function isRankable(ch, amountDue) {
    return (
      ch.school_acceptance === "核准" &&
      ch.payer_eligibility === "核准" &&
      ch.quote_status === "已報價" &&
      ch.payer_total !== null &&
      ch.payer_total !== undefined &&
      amountDue !== null &&
      amountDue !== undefined
    );
  }

  function compare(input) {
    input = input || {};
    var purpose = input.fee_purpose === "deposit" ? "deposit" : "tuition";
    var amount = hasAmount(input.amount_due) ? input.amount_due : null;
    var channels = channelsFor(input.school_id, purpose);
    if (!BY_SCHOOL[input.school_id]) {
      return {
        ok: false,
        school_id: input.school_id || null,
        fee_purpose: purpose,
        amount_due: amount,
        channels: [],
        ranking: null,
        cheapest: null,
        message: "這所學校的付款方式尚未收錄，不排名。",
        reference_only: referenceChannels(),
      };
    }
    var rankable = channels.filter(function (ch) {
      return isRankable(ch, amount);
    });
    return {
      ok: true,
      school_id: input.school_id,
      fee_purpose: purpose,
      payer_country: input.payer_country || "TW",
      amount_due: amount,
      currency: input.currency || "GBP",
      amount_basis: input.amount_basis || (purpose === "deposit" ? "deposit_outstanding" : "balance_due"),
      channels: channels,
      reference_only: referenceChannels(),
      ranking: rankable.length ? rankable.map(function (ch) { return ch.channel_id; }) : null,
      cheapest: null,
      message: rankable.length ? "已有同基準報價，可以比較。" : "可行性／費用待查",
    };
  }

  function hasAmount(value) {
    return typeof value === "number" && isFinite(value);
  }

  function outstanding(scenario, purpose) {
    var deposit = scenario && scenario.deposit;
    var currency = (deposit && deposit.currency) || "GBP";
    if (!deposit || (deposit.paid !== true && deposit.paid !== false)) {
      return {
        amount: null,
        currency: currency,
        basis: purpose === "deposit" ? "deposit_outstanding" : "balance_due",
        note: "付款狀態未知，不假設已付或未付。",
      };
    }
    if (purpose === "deposit") {
      return {
        amount: deposit.paid ? 0 : deposit.amount,
        currency: currency,
        basis: "deposit_outstanding",
        note: deposit.paid ? "訂金已確認付清，這條管道沒有待付。" : "這是訂金本身，不是整筆學費。不要和學費餘額相加。",
      };
    }
    return {
      amount: deposit.balance_due,
      currency: currency,
      basis: "balance_due",
      note: "學費管道比的是 C 的待付餘額，不是另外一筆訂金。",
    };
  }

  function lineCost(row) {
    if (!row) return null;
    if (row.fee_included_in_quote) {
      if (!hasAmount(row.quote_total)) return null;
      return { fee: 0, payer: row.quote_total };
    }
    if (!hasAmount(row.principal) || !hasAmount(row.fixed_fee) || !hasAmount(row.pct_fee)) return null;
    var variable = row.principal * row.pct_fee;
    if (hasAmount(row.min_fee)) variable = Math.max(variable, row.min_fee);
    if (hasAmount(row.max_fee)) variable = Math.min(variable, row.max_fee);
    var fee = row.fixed_fee + variable;
    return { fee: fee, payer: row.principal + fee };
  }

  function payerTotal(rows) {
    if (!rows || !rows.length) return { ok: false, total: null, fee: null };
    var total = 0;
    var fee = 0;
    for (var i = 0; i < rows.length; i++) {
      var part = lineCost(rows[i]);
      if (!part) return { ok: false, total: null, fee: null };
      total += part.payer;
      fee += part.fee;
    }
    return {
      ok: true,
      total: Math.round(total * 100) / 100,
      fee: Math.round(fee * 100) / 100,
    };
  }

  function rankQuotes(quotes) {
    if (!quotes || !quotes.length) return { ranking: null, cheapest: null, reason: "沒有報價" };
    var base = null;
    var ranked = [];
    for (var i = 0; i < quotes.length; i++) {
      var quote = quotes[i];
      if (!quote || quote.quote_status !== "已報價" || !hasAmount(quote.payer_total)) continue;
      var key = [quote.currency, quote.as_of, quote.amount_due, quote.amount_currency].join("|");
      if (base === null) base = key;
      else if (key !== base) return { ranking: null, cheapest: null, reason: "幣別、時點或待付餘額不一致，不排名" };
      ranked.push(quote);
    }
    if (!ranked.length) return { ranking: null, cheapest: null, reason: "可行性／費用待查" };
    ranked.sort(function (a, b) { return a.payer_total - b.payer_total; });
    return {
      ranking: ranked.map(function (quote) { return quote.id; }),
      cheapest: ranked[0].id,
      reason: null,
    };
  }

  return {
    channelsFor: channelsFor,
    compare: compare,
    outstanding: outstanding,
    payerTotal: payerTotal,
    rankQuotes: rankQuotes,
    referenceChannels: referenceChannels,
  };
});
