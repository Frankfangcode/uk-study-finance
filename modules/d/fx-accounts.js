/**
 * D｜外幣帳戶與多幣別帳戶。台灣銀行端的外幣匯出費用，以及 Wise 這類多幣別帳戶。
 * 每個數字都是 figure：{ value, unit, status, sourceUrl, checkedAt, note }。
 * 換匯點差各家都沒有在所查頁面公開成固定比例，一律 null／待確認，不當成 0。
 * 僅供比較，非金融建議；不排名。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.DFxAccounts = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var CHECKED_AT = "2026-11-13";

  function figure(value, unit, sourceUrl, note) {
    var known = typeof value === "number" && isFinite(value) && !!sourceUrl;
    return {
      kind: "figure",
      value: known ? value : null,
      unit: unit,
      status: known ? "已查明" : "待確認",
      sourceUrl: sourceUrl || null,
      checkedAt: CHECKED_AT,
      note: note || "",
    };
  }

  var URLS = {
    bot: "https://www.bot.com.tw/Images/File/GetFileId/ec3f5562-ca20-4a4c-8597-37d3539fa9fb",
    dbs: "https://www.dbs.com.tw/iwov-resources/pdf/LegalDisclaimersandAnnouncements/01_personal_finance/02_deposits/service_fee.pdf",
    ctbc: "https://www.ctbcbank.com/content/dam/twrbo/pdf/aboutctbc/applyform/Fee.pdf",
    ctbcFaq: "https://service.ctbcbank.com/FAQ/Page01?kmid=4709",
    cathay: "https://www.cathaybk.com.tw/cathaybk/personal/about/news/charge-standard/foreigncurrency_remittance/",
    wiseCurrencies: "https://wise.com/help/articles/2571907/what-currencies-can-i-send-to-and-from",
    wisePricing: "https://wise.com/gb/pricing/send-money",
  };

  function spreadPending(url) {
    return figure(null, "pct", url, "換匯點差沒有公開成固定比例，依當下牌告匯率。待確認，不當成 0。");
  }

  var accounts = [
    {
      id: "bot-online",
      provider: "臺灣銀行",
      name: "臺銀外匯存款＋個人網路銀行外匯匯出",
      type: "台灣銀行外幣帳戶",
      channel: "網路銀行",
      availableFromTwd: "可",
      handling: {
        type: "pct",
        pct: figure(0.05, "pct", URLS.bot, "電子銀行收費標準：每筆按匯款金額 0.05% 計收。"),
        minTwd: figure(120, "TWD", URLS.bot, "最低新臺幣 120 元。"),
        maxTwd: figure(800, "TWD", URLS.bot, "最高新臺幣 800 元。"),
      },
      cableFeeTwd: figure(300, "TWD", URLS.bot, "郵電費：電匯每通電文新臺幣 300 元。"),
      fullAmountExtraTwd: figure(null, "TWD", URLS.bot, "這張表沒有列全額到行加收金額，只寫加發 MT202 等電文時另收郵電費。"),
      fxSpreadPct: spreadPending(URLS.bot),
      sourceUrls: [URLS.bot],
      note: "只是臺銀端的費用。中間行、收款行可能再內扣。",
    },
    {
      id: "dbs-tw",
      provider: "星展銀行（台灣）",
      name: "星展外幣帳戶＋外幣電匯匯出（一般客戶）",
      type: "台灣銀行外幣帳戶",
      channel: "不分通路（手續費一覽表）",
      availableFromTwd: "可",
      handling: {
        type: "flat",
        amountTwd: figure(600, "TWD", URLS.dbs, "個人金融服務手續費一覽表（生效日 2026-04-07）：外幣電匯匯出手續費 NT$600／每筆。"),
      },
      cableFeeTwd: figure(300, "TWD", URLS.dbs, "郵電費：一般匯款 NT$300／每筆。"),
      fullAmountExtraTwd: figure(null, "TWD", URLS.dbs, "表上沒有「加收」金額，列的是全額到行的郵電費總額，見下一欄。"),
      fullAmountCableFeeTwd: figure(600, "TWD", URLS.dbs, "郵電費：全額到行 NT$600／每筆（取代一般匯款的 300）。"),
      fxSpreadPct: spreadPending(URLS.dbs),
      sourceUrls: [URLS.dbs],
      note: "一般客戶費率。匯到英國不在免郵電費的海外星展集團範圍。國外銀行費用按實際另收。",
    },
    {
      id: "ctbc-tw",
      provider: "中國信託",
      name: "中信外幣帳戶＋匯出匯款（電匯）",
      type: "台灣銀行外幣帳戶",
      channel: "櫃檯服務性手續費表",
      availableFromTwd: "可",
      handling: {
        type: "tiered",
        tiers: [
          { upToTwd: 1000000, feeTwd: figure(600, "TWD", URLS.ctbc, "各項手續費收費公告（公告日 115.10.01）：折合新臺幣一佰萬（含）以下 NT$600。") },
          { upToTwd: 2000000, feeTwd: figure(700, "TWD", URLS.ctbc, "一佰萬以上至二佰萬（含）NT$700。") },
          { upToTwd: 3000000, feeTwd: figure(800, "TWD", URLS.ctbc, "二佰萬以上至三佰萬（含）NT$800。") },
          { upToTwd: null, feeTwd: figure(900, "TWD", URLS.ctbc, "三佰萬以上 NT$900。") },
        ],
      },
      cableFeeTwd: figure(null, "TWD", URLS.ctbc, "公告沒有單獨列一般郵電費，只寫加發電文／全額到匯每通另收 NT$150。是否另有基本郵電費待確認。"),
      fullAmountExtraTwd: figure(150, "TWD", URLS.ctbc, "加發電文／全額到匯，每通另收郵電費 NT$150。部分地區或銀行無法全額到匯。"),
      fxSpreadPct: spreadPending(URLS.ctbc),
      sourceUrls: [URLS.ctbc, URLS.ctbcFaq],
      note: "公告的是櫃檯費率；網路銀行是否不同，所查頁面沒有寫。國外銀行費用按實際另收。",
    },
    {
      id: "cathay-counter",
      provider: "國泰世華銀行",
      name: "國泰世華外幣帳戶＋臨櫃轉帳匯款（電匯）",
      type: "台灣銀行外幣帳戶",
      channel: "臨櫃（轉帳匯款）",
      availableFromTwd: "可",
      handling: {
        type: "flat",
        amountTwd: figure(200, "TWD", URLS.cathay, "外幣匯款費用：臨櫃轉帳匯款手續費 NT$200／每筆。"),
      },
      cableFeeTwd: figure(400, "TWD", URLS.cathay, "臨櫃郵電費 NT$400／每筆。"),
      fullAmountExtraTwd: figure(500, "TWD", URLS.cathay, "全額匯達受款行：臨櫃及數位通路另加收郵電費 NT$500／每筆。"),
      fxSpreadPct: spreadPending(URLS.cathay),
      digitalCableFeeTwd: figure(300, "TWD", URLS.cathay, "數位通路匯款：郵電費 NT$300／每筆。"),
      digitalHandlingTwd: figure(null, "TWD", URLS.cathay, "查閱時頁面沒有列出數位通路的手續費，待確認，不當成免收。"),
      sourceUrls: [URLS.cathay],
      note: "試算用臨櫃費率，因為數位通路手續費在頁面上讀不到。頁面沒有更新日期。",
    },
    {
      id: "wise",
      provider: "Wise",
      name: "Wise 多幣別帳戶",
      type: "多幣別帳戶",
      channel: "App／網頁",
      availableFromTwd: "待確認",
      handling: {
        type: "pct",
        pct: figure(null, "pct", URLS.wisePricing, "定價頁只寫費用是匯款金額的某個百分比、依幣別而異，沒有給 TWD→GBP 的數字。"),
        minTwd: figure(null, "TWD", URLS.wisePricing, "未列。"),
        maxTwd: figure(null, "TWD", URLS.wisePricing, "未列。"),
      },
      cableFeeTwd: figure(null, "TWD", URLS.wisePricing, "不走電報費結構；匯出費沒有對台灣用戶的公開數字。"),
      fullAmountExtraTwd: figure(null, "TWD", URLS.wisePricing, "未列。"),
      fxSpreadPct: figure(null, "pct", URLS.wisePricing, "頁面稱使用 mid-market rate 另收費用，沒有給比例。待確認。"),
      sourceUrls: [URLS.wiseCurrencies, URLS.wisePricing],
      note: "Wise 說明頁的可匯出／匯入幣別清單裡沒有 TWD；GBP 在清單內。台灣學生能否從新臺幣直接使用待確認，所以不試算。",
    },
  ];

  return {
    CHECKED_AT: CHECKED_AT,
    urls: URLS,
    figure: figure,
    list: function () { return JSON.parse(JSON.stringify(accounts)); },
  };
});
