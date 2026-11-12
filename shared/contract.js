/**
 * A／B／C／D／E 共用的費用身分。
 * inclusion_flag 用中文；C 引擎內部仍用 included／extra／pending／none。
 * 缺必填欄直接拒收，不把缺欄補成 null，也不把待確認補成 0。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Contract = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var MANUSCRIPT_URL =
    "https://docs.google.com/document/d/1LCZ0SpoNxEAr_A-FNSt6kqPtIK48DuQPaedq_bB95Cc/edit";
  var SHEET_URL =
    "https://docs.google.com/spreadsheets/d/13TbRNuRq4fHk82y9PqMkcMUGN8-EEzGuyPzcQe3W62Q/edit";

  var TO_ENGINE = {
    已含: "included",
    另計: "extra",
    待確認: "pending",
    無此費用: "none",
    included: "included",
    extra: "extra",
    pending: "pending",
    none: "none",
  };

  var TO_ZH = {
    included: "已含",
    extra: "另計",
    pending: "待確認",
    none: "無此費用",
  };

  var REQUIRED_KEYS = [
    "fee_id",
    "school_id",
    "program_id",
    "intake",
    "fee_type",
    "currency",
    "amount",
    "status",
    "inclusion_flag",
    "included_in_fee_id",
    "source_ref",
  ];

  function hasOwn(obj, key) {
    return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function validateFeeInput(fee) {
    if (!fee || typeof fee !== "object") return { ok: false, reason: "費用不是物件，拒收。" };
    var missing = REQUIRED_KEYS.filter(function (key) {
      return !hasOwn(fee, key);
    });
    if (missing.length) {
      return { ok: false, reason: "缺必填欄，拒收，不把缺欄當成 null：" + missing.join("、") };
    }
    var inclusion = TO_ENGINE[fee.inclusion_flag];
    if (!inclusion) return { ok: false, reason: "inclusion_flag 無法識別，拒收。" };
    if (inclusion === "pending" && fee.amount !== null) {
      return { ok: false, reason: "待確認的 amount 必須是 null，不可填 0 或其他數字。" };
    }
    if (inclusion === "extra") {
      if (typeof fee.amount !== "number" || !isFinite(fee.amount) || fee.amount < 0) {
        return { ok: false, reason: "另計必須是已查明的非負金額。" };
      }
    }
    if (inclusion === "none") {
      if (!fee.zero_evidence) {
        return { ok: false, reason: "無此費用必須有可追溯的零費證據，否則不能填 0。" };
      }
      if (!fee.source_ref || !fee.source_ref.url) {
        return { ok: false, reason: "零費證據缺來源 URL，拒收。" };
      }
    }
    if (inclusion === "included" && (!fee.included_in_fee_id || fee.included_in_fee_id === fee.fee_id)) {
      return { ok: false, reason: "已含必須指向另一筆費用，禁止自指。" };
    }
    if (!fee.assumption && inclusion !== "pending") {
      if (!fee.source_ref || !fee.source_ref.url) {
        return { ok: false, reason: "非假設數字缺來源 URL，拒收。" };
      }
    }
    return { ok: true, inclusion: inclusion };
  }

  return {
    MANUSCRIPT_URL: MANUSCRIPT_URL,
    SHEET_URL: SHEET_URL,
    TO_ENGINE: TO_ENGINE,
    TO_ZH: TO_ZH,
    REQUIRED_KEYS: REQUIRED_KEYS,
    hasOwn: hasOwn,
    clone: clone,
    validateFeeInput: validateFeeInput,
  };
});
