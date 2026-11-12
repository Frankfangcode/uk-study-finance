/**
 * D｜付款可行性（Frank／方澤享）
 *
 * compare({ school_id, balance_due, deposit_amount, deposit_paid, has_uk_account })
 * 訂金與學費管道分開。比較學費時只用 C 的 balance_due，不把未知餘額補成全額或 0。
 * 沒有報價的欄位保持 null，不排名，不選最低成本。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.DModule = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var GLASGOW_PAY = {
    label: "Glasgow self-funded payment methods",
    url: "https://www.gla.ac.uk/myglasgow/students/payingyourfees/selffundedpaymentmethods/",
    retrieved: "2026-11-10",
    record: "D-20261110-d08h",
  };
  var GLASGOW_DEPOSIT = {
    label: "University of Glasgow postgraduate deposits",
    url: "https://www.gla.ac.uk/postgraduate/feesandfunding/deposits/",
    retrieved: "2026-11-10",
    record: "D-20261110-d18r",
  };
  var GLASGOW_FAQ = {
    label: "Glasgow finance accounts receivable FAQ",
    url: "https://www.gla.ac.uk/myglasgow/financeaccountsreceivable/faqs/",
    retrieved: "2026-11-10",
    record: "D-20261110-d10j",
  };
  var CONVERA = {
    label: "Convera student payment instructions",
    url: "https://convera.com/students/faq/payment-methods-and-instructions/",
    retrieved: "2026-11-10",
    record: "D-20261110-d15o",
  };
  var EDINBURGH_FAQ = {
    label: "University of Edinburgh student finance FAQ",
    url: "https://uoe-finance.ed.ac.uk/students/faqs",
    retrieved: "2026-11-10",
    published: "2025-07-22",
    record: "B-20261110-k7m2",
  };
  var EDINBURGH_PLATFORM = {
    label: "University of Edinburgh self-funded online payment",
    url: "https://uoe-finance.ed.ac.uk/students/fees/self-funded/one-payment/bank-transfer-online-payment-platform",
    retrieved: "2026-11-10",
    record: "D-20261110-d13m",
  };
  var BOT_FEE = {
    label: "臺灣銀行電子銀行收費標準",
    url: "https://www.bot.com.tw/Images/File/GetFileId/ec3f5562-ca20-4a4c-8597-37d3539fa9fb",
    retrieved: "2026-11-10",
    record: "E-20261110-coord-f9c1",
  };
  var BOT_TERMS = {
    label: "臺灣銀行個人網銀服務約定（2022.05）",
    url: "https://www.bot.com.tw/Images/File/GetFileId/11a475fc-6b6e-47ef-a79b-c6f12b91a16e",
    retrieved: "2026-11-10",
    record: "D-20261110-d12l",
  };

  function emptyFees() {
    return {
      fixed_fee: null,
      pct_fee: null,
      min_fee: null,
      max_fee: null,
      fx_spread: null,
      included_in_quote: null,
    };
  }

  function channel(partial) {
    return {
      channel_id: partial.channel_id,
      fee_purpose: partial.fee_purpose,
      name: partial.name,
      school_acceptance: partial.school_acceptance,
      prerequisites: partial.prerequisites || [],
      quote_status: partial.quote_status,
      fees: emptyFees(),
      source: partial.source,
      note: partial.note || "",
    };
  }

  function glasgowTuition(hasUkAccount) {
    return [
      channel({
        channel_id: "direct_bank",
        fee_purpose: "tuition",
        name: "學生直接匯款到學校",
        school_acceptance: "不接受",
        quote_status: "不適用",
        source: GLASGOW_PAY,
        note: "2025-03-01 起不接受學生直接銀行轉帳。台灣付款人這條排除，不拿它跟其他管道比價。",
      }),
      channel({
        channel_id: "convera",
        fee_purpose: "tuition",
        name: "Convera 付款平台",
        school_acceptance: "核准",
        quote_status: "無報價",
        source: GLASGOW_PAY,
        note: "校方導向 Convera。頁面稱校方與 Convera 不收交易手續費，這不代表總成本為 0。對台灣付款人的費率與可用方式待確認，匯率加碼沒有公開數字。帳務 FAQ 寫國際付款約 10 days 顯示在 MyCampus，單位未確認，這裡不改成工作天或日曆天，也不拿來排名。",
      }),
      channel({
        channel_id: "mycampus_card",
        fee_purpose: "tuition",
        name: "MyCampus 卡付",
        school_acceptance: "核准",
        prerequisites: ["Visa、Visa Debit、Mastercard；不收 American Express"],
        quote_status: "無報價",
        source: GLASGOW_PAY,
        note: "卡組織與發卡行的國外交易費沒有本專題的有效報價，不寫死成 1.5% 或其他標準費率。",
      }),
      channel({
        channel_id: "direct_debit",
        fee_purpose: "tuition",
        name: "Direct Debit／分期",
        school_acceptance: hasUkAccount ? "核准" : "待確認",
        prerequisites: ["須有英國帳戶"],
        quote_status: "無報價",
        source: GLASGOW_PAY,
        note: hasUkAccount
          ? "已勾選有英國帳戶，所以這條在校方條件內。仍沒有費用報價，不排名。分期要按每一期實付計費，目前沒有各期報價。"
          : "頁面要求英國帳戶。這次沒有勾選，不把這條當成可行，也不填費率。",
      }),
    ];
  }

  function glasgowDeposit() {
    return [
      channel({
        channel_id: "applicant_self_service_card",
        fee_purpose: "deposit",
        name: "Applicant Self Service 卡付",
        school_acceptance: "核准",
        quote_status: "無報價",
        source: GLASGOW_DEPOSIT,
        note: "訂金頁只列接受 offer 後以信用卡／金融卡付款，沒有列 Convera。國際生付清訂金後才發 CAS。卡費沒有本專題報價，維持 null。",
      }),
      channel({
        channel_id: "direct_bank",
        fee_purpose: "deposit",
        name: "直接匯到學校",
        school_acceptance: "不接受",
        quote_status: "不適用",
        source: GLASGOW_DEPOSIT,
        note: "訂金頁沒有提供匯入學校帳戶。和學費的 Convera 路徑分開。",
      }),
      channel({
        channel_id: "convera",
        fee_purpose: "deposit",
        name: "Convera",
        school_acceptance: "待確認",
        quote_status: "無報價",
        source: GLASGOW_DEPOSIT,
        note: "訂金頁未列 Convera，不能把學費管道當成訂金也已核准。",
      }),
    ];
  }

  function edinburghTuition() {
    return [
      channel({
        channel_id: "direct_bank",
        fee_purpose: "tuition",
        name: "直接匯入學校銀行帳號",
        school_acceptance: "不接受",
        quote_status: "不適用",
        source: EDINBURGH_FAQ,
        note: "財務 FAQ 寫不提供銀行帳號。",
      }),
      channel({
        channel_id: "flywire",
        fee_purpose: "tuition",
        name: "Flywire",
        school_acceptance: "核准",
        quote_status: "無報價",
        source: EDINBURGH_PLATFORM,
        note: "自費線上付款走 Flywire。對台灣付款人的實際費率待確認。最佳價格保證不代表總成本為 0，這裡不把它當成報價。國際付款 FAQ 通則最多預留 7 個工作天。",
      }),
      channel({
        channel_id: "convera",
        fee_purpose: "tuition",
        name: "Convera",
        school_acceptance: "核准",
        quote_status: "無報價",
        source: EDINBURGH_PLATFORM,
        note: "付款頁另列 Convera，和 Flywire 分開。費率待確認。公開說明是每筆新參考碼、無動作 72 小時報價失效；報價失效不等於已送出的款失敗。",
      }),
    ];
  }

  function edinburghDeposit() {
    return [
      channel({
        channel_id: "direct_bank",
        fee_purpose: "deposit",
        name: "直接匯入學校銀行帳號",
        school_acceptance: "不接受",
        quote_status: "不適用",
        source: EDINBURGH_FAQ,
        note: "學校不提供銀行帳號，訂金同樣不能直接匯進校方帳戶。",
      }),
      channel({
        channel_id: "flywire",
        fee_purpose: "deposit",
        name: "Flywire",
        school_acceptance: "待確認",
        quote_status: "無報價",
        source: EDINBURGH_FAQ,
        note: "FAQ 的 Flywire 說明主要對到學費付款。訂金是否一定走同一條，這輪沒有單獨核到，不併進學費管道，費率也是 null。",
      }),
      channel({
        channel_id: "applicant_hub",
        fee_purpose: "deposit",
        name: "Applicant Hub",
        school_acceptance: "待確認",
        quote_status: "無報價",
        source: EDINBURGH_DEPOSIT_SOURCE,
        note: "研究紀錄寫 Applicant Hub 可刷卡或轉帳，但沒有可引用的手續費。維持待確認、不填數字。",
      }),
    ];
  }

  var EDINBURGH_DEPOSIT_SOURCE = {
    label: "University of Edinburgh MSc Data Science",
    url: "https://study.ed.ac.uk/programmes/postgraduate-taught/902-data-science",
    retrieved: "2026-11-10",
    record: "B-20261110-k7m2",
  };

  function channelsFor(schoolId, hasUkAccount) {
    if (schoolId === "uog") {
      return { tuition: glasgowTuition(!!hasUkAccount), deposit: glasgowDeposit() };
    }
    if (schoolId === "uoe") {
      return { tuition: edinburghTuition(), deposit: edinburghDeposit() };
    }
    return { tuition: [], deposit: [] };
  }

  function feeNumbers(fees) {
    return ["fixed_fee", "pct_fee", "min_fee", "max_fee", "fx_spread"].some(function (key) {
      return typeof fees[key] === "number";
    });
  }

  function quotedAndFeasible(item) {
    if (item.school_acceptance !== "核准" || item.quote_status !== "已報價") return false;
    var fees = item.fees;
    return ["fixed_fee", "pct_fee", "min_fee", "max_fee", "fx_spread"].every(function (key) {
      return typeof fees[key] === "number";
    });
  }

  function referenceTariffs() {
    return [
      {
        id: "bot-personal-fx-out",
        name: "臺灣銀行個人網銀外匯匯出",
        applies_to_school_payment: false,
        ranked: false,
        customer_segment: "個人",
        pct_display: "0.05%",
        min_fee_twd: 120,
        max_fee_twd: 800,
        cable_fee_twd: 300,
        daily_limit_display: "低於等值 TWD 500,000（不含本數）",
        payee_setup: "新受款資料申辦日後次一日生效",
        source: BOT_FEE,
        agreement: BOT_TERMS,
        note: "只代表個人網銀這個渠道的銀行端費用，不是學費的完整跨境成本，也不是企業網銀費率。格拉斯哥不收學生直接匯到學校；平台若沒有明確要求從這裡匯出，這張表不參加比較、不排名。次一日不改寫成次一營業日。",
      },
    ];
  }

  function compare(input) {
    input = input || {};
    var grouped = channelsFor(input.school_id, input.has_uk_account);
    var all = grouped.tuition.concat(grouped.deposit);
    var invented = all.filter(function (item) { return feeNumbers(item.fees); });
    var rankable = invented.length === 0 && all.some(quotedAndFeasible);
    var depositDue = input.deposit_paid === true ? 0 : input.deposit_paid === null || input.deposit_amount === null || input.deposit_amount === undefined ? null : input.deposit_amount;
    var warnings = [];
    if (input.balance_due === null || input.balance_due === undefined) {
      warnings.push("學費待付餘額未知，不假設已付或未付，也不改用全額學費代替。");
    }
    if (input.deposit_paid === null) {
      warnings.push("訂金付款狀態未知，訂金應付維持 null。");
    }
    if (input.school_id === "uoe") {
      warnings.push("愛丁堡帳上可能還沒顯示已付訂金。只有付款狀態已經確認，才使用 C 算出的餘額。");
    }
    return {
      school_id: input.school_id || null,
      payer_country: "TW",
      compared_amount: {
        balance_due: input.balance_due === undefined ? null : input.balance_due,
        balance_currency: input.balance_currency || "GBP",
        deposit_due: depositDue,
        deposit_currency: input.deposit_currency || "GBP",
        used_full_tuition: false,
      },
      channels: grouped,
      reference_tariffs: referenceTariffs(),
      rankable: rankable,
      cheapest_channel_id: null,
      summary: rankable ? "有完整報價可比較" : "可行性／費用待查",
      warnings: warnings,
      insurance_check: {
        school_insurance_gbp: null,
        school_insurance_status: "待確認",
        ihs_separate: true,
        note: "IHS 是簽證附加費。兩校強制校保目前沒有金額，不和 IHS 相加，也不當成 0。",
      },
      sources: {
        glasgow_pay: GLASGOW_PAY,
        glasgow_deposit: GLASGOW_DEPOSIT,
        glasgow_faq: GLASGOW_FAQ,
        convera: CONVERA,
        edinburgh_faq: EDINBURGH_FAQ,
        edinburgh_platform: EDINBURGH_PLATFORM,
        bot_fee: BOT_FEE,
        bot_terms: BOT_TERMS,
      },
    };
  }

  return {
    compare: compare,
    emptyFees: emptyFees,
    GLASGOW_PAY: GLASGOW_PAY,
    EDINBURGH_FAQ: EDINBURGH_FAQ,
    BOT_FEE: BOT_FEE,
    BOT_TERMS: BOT_TERMS,
  };
});
