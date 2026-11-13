/**
 * D｜信用卡海外刷卡。只收各銀行官方頁面上查得到的費率。
 * 每個數字都是 figure：{ value, unit, status, sourceUrl, checkedAt, note }。
 * 查不到就 value: null、status「待確認」，不憑記憶填，也不當成 0。
 * 僅供比較，非金融建議；不排名、不推薦特定卡片。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.DCards = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var CHECKED_AT = "2026-11-13";

  /** 有值就一定要有來源網址；沒有來源的值一律退回 null／待確認。 */
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
    dbsTerms: "https://www.dbs.com.tw/iwov-resources/pdf/legal%20disclaimers%20and%20announcements/01_personal%20finance/04_credit%20cards/cardterms.pdf",
    dbsFeePage: "https://www.dbs.com.tw/personal-zh/cards/services/credit_card_fee",
    dbsEco: "https://www.dbs.com.tw/personal-zh/cards/dbs-credit-cards/eco-select",
    ctbcFaq: "https://service.ctbcbank.com/FAQ/Page01?kmid=4724",
    esunFaq: "https://www.esunbank.com/zh-tw/about/faq/content?q=credit_card%2F018",
    esunPayinfo: "https://www.esunbank.com/en/personal/credit-card/payinfo",
    taishinFee: "https://www.taishinbank.com.tw/TSB/personal/common/legal-disclaimers/TSBankPublicDisclosure-000009/",
    taishinCards: "https://www.taishinbank.com.tw/TSB/personal/credit/intro/overview/cg047/card001/",
    cathayNotice: "https://www.cathay-cube.com.tw/cathaybk/personal/product/credit-card/rights/notice",
    cathayCube: "https://www.cathay-cube.com.tw/cathaybk/personal/product/credit-card/cards/cube",
  };

  var cards = [
    {
      id: "dbs-eco-select",
      issuer: "星展銀行（台灣）",
      name: "星展 eco 永續優選卡",
      networks: "依卡面國際組織",
      networkFeePct: figure(1, "pct", URLS.dbsTerms, "持卡須知「國外交易手續費」：國際組織手續費 1%（如有），以國際組織公告為準。"),
      bankFeePct: figure(0.5, "pct", URLS.dbsTerms, "同一條：星展銀行（台灣）以交易金額 0.5% 計算之國外交易服務費。"),
      totalFeePct: figure(null, "pct", URLS.dbsTerms, "文件沒有另寫合計；試算用上面兩項相加。"),
      rewardPct: figure(0.5, "pct", URLS.dbsEco, "卡片頁：國內／國外一般消費 0.5% 無上限，活動期間 2026-01-01 至 2026-12-31。"),
      rewardKind: "現金回饋",
      ukInStoreReward: "不適用",
      ukInStoreRewardNote: "卡片頁注意事項：歐洲地區（含英國）實體商店刷卡不計入合格消費。",
      tuitionReward: "不適用",
      tuitionRewardNote: "卡片頁注意事項把「學雜費」列為不回饋項目。英國校方繳費頁怎麼歸類，仍以帳單為準。",
      rewardSourceUrl: URLS.dbsEco,
      sourceUrls: [URLS.dbsTerms, URLS.dbsEco, URLS.dbsFeePage],
      note: "指定的「信用卡各項費用說明」頁查閱時只讀得到目錄，費率改引同一銀行的持卡須知 PDF。",
    },
    {
      id: "ctbc-general",
      issuer: "中國信託",
      name: "中信信用卡（VISA／Mastercard／JCB 通則）",
      networks: "VISA、Mastercard、JCB",
      networkFeePct: figure(1, "pct", URLS.ctbcFaq, "FAQ「國外交易手續費如何收取」：VISA、Mastercard、JCB 國際組織手續費 1%。美國運通另計，這裡不收錄。"),
      bankFeePct: figure(0.5, "pct", URLS.ctbcFaq, "同一頁：發卡機構以交易金額 0.5% 計算之國外交易服務費。"),
      totalFeePct: figure(1.5, "pct", URLS.ctbcFaq, "同一頁例示：10,000 × 1.5% = 150 元。"),
      rewardPct: figure(null, "pct", null, "沒有鎖定單一卡種，海外回饋率待確認。"),
      rewardKind: "待確認",
      ukInStoreReward: "待確認",
      ukInStoreRewardNote: "",
      tuitionReward: "待確認",
      tuitionRewardNote: "沒有查到學費是否適用回饋的官方說明。",
      rewardSourceUrl: null,
      sourceUrls: [URLS.ctbcFaq],
      note: "只收錄銀行層級的國外交易手續費結構。即使在台灣刷卡，收單行在國外也會收。",
    },
    {
      id: "esun-general",
      issuer: "玉山銀行",
      name: "玉山信用卡（VISA／Mastercard／JCB 通則）",
      networks: "VISA、Mastercard、JCB",
      networkFeePct: figure(null, "pct", URLS.esunFaq, "FAQ 沒有把國際組織手續費單獨寫成百分比，不自行用 1.5% − 0.5% 反推。"),
      bankFeePct: figure(0.5, "pct", URLS.esunFaq, "FAQ：玉山銀行以交易金額之 0.5% 計算之國外交易服務費。"),
      totalFeePct: figure(1.5, "pct", URLS.esunFaq, "FAQ 表格「手續費率」：VISA、Mastercard、JCB 外幣交易與國外新臺幣交易皆 1.5%。英文費用頁同。"),
      rewardPct: figure(null, "pct", null, "沒有鎖定單一卡種，海外回饋率待確認。"),
      rewardKind: "待確認",
      ukInStoreReward: "待確認",
      ukInStoreRewardNote: "",
      tuitionReward: "待確認",
      tuitionRewardNote: "沒有查到學費是否適用回饋的官方說明。",
      rewardSourceUrl: null,
      sourceUrls: [URLS.esunFaq, URLS.esunPayinfo],
      note: "頁面對 1.5% 是否已含銀行的 0.5% 沒有明講；試算採表列的 1.5% 合計，拆項留待確認。",
    },
    {
      id: "taishin-richart",
      issuer: "台新銀行",
      name: "台新 Richart 卡",
      networks: "VISA、Mastercard、JCB",
      networkFeePct: figure(1, "pct", URLS.taishinFee, "費用揭露頁：約定應給付國際組織之服務費 1%。"),
      bankFeePct: figure(0.5, "pct", URLS.taishinFee, "同一頁：交易金額 0.5% 計算之本行服務費。"),
      totalFeePct: figure(null, "pct", URLS.taishinFee, "該頁沒有另寫合計；試算用上面兩項相加。"),
      rewardPct: figure(3.3, "pct", URLS.taishinCards, "卡片總覽：「玩旅刷」方案海外消費 3.3% 台新 Point，2026-07-01 至 2027-12-31 消費適用，須在 App 切換方案，加碼有額度上限。"),
      rewardKind: "點數（台新 Point），不是現金",
      ukInStoreReward: "適用",
      ukInStoreRewardNote: "頁面寫海外消費含實體及線上、歐洲國家交易。須先切換到「玩旅刷」。",
      tuitionReward: "待確認",
      tuitionRewardNote: "該頁沒有寫學費／學雜費是否回饋，只說不回饋項目詳見專屬網頁。",
      rewardSourceUrl: URLS.taishinCards,
      sourceUrls: [URLS.taishinFee, URLS.taishinCards],
      note: "回饋是點數且有上限，不能直接拿來抵手續費。",
    },
    {
      id: "cathay-cube",
      issuer: "國泰世華銀行",
      name: "國泰世華 CUBE 卡",
      networks: "依卡面國際組織",
      networkFeePct: figure(1, "pct", URLS.cathayNotice, "用卡及繳款須知：應向國際組織給付之手續費 1%。同頁另一處寫 0.8%～1%，以帳單為準。"),
      bankFeePct: figure(0.5, "pct", URLS.cathayNotice, "同一頁：本行以交易金額 0.5% 計算之國外交易服務費。"),
      totalFeePct: figure(null, "pct", URLS.cathayNotice, "該頁沒有另寫合計；試算用上面兩項相加。"),
      rewardPct: figure(null, "pct", URLS.cathayCube, "卡片頁查閱時讀不到回饋內容，海外回饋率待確認。"),
      rewardKind: "待確認",
      ukInStoreReward: "待確認",
      ukInStoreRewardNote: "",
      tuitionReward: "待確認",
      tuitionRewardNote: "沒有查到學費是否適用回饋的官方說明。",
      rewardSourceUrl: null,
      sourceUrls: [URLS.cathayNotice, URLS.cathayCube],
      note: "國際組織費率依各組織規定，可能變動。",
    },
  ];

  return {
    CHECKED_AT: CHECKED_AT,
    urls: URLS,
    figure: figure,
    list: function () { return JSON.parse(JSON.stringify(cards)); },
  };
});
