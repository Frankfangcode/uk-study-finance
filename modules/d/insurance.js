/**
 * D｜保險類型對照。只對照三條線各自是什麼，不推薦保單、不列保費報價。
 * 三條線不能加總成一個「保險費」：IHS 已經在 C 的成本裡，校方保險待確認，
 * 商業保險是選用且沒有報價。summary() 的 total 永遠是 null。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.DInsurance = factory();
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

  var IHS_URL = "https://www.gov.uk/healthcare-immigration-application/how-much-pay";

  var lines = [
    {
      id: "ihs",
      name: "IHS 移民醫療附加費",
      category: "簽證強制",
      mandatory: "是",
      collectedBy: "英國政府（申請學生簽證時線上繳）",
      amount: figure(776, "GBP／年", IHS_URL, "GOV.UK：學生每年 £776。超過 6 個月未滿一年的零頭仍收整年；6 個月以內的零頭收半年。"),
      covers: ["簽證期間使用 NHS 的資格"],
      mayOverlapWith: ["commercial"],
      overlapNote: "C 模組的成本已經列了 IHS，這裡不要再加一次。商業保險的一般就醫給付可能和 NHS 重疊；醫療轉送、財物、責任則不是 IHS 的範圍。",
      note: "一年制碩士的簽證通常超過 12 個月，實繳金額依簽證長度算，請看 C 頁的 IHS 那一列。",
    },
    {
      id: "school",
      name: "學校強制保險",
      category: "依校方",
      mandatory: "待確認",
      collectedBy: "校方（如果有）",
      amount: figure(null, "GBP", null, "格拉斯哥、愛丁堡目前都沒有可引用的金額。待確認，不是 0。"),
      covers: ["依校方規定，待確認"],
      mayOverlapWith: ["ihs", "commercial"],
      overlapNote: "要先向校方確認有沒有、保什麼。確認前不能假設它能取代 IHS 或商業保險，也不能把它算成 0。",
      note: "可以在引導流程第 2 步填入向校方確認的結果與來源。",
    },
    {
      id: "commercial",
      name: "選用商業保險（例如海外留學綜合保險）",
      category: "選用",
      mandatory: "否",
      collectedBy: "保險公司（自行投保）",
      amount: figure(null, "TWD", null, "本站不列保費報價，也不推薦保單。"),
      covers: ["可能涵蓋：海外緊急醫療轉送", "可能涵蓋：行李與個人財物", "可能涵蓋：個人責任", "實際範圍依各保單條款"],
      mayOverlapWith: ["ihs", "school"],
      overlapNote: "醫療給付可能和 IHS（NHS）或校方保險重複。投保前先對照另外兩條線已經保了什麼。",
      note: "是否需要、保哪些項目由你自己判斷，本站不做建議。",
    },
  ];

  function list() {
    return JSON.parse(JSON.stringify(lines));
  }

  /** 三條線各自列出，不加總。total 固定 null，避免被當成一筆「保險費」。 */
  function summary() {
    return {
      lines: list(),
      total: null,
      totalNote: "三條線的性質不同，不加總：IHS 已在 C 的成本裡，校方保險待確認，商業保險沒有報價。",
      disclaimer: "僅供比較，非金融建議。不推薦特定保單，不列保費報價。",
    };
  }

  return {
    CHECKED_AT: CHECKED_AT,
    urls: { ihs: IHS_URL },
    figure: figure,
    list: list,
    summary: summary,
  };
});
