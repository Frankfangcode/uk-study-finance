/**
 * 留學財務長 AI｜C 模組：總成本、資金缺口、貸款試算
 * 規則依協作表 G-01／C-atlas-t02／t03／m01／22a1／0956a 與先讀我 Demo（台灣學生赴英碩士）。
 * 可在瀏覽器與 Node 使用，不依賴 DOM。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CModule = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var SOURCES = {
    ihs: {
      label: "GOV.UK Immigration Health Surcharge",
      url: "https://www.gov.uk/healthcare-immigration-application/how-much-pay",
      note: "學生年費 £776；超過一年且 18 個月以內收一年加半年。查閱 2026-11-12，頁面擷取未顯示更新日。",
    },
    visaFee: {
      label: "GOV.UK Student visa",
      url: "https://www.gov.uk/student-visa",
      note: "境外申請學生簽證費 £558。查閱 2026-11-12。",
    },
    visaLength: {
      label: "Immigration Rules Appendix Student ST 25.2–25.3",
      url: "https://www.gov.uk/guidance/immigration-rules/immigration-rules-appendix-student",
      note: "12 個月以上課程：開課前最多 1 個月＋課程長度＋結束後 4 個月。查閱 2026-11-12。",
    },
    maintenance: {
      label: "GOV.UK Student visa: money",
      url: "https://www.gov.uk/student-visa/money",
      note: "非倫敦生活費財力證明標準 £1,171／月，最多算 9 個月。這是簽證財力門檻，不是實際生活預算，不可與自訂生活費重複加總。來源見 B-20261106-h2b3；查閱 2026-11-06。",
    },
    glasgowTuition: {
      label: "University of Glasgow MSc Data Science & Artificial Intelligence",
      url: "https://www.gla.ac.uk/postgraduate/taught/data-science-artificial-intelligence/",
      note: "2027-28 國際／EU 學費 £34,815；同段訂金 £2,000。頁面未標發布日；查閱紀錄見 B-20261110-m4p2、A-20261110-h29a。",
    },
    glasgowDeposit: {
      label: "University of Glasgow postgraduate deposits",
      url: "https://www.gla.ac.uk/postgraduate/feesandfunding/deposits/",
      note: "訂金抵扣學費餘額（條款 7.4，見 B-20261106-h3c9）。退費條款目前見到 2026/27 版，2027/28 適用性待確認。",
    },
    edinburghTuition: {
      label: "University of Edinburgh MSc Data Science 2027/8 fees",
      url: "https://study.ed.ac.uk/programmes/postgraduate-taught-campus-fees?programme_code=PTMSCDATSC1F&year=2027",
      note: "Academic Session 2027/8，International / EU £47,680，不含額外費用。學費頁發布 2026-10-06；見 B-20261110-k7m2／m4p1。",
    },
    edinburghDeposit: {
      label: "University of Edinburgh programme page: deposit",
      url: "https://study.ed.ac.uk/programmes/postgraduate-taught/902-data-science",
      note: "訂金 £1,500，原文 contributes towards your tuition fees；入學年 2027。見 B-20261110-m4p1。",
    },
    glasgowPayment: {
      label: "Glasgow self-funded payment methods",
      url: "https://www.gla.ac.uk/myglasgow/students/payingyourfees/selffundedpaymentmethods/",
      note: "自 2025-03-01 起不接受學生直接銀行轉帳，導向 Convera；另有 MyCampus 卡付及有條件 Direct Debit。查閱 2026-11-10，見 D-20261110-d08h。",
    },
  };

  var IHS_YEAR_GBP = 776;
  var VISA_FEE_OUTSIDE_GBP = 558;
  var MAINTENANCE_NON_LONDON_GBP = 1171;
  var MAINTENANCE_MONTHS_MAX = 9;

  function isBlank(v) {
    return v === null || v === undefined || v === "";
  }

  function asNum(v) {
    if (isBlank(v)) return null;
    var n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  function ihsAmountGbp(courseLengthMonths) {
    var n = asNum(courseLengthMonths);
    if (n === null || n <= 0) {
      return {
        amount: null,
        visaMonthsMax: null,
        band: null,
        complete: false,
        reason: "課程長度未知，IHS 不可預設。",
      };
    }
    if (n < 6) {
      return {
        amount: null,
        visaMonthsMax: null,
        band: null,
        complete: false,
        reason: "短於 6 個月的課程，本模組尚未核對 IHS 規則原文，標待查、不編造。",
      };
    }
    var before = 1;
    var after = n >= 12 ? 4 : 2;
    var visaMax = before + n + after;
    var amount = null;
    var band = null;
    if (visaMax <= 12) {
      amount = IHS_YEAR_GBP;
      band = "一年（未超過 12 個月）";
    } else if (visaMax <= 18) {
      amount = IHS_YEAR_GBP + IHS_YEAR_GBP / 2;
      band = "一年加半年（超過 12 個月且不超過 18 個月）";
    } else if (visaMax < 24) {
      amount = IHS_YEAR_GBP * 2;
      band = "兩整年（超過 18 個月且未滿 2 年）";
    } else {
      return {
        amount: null,
        visaMonthsMax: visaMax,
        band: null,
        complete: false,
        reason: "簽證期間已達 2 年或以上，GOV.UK 該頁未在本專題核到完整算法，標待查。",
      };
    }
    return {
      amount: amount,
      visaMonthsMax: visaMax,
      band: band,
      complete: true,
      reason:
        "課程 " +
        n +
        " 個月，依 ST 25.3 最長簽證 " +
        visaMax +
        " 個月（開課前 " +
        before +
        "＋課程＋結束後 " +
        after +
        "）。",
    };
  }

  function suggestLoan(gap) {
    if (gap === null || gap === undefined) return null;
    if (gap <= 0) return 0;
    return Math.ceil(gap / 10000) * 10000;
  }

  function monthlyPayment(principal, annualRate, months) {
    if (principal === null || principal === undefined) return null;
    if (principal <= 0 || !months || months <= 0) return 0;
    var r = (asNum(annualRate) || 0) / 12;
    if (r === 0) return round2(principal / months);
    var pow = Math.pow(1 + r, months);
    return round2((principal * r * pow) / (pow - 1));
  }

  function graceInterestMonthly(principal, annualRate) {
    if (principal === null || principal === undefined) return null;
    if (principal <= 0) return 0;
    return round2(principal * ((asNum(annualRate) || 0) / 12));
  }

  function resolveFees(fees) {
    var byId = {};
    var conflicts = [];
    var rejected = [];
    (fees || []).forEach(function (fee, idx) {
      if (!fee || !fee.id) {
        rejected.push({ index: idx, reason: "缺 fee_id，拒收。" });
        return;
      }
      if (!Object.prototype.hasOwnProperty.call(fee, "amount")) {
        rejected.push({ id: fee.id, reason: "完全缺 amount 欄，拒收此版，不把缺欄當成 null（C-0956a S4）。" });
        return;
      }
      var version = asNum(fee.version);
      if (version === null) version = 1;
      var prev = byId[fee.id];
      if (!prev) {
        byId[fee.id] = Object.assign({}, fee, { version: version });
        return;
      }
      if (prev.version === version) {
        var sameAmount = asNum(prev.amount) === asNum(fee.amount) && prev.inclusion === fee.inclusion;
        if (sameAmount) return;
        conflicts.push({
          id: fee.id,
          version: version,
          reason: "同 fee_id 同版本內容不一致，標衝突、不輸出確定總額。",
        });
        byId[fee.id]._conflict = true;
        return;
      }
      if (version > prev.version) byId[fee.id] = Object.assign({}, fee, { version: version });
    });
    return { byId: byId, conflicts: conflicts, rejected: rejected };
  }

  function feeContributes(fee) {
    if (!fee || fee._conflict) return { known: false, amount: 0, pending: true };
    var inc = fee.inclusion || "extra";
    if (inc === "included") return { known: true, amount: 0, pending: false };
    if (inc === "none") {
      if (fee.zeroEvidence) return { known: true, amount: 0, pending: false };
      return { known: false, amount: 0, pending: true, reason: "標「無此費用」但缺零費證據，不能填 0。" };
    }
    if (inc === "pending") return { known: false, amount: 0, pending: true };
    if (inc === "extra") {
      var amt = asNum(fee.amount);
      if (amt === null) return { known: false, amount: 0, pending: true };
      return { known: true, amount: amt, pending: false };
    }
    return { known: false, amount: 0, pending: true };
  }

  function toTwd(amount, currency, fxRate) {
    if (amount === 0) return 0;
    if (currency === "TWD" || currency === "NTD") return amount;
    return amount * fxRate;
  }

  function calculatePlan(input) {
    input = input || {};
    var fxRate = asNum(input.fxRate);
    var reserveRate = asNum(input.reserveRate);
    if (reserveRate === null) reserveRate = 0;
    if (reserveRate < 0) {
      return { ok: false, error: "預備金比例不能是負數。不留預備金請填 0。" };
    }
    var termInput = asNum(input.loan && input.loan.termMonths);
    if (termInput !== null && termInput <= 0) {
      return { ok: false, error: "攤還期數必須大於 0。0 期或負數算不出月付，不能顯示成月付 0。" };
    }
    var funds = input.funds || {};
    var savings = asNum(funds.savings) || 0;
    var family = asNum(funds.family) || 0;
    var scholarship = asNum(funds.scholarship) || 0;
    var available = savings + family + scholarship;

    var warnings = [];
    if (fxRate === null || fxRate <= 0) {
      return { ok: false, error: "匯率缺失或無效。若使用假設匯率，請標明為假設。" };
    }

    var resolved = resolveFees(input.fees);
    resolved.conflicts.forEach(function (c) {
      warnings.push(c.reason + "（" + c.id + " v" + c.version + "）");
    });
    resolved.rejected.forEach(function (r) {
      warnings.push(r.reason + (r.id ? "（" + r.id + "）" : ""));
    });

    var lines = [];
    var gbpKnown = 0;
    var twdKnown = 0;
    var pending = resolved.conflicts.length > 0;
    var requiredMissing = false;

    Object.keys(resolved.byId).forEach(function (id) {
      var fee = resolved.byId[id];
      var part = feeContributes(fee);
      var currency = fee.currency || "TWD";
      var twd = part.known ? toTwd(part.amount, currency, fxRate) : null;
      if (part.pending) pending = true;
      if (fee.required && part.pending) requiredMissing = true;
      if (part.known) {
        if (currency === "GBP") gbpKnown += part.amount;
        else twdKnown += part.amount;
      }
      lines.push({
        id: fee.id,
        version: fee.version,
        name: fee.name || fee.id,
        amount: asNum(fee.amount),
        currency: currency,
        inclusion: fee.inclusion || "extra",
        known: part.known,
        contributeTwd: twd,
        source: fee.source || "",
        sourceUrl: fee.sourceUrl || "",
        assumption: !!fee.assumption,
        zeroEvidence: !!fee.zeroEvidence,
        note: fee.note || part.reason || "",
        conflict: !!fee._conflict,
      });
    });

    var deposit = input.deposit || null;
    var tuitionFee = resolved.byId[(deposit && deposit.partOfFeeId) || "tuition"] || resolved.byId["tuition-01"];
    var depositInfo = null;
    if (deposit && asNum(deposit.amount) !== null) {
      var depAmt = asNum(deposit.amount);
      var tuitionAmt = tuitionFee ? asNum(tuitionFee.amount) : null;
      var paidKnown = deposit.paid === true || deposit.paid === false;
      var paid = paidKnown ? deposit.paid === true : null;
      var balance = !paidKnown || tuitionAmt === null ? null : tuitionAmt - (paid ? depAmt : 0);
      depositInfo = {
        amount: depAmt,
        currency: deposit.currency || "GBP",
        paid: paid,
        partOfFeeId: (deposit && deposit.partOfFeeId) || (tuitionFee && tuitionFee.id) || "tuition",
        balanceDue: balance,
        note: paidKnown
          ? "訂金是學費預付，不另加總成本；已付或未付只改待付餘額。"
          : "付款狀態未知，不假設已付或未付，待付餘額留空。",
      };
    }

    var baseTwd = twdKnown + gbpKnown * fxRate;
    var knownSubtotalRaw = round2(baseTwd);
    var knownSubtotal = round2(baseTwd * (1 + reserveRate));
    var complete = !pending && !requiredMissing && resolved.conflicts.length === 0;
    var finalTotal = complete ? knownSubtotal : null;
    var confirmedGap = complete ? round2(finalTotal - available) : null;
    var loan = suggestLoan(confirmedGap);
    var annualRate = asNum(input.loan && input.loan.annualRate);
    var termMonths = asNum(input.loan && input.loan.termMonths);
    var graceMonths = asNum(input.loan && input.loan.graceMonths) || 0;
    var payment = loan === null || annualRate === null || termMonths === null ? null : monthlyPayment(loan, annualRate, termMonths);
    var gracePay = loan === null || annualRate === null ? null : graceInterestMonthly(loan, annualRate);
    var income = asNum(input.incomeMonthly);
    var burden = payment === null || income === null || income <= 0 ? null : round2((payment / income) * 100);

    var refTotal = knownSubtotal;
    var refGap = round2(refTotal - available);
    var refLoan = suggestLoan(refGap);

    return {
      ok: true,
      complete: complete,
      lines: lines,
      deposit: depositInfo,
      fxRate: fxRate,
      reserveRate: reserveRate,
      gbpKnown: round2(gbpKnown),
      twdKnown: round2(twdKnown),
      knownSubtotalRaw: knownSubtotalRaw,
      knownSubtotal: knownSubtotal,
      finalTotal: finalTotal,
      available: round2(available),
      funds: { savings: savings, family: family, scholarship: scholarship },
      confirmedGap: confirmedGap,
      loanAmount: loan,
      monthlyPayment: payment,
      graceInterestMonthly: graceMonths > 0 ? gracePay : 0,
      graceMonths: graceMonths,
      termMonths: termMonths,
      annualRate: annualRate,
      incomeMonthly: income,
      burdenPercent: burden,
      reference: complete
        ? null
        : {
            total: refTotal,
            gap: refGap,
            loan: refLoan,
            monthlyPayment:
              annualRate === null || termMonths === null ? null : monthlyPayment(refLoan, annualRate, termMonths),
            note: "僅就已知名目加預備金的暫估，待確認項目未計入，不是確定總額或確定缺口。",
          },
      warnings: warnings,
      pending: pending,
      requiredMissing: requiredMissing,
    };
  }

  var PRESETS = {
    glasgow: {
      id: "glasgow-dsai-2027",
      school: "University of Glasgow",
      schoolZh: "格拉斯哥大學",
      program: "MSc Data Science & Artificial Intelligence",
      programZh: "資料科學與人工智慧碩士",
      intake: "2027-09",
      courseLengthMonths: 12,
      tuitionGbp: 34815,
      depositGbp: 2000,
      city: "Glasgow（非倫敦）",
      tuitionSource: SOURCES.glasgowTuition,
      depositSource: SOURCES.glasgowDeposit,
    },
    edinburgh: {
      id: "edinburgh-ds-2027",
      school: "University of Edinburgh",
      schoolZh: "愛丁堡大學",
      program: "MSc Data Science",
      programZh: "資料科學碩士",
      intake: "2027-09",
      courseLengthMonths: 12,
      tuitionGbp: 47680,
      depositGbp: 1500,
      city: "Edinburgh（非倫敦）",
      tuitionSource: SOURCES.edinburghTuition,
      depositSource: SOURCES.edinburghDeposit,
    },
  };

  function buildStudentFees(opts) {
    opts = opts || {};
    var ihs = ihsAmountGbp(opts.courseLengthMonths);
    var fees = [
      {
        id: "tuition",
        version: 1,
        name: "學費",
        amount: asNum(opts.tuitionGbp),
        currency: "GBP",
        inclusion: "extra",
        required: true,
        source: opts.tuitionSource && opts.tuitionSource.label,
        sourceUrl: opts.tuitionSource && opts.tuitionSource.url,
        assumption: !!opts.tuitionAssumption,
        note: opts.tuitionNote || "",
      },
      {
        id: "deposit",
        version: 1,
        name: "訂金（學費預付）",
        amount: asNum(opts.depositGbp),
        currency: "GBP",
        inclusion: "included",
        required: false,
        source: opts.depositSource && opts.depositSource.label,
        sourceUrl: opts.depositSource && opts.depositSource.url,
        assumption: !!opts.depositAssumption,
        note: opts.depositAssumption ? "訂金金額已改過公布價，這是假設，不另加總成本。" : "已含在學費內，不另加總成本。",
      },
      {
        id: "ihs",
        version: 1,
        name: "IHS（簽證醫療附加費）",
        amount: ihs.amount,
        currency: "GBP",
        inclusion: ihs.complete ? "extra" : "pending",
        required: true,
        source: SOURCES.ihs.label,
        sourceUrl: SOURCES.ihs.url,
        assumption: false,
        note: ihs.reason + (ihs.band ? "級距：" + ihs.band + "。" : ""),
      },
      {
        id: "visa-fee",
        version: 1,
        name: "學生簽證費（境外申請）",
        amount: VISA_FEE_OUTSIDE_GBP,
        currency: "GBP",
        inclusion: "extra",
        required: true,
        source: SOURCES.visaFee.label,
        sourceUrl: SOURCES.visaFee.url,
        assumption: false,
        note: SOURCES.visaFee.note,
      },
      {
        id: "living",
        version: 1,
        name: "生活費（自訂預算）",
        amount: (function () {
          var monthly = asNum(opts.livingMonthlyGbp);
          var months = asNum(opts.livingMonths);
          if (monthly === null || months === null) return null;
          return monthly * months;
        })(),
        currency: "GBP",
        inclusion: asNum(opts.livingMonthlyGbp) === null || asNum(opts.livingMonths) === null ? "pending" : "extra",
        required: true,
        source: "",
        sourceUrl: "",
        assumption: true,
        note:
          "假設。簽證財力門檻參考（非倫敦）：£" +
          MAINTENANCE_NON_LONDON_GBP +
          " × " +
          MAINTENANCE_MONTHS_MAX +
          " 個月＝£" +
          MAINTENANCE_NON_LONDON_GBP * MAINTENANCE_MONTHS_MAX +
          "，見 GOV.UK money 頁；門檻不是實際生活費，也不與本列重複加總。未填不當作 0。",
      },
      {
        id: "other-gbp",
        version: 1,
        name: "其他外幣支出",
        amount: asNum(opts.otherGbp),
        currency: "GBP",
        inclusion: asNum(opts.otherGbp) === null ? "pending" : "extra",
        required: false,
        assumption: true,
        note: "假設。空白不是 0。若填 0，只代表這次試算沒有另列其他外幣費。",
      },
      {
        id: "twd-expenses",
        version: 1,
        name: "台幣支出（機票等）",
        amount: asNum(opts.twdExpenses),
        currency: "TWD",
        inclusion: isBlank(opts.twdExpenses) ? "pending" : "extra",
        required: true,
        assumption: true,
        note: "假設。專題原稿出現過 55,000 與 60,000 兩種寫法，組員尚未選定，本欄由使用者自填。",
      },
      {
        id: "school-insurance",
        version: 1,
        name: "校方強制保險",
        amount: isBlank(opts.schoolInsuranceGbp) ? null : asNum(opts.schoolInsuranceGbp),
        currency: "GBP",
        inclusion: opts.schoolInsuranceFlag || "pending",
        required: true,
        zeroEvidence: !!opts.schoolInsuranceZeroEvidence,
        assumption: false,
        note: "格拉斯哥與愛丁堡目前都是待確認（D-20261110-d07g、B-20261110-k7m2），不能當 0。",
      },
    ];
    if (!isBlank(opts.commercialInsuranceTwd) && asNum(opts.commercialInsuranceTwd) > 0) {
      fees.push({
        id: "commercial-insurance",
        version: 1,
        name: "商業／旅行保險（選用）",
        amount: asNum(opts.commercialInsuranceTwd),
        currency: "TWD",
        inclusion: "extra",
        required: false,
        assumption: true,
        note: "假設。選用項；若已含在台幣支出「機票與保險」合併欄，請勿再加。",
      });
    }
    return { fees: fees, ihs: ihs };
  }

  function toScenario(plan, meta) {
    meta = meta || {};
    var complete = !!(plan && plan.ok && plan.complete);
    var deposit = null;
    if (plan && plan.deposit) {
      deposit = {
        amount: plan.deposit.amount,
        currency: plan.deposit.currency,
        paid: plan.deposit.paid,
        part_of_fee_id: plan.deposit.partOfFeeId,
        balance_due: plan.deposit.balanceDue,
      };
    }
    var scenario = {
      module: "C",
      version: meta.version || "c-mvp-20261112",
      plan_id: meta.plan_id || null,
      revision: meta.revision == null ? 1 : meta.revision,
      snapshot_id: meta.snapshot_id || null,
      complete: complete,
      currency_out: "TWD",
      known_subtotal_twd: plan && plan.ok ? plan.knownSubtotal : null,
      final_total_twd: complete ? plan.finalTotal : null,
      confirmed_gap_twd: complete ? plan.confirmedGap : null,
      available_funds_twd: plan && plan.ok ? plan.available : null,
      funds: plan && plan.ok ? plan.funds : null,
      loan_amount_twd: complete ? plan.loanAmount : null,
      monthly_payment_twd: complete ? plan.monthlyPayment : null,
      grace_interest_monthly_twd: complete ? plan.graceInterestMonthly : null,
      burden_percent: complete ? plan.burdenPercent : null,
      deposit: deposit,
      fx_rate: plan ? plan.fxRate : null,
      reserve_rate: plan ? plan.reserveRate : null,
      warnings: (plan && plan.warnings) || [],
    };
    if (!complete && plan && plan.reference) {
      scenario.reference_only = {
        total: plan.reference.total,
        gap: plan.reference.gap,
        loan: plan.reference.loan,
        note: plan.reference.note || "僅已知名目暫估，不是確定總額",
      };
    }
    return scenario;
  }

  /**
   * 情境模擬：匯率變動、已核定獎學金落空，以及兩者同時發生時，還款壓力怎麼變。
   * 這是演練，不是預測。吃 calculatePlan 的輸出，不改原方案。
   *
   * opts.fxShockPct           匯率變動幅度（%），預設 10，必須大於 0 且小於 100。
   * opts.awardedScholarships  已核定的獎學金：[{ name, amount, currency, countedTwd }]。
   *                           未核定的不要放進來（本來就沒計入資金，也就沒有落空情境）。
   *                           countedTwd 是基準方案已計入資金的台幣額；沒給就用 amount 換算。
   * opts.reviewVerdict        E 審查結果。不是 "PASS"（含沒給）就不輸出確定值。
   *
   * 規則跟 calculatePlan 一樣：必要費用待確認時，確定總額、缺口、貸款、月付都是 null，
   * 只有已知小計與可用資金的變化；未知金額不當 0。
   */
  var SCENARIO_FX_SHOCK_DEFAULT_PCT = 10;

  function scholarshipTwd(amount, currency, fxRate) {
    if (currency === "TWD" || currency === "NTD") return amount;
    // 與 A.fundingCheck 相同：外幣減免換成台幣後取整到元。
    return Math.round(amount * fxRate);
  }

  function diff(value, base) {
    if (value === null || value === undefined || base === null || base === undefined) return null;
    return round2(value - base);
  }

  function simulateScenarios(plan, opts) {
    opts = opts || {};
    if (!plan || plan.ok !== true) {
      return { ok: false, error: (plan && plan.error) || "沒有可用的基準方案，無法做情境模擬。" };
    }
    var pct = opts.fxShockPct === undefined ? SCENARIO_FX_SHOCK_DEFAULT_PCT : asNum(opts.fxShockPct);
    if (pct === null || pct <= 0 || pct >= 100) {
      return { ok: false, error: "匯率變動幅度要填大於 0、小於 100 的百分比。留空或 0 不會被當成預設的 10%。" };
    }
    var baseFx = plan.fxRate;
    var reserve = plan.reserveRate || 0;
    var funds = plan.funds || { savings: 0, family: 0, scholarship: 0 };
    var reviewPass = opts.reviewVerdict === "PASS";
    var confirmed = !!plan.complete && reviewPass;

    var awards = [];
    (opts.awardedScholarships || []).forEach(function (item) {
      var amount = asNum(item && item.amount);
      if (amount === null || amount <= 0) return;
      var currency = item.currency || "GBP";
      var counted = asNum(item.countedTwd);
      if (counted === null) counted = scholarshipTwd(amount, currency, baseFx);
      awards.push({ id: item.id || null, name: item.name || "已核定獎學金", amount: amount, currency: currency, countedTwd: counted });
    });
    var countedTotal = awards.reduce(function (sum, item) { return sum + item.countedTwd; }, 0);
    // 已核定額不可能超過基準已計入的獎學金；超過代表輸入對不上，不硬算。
    if (countedTotal > (funds.scholarship || 0) + 0.005) {
      return { ok: false, error: "已核定獎學金的台幣額超過基準方案計入的獎學金，兩邊對不上，先不模擬。" };
    }
    var hasAwarded = awards.length > 0;

    function run(id, label, fxFactor, lost) {
      var fx = Math.round(baseFx * fxFactor * 1e6) / 1e6;
      var known = round2((plan.twdKnown + plan.gbpKnown * fx) * (1 + reserve));
      var scholarship = (funds.scholarship || 0) - countedTotal;
      if (!lost) {
        awards.forEach(function (item) {
          scholarship += fxFactor === 1 ? item.countedTwd : scholarshipTwd(item.amount, item.currency, fx);
        });
      }
      var available = round2((funds.savings || 0) + (funds.family || 0) + scholarship);
      var total = confirmed ? known : null;
      var gap = confirmed ? round2(total - available) : null;
      var loan = suggestLoan(gap);
      var payment = loan === null || plan.annualRate === null || plan.termMonths === null
        ? null
        : monthlyPayment(loan, plan.annualRate, plan.termMonths);
      var income = plan.incomeMonthly;
      var burden = payment === null || income === null || income === undefined || income <= 0
        ? null
        : round2((payment / income) * 100);
      return {
        id: id,
        label: label,
        fxRate: fx,
        scholarshipLost: !!lost,
        confirmed: confirmed,
        status: confirmed ? "確定" : "尚未確定",
        knownSubtotal: known,
        available: available,
        scholarshipCounted: round2(scholarship),
        finalTotal: total,
        confirmedGap: gap,
        loanAmount: loan,
        monthlyPayment: payment,
        burdenPercent: burden,
      };
    }

    var pctText = String(pct);
    var up = 1 + pct / 100;
    var down = 1 - pct / 100;
    var baseline = run("baseline", "基準（目前方案）", 1, false);
    var list = [
      baseline,
      run("fx-up", "英鎊兌台幣 +" + pctText + "%", up, false),
      run("fx-down", "英鎊兌台幣 −" + pctText + "%", down, false),
    ];
    if (hasAwarded) {
      list.push(run("scholarship-lost", "已核定的獎學金落空", 1, true));
      list.push(run("worst", "最壞情況：英鎊 +" + pctText + "% 且獎學金落空", up, true));
    }
    list.forEach(function (item) {
      item.delta = {
        knownSubtotal: diff(item.knownSubtotal, baseline.knownSubtotal),
        available: diff(item.available, baseline.available),
        finalTotal: diff(item.finalTotal, baseline.finalTotal),
        confirmedGap: diff(item.confirmedGap, baseline.confirmedGap),
        loanAmount: diff(item.loanAmount, baseline.loanAmount),
        monthlyPayment: diff(item.monthlyPayment, baseline.monthlyPayment),
        burdenPercent: diff(item.burdenPercent, baseline.burdenPercent),
      };
    });

    var reason = null;
    if (!plan.complete) reason = "還有待確認的必要費用，確定總額、缺口、貸款與月付都不輸出，只有已知小計的變化。";
    else if (!reviewPass) reason = "E 審查不是 PASS，確定值不輸出，只有已知小計的變化。";

    return {
      ok: true,
      kind: "演練，不是預測",
      fxShockPct: pct,
      baseFxRate: baseFx,
      confirmed: confirmed,
      status: confirmed ? "確定" : "尚未確定",
      unconfirmedReason: reason,
      hasAwardedScholarship: hasAwarded,
      awardedScholarships: awards,
      scholarshipNote: hasAwarded
        ? "外幣計價的減免，台幣價值會跟著情境匯率重算。"
        : "沒有已核定的獎學金，所以沒有「落空」與「最壞情況」；未核定的本來就不計入資金。",
      scenarios: list,
    };
  }

  return {
    simulateScenarios: simulateScenarios,
    SCENARIO_FX_SHOCK_DEFAULT_PCT: SCENARIO_FX_SHOCK_DEFAULT_PCT,
    SOURCES: SOURCES,
    PRESETS: PRESETS,
    IHS_YEAR_GBP: IHS_YEAR_GBP,
    VISA_FEE_OUTSIDE_GBP: VISA_FEE_OUTSIDE_GBP,
    MAINTENANCE_NON_LONDON_GBP: MAINTENANCE_NON_LONDON_GBP,
    MAINTENANCE_MONTHS_MAX: MAINTENANCE_MONTHS_MAX,
    ihsAmountGbp: ihsAmountGbp,
    suggestLoan: suggestLoan,
    monthlyPayment: monthlyPayment,
    graceInterestMonthly: graceInterestMonthly,
    calculatePlan: calculatePlan,
    buildStudentFees: buildStudentFees,
    toScenario: toScenario,
    asNum: asNum,
  };
});
