/**
 * A v0.3 候選契約的結構檢查。
 * 組員尚未在協調頁確認；程式先按這一版，並在畫面上標明。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Contract = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var FLAGS = ["已含", "另計", "待確認", "無此費用"];
  var TO_ENGINE = { 已含: "included", 另計: "extra", 待確認: "pending", 無此費用: "none" };
  var FROM_ENGINE = { included: "已含", extra: "另計", pending: "待確認", none: "無此費用" };
  var REQUIRED = [
    "fee_id",
    "item_version",
    "school_id",
    "program_id",
    "intake",
    "coverage_start",
    "coverage_end",
    "fee_type",
    "currency",
    "amount",
    "status",
    "inclusion_flag",
    "included_in_fee_id",
    "source_ref",
  ];

  function has(obj, key) {
    return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function hasEvidence(fee) {
    var src = fee.source_ref || {};
    // 學生自報（self_reported）要有說明文字才算有來源；畫面與 E 會另外標「非本站查證」。
    var selfReported = !!(src.self_reported && typeof src.label === "string" && src.label.trim());
    return !!(src.url || src.assumption || fee.assumption || fee.zero_evidence || selfReported);
  }

  function validateFeeSnapshot(fee) {
    if (!fee || typeof fee !== "object") return "不是費用快照";
    for (var i = 0; i < REQUIRED.length; i++) {
      if (!has(fee, REQUIRED[i])) return "缺必填欄 " + REQUIRED[i] + "，拒收，不把缺欄當成 null。";
    }
    if (typeof fee.fee_id !== "string" || !fee.fee_id) return "fee_id 無效";
    if (typeof fee.item_version !== "number" || !isFinite(fee.item_version) || fee.item_version < 1) {
      return "item_version 無效";
    }
    if (FLAGS.indexOf(fee.inclusion_flag) < 0) return "inclusion_flag 無效";
    if (!fee.source_ref || typeof fee.source_ref !== "object") return "source_ref 無效";
    if (fee.inclusion_flag === "待確認") {
      if (fee.amount !== null) return "待確認的 amount 必須是 null";
      if (fee.status !== "待查") return "待確認必須是待查";
    }
    if (fee.inclusion_flag === "另計") {
      if (typeof fee.amount !== "number" || fee.amount < 0) return "另計須為非負金額";
      if (fee.status !== "已查明") return "另計須已查明";
      if (!hasEvidence(fee)) return "另計缺來源或假設標記";
    }
    if (fee.inclusion_flag === "無此費用") {
      if (fee.amount !== 0) return "無此費用的 amount 必須是 0";
      if (!fee.zero_evidence) return "無此費用缺零費證據，不能填 0";
      if (fee.status !== "已查明") return "無此費用須已查明";
    }
    if (fee.inclusion_flag === "已含") {
      if (typeof fee.amount !== "number" || fee.amount < 0) return "已含須為非負金額";
      if (!fee.included_in_fee_id) return "已含缺 included_in_fee_id";
      if (fee.included_in_fee_id === fee.fee_id) return "已含不可自指";
      if (!hasEvidence(fee)) return "已含缺包含證據";
      if (fee.status !== "已查明") return "已含須已查明";
    }
    return null;
  }

  function contentKey(fee) {
    return JSON.stringify({
      amount: fee.amount,
      currency: fee.currency,
      inclusion_flag: fee.inclusion_flag,
      included_in_fee_id: fee.included_in_fee_id,
      zero_evidence: !!fee.zero_evidence,
    });
  }

  function inclusionGraphError(fees) {
    var byId = {};
    fees.forEach(function (fee) {
      byId[fee.fee_id] = fee;
    });
    var ids = Object.keys(byId);
    for (var i = 0; i < ids.length; i++) {
      var fee = byId[ids[i]];
      if (fee.inclusion_flag !== "已含") continue;
      var seen = {};
      var cursor = fee;
      while (cursor && cursor.inclusion_flag === "已含") {
        if (seen[cursor.fee_id]) return "包含關係循環（" + cursor.fee_id + "）";
        seen[cursor.fee_id] = true;
        var target = byId[cursor.included_in_fee_id];
        if (!target) return "包含目標不在同一快照（" + cursor.included_in_fee_id + "）";
        if (target.inclusion_flag !== "另計" && target.inclusion_flag !== "已含") {
          return "包含目標必須是有效的另計項（" + target.fee_id + "）";
        }
        cursor = target;
      }
    }
    return null;
  }

  return {
    FLAGS: FLAGS,
    REQUIRED: REQUIRED,
    toEngineInclusion: function (flag) {
      return TO_ENGINE[flag] || "pending";
    },
    fromEngineInclusion: function (flag) {
      return FROM_ENGINE[flag] || "待確認";
    },
    clone: clone,
    validateFeeSnapshot: validateFeeSnapshot,
    contentKey: contentKey,
    inclusionGraphError: inclusionGraphError,
  };
});
