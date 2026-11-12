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
      if (!Object.prototype.hasOwnProperty.call(fee, "amount") && fee.inclusion === "extra") {
        rejected.push({ id: fee.id, reason: "另計項目完全缺 amount 欄，拒收此版（C-0956a S4）。" });
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
    var funds = input.funds || {};
    // 未填的資金不是 0。明示 0 才代表這次試算不計入該欄。
    function readFund(v) {
      if (v === null || v === undefined || v === "") return null;
      return asNum(v);
    }
    var savings = readFund(funds.savings);
    var family = readFund(funds.family);
    var scholarship = readFund(funds.scholarship);
    var fundsComplete = savings !== null && family !== null && scholarship !== null;
    var availableSum = fundsComplete ? savings + family + scholarship : null;

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
      var paidUnknown = deposit.paid === null;
      var paid = paidUnknown ? null : !!deposit.paid;
      var balance = paidUnknown || tuitionAmt === null ? null : tuitionAmt - (paid ? depAmt : 0);
      depositInfo = {
        amount: depAmt,
        currency: deposit.currency || "GBP",
        paid: paid,
        partOfFeeId: (deposit && deposit.partOfFeeId) || (tuitionFee && tuitionFee.id) || "tuition",
        balanceDue: balance,
        note: paidUnknown
          ? "付款狀態未知，不假設已付或未付，balance_due 為 null。"
          : "訂金是學費預付，不另加總成本；已付或未付只改待付餘額。",
      };
    }

    var baseTwd = twdKnown + gbpKnown * fxRate;
    var knownSubtotalRaw = round2(baseTwd);
    var knownSubtotal = round2(baseTwd * (1 + reserveRate));
    var complete = !pending && !requiredMissing && resolved.conflicts.length === 0;
    var finalTotal = complete ? knownSubtotal : null;
    var confirmedGap = complete && fundsComplete ? round2(finalTotal - availableSum) : null;
    var loan = suggestLoan(confirmedGap);
    var annualRate = asNum(input.loan && input.loan.annualRate);
    var termMonths = asNum(input.loan && input.loan.termMonths);
    var graceRaw = input.loan ? input.loan.graceMonths : 0;
    var graceMonths = graceRaw === null || graceRaw === "" ? null : asNum(graceRaw) || 0;
    var payment = loan === null || annualRate === null || termMonths === null ? null : monthlyPayment(loan, annualRate, termMonths);
    var gracePay = loan === null || annualRate === null ? null : graceInterestMonthly(loan, annualRate);
    var income = asNum(input.incomeMonthly);
    var burden = payment === null || income === null || income <= 0 ? null : round2((payment / income) * 100);

    var refTotal = knownSubtotal;
    var refGap = fundsComplete ? round2(refTotal - availableSum) : null;
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
      available: fundsComplete ? round2(availableSum) : null,
      fundsComplete: fundsComplete,
      funds: { savings: savings, family: family, scholarship: scholarship },
      confirmedGap: confirmedGap,
      loanAmount: loan,
      monthlyPayment: payment,
      graceInterestMonthly: graceMonths === null ? null : graceMonths > 0 ? gracePay : 0,
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
        assumption: false,
        note: "已含在學費內，不另加總成本。",
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
        amount: (asNum(opts.livingMonthlyGbp) || 0) * (asNum(opts.livingMonths) || 0),
        currency: "GBP",
        inclusion: "extra",
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
          "，見 GOV.UK money 頁；門檻不是實際生活費，也不與本列重複加總。",
      },
      {
        id: "other-gbp",
        version: 1,
        name: "其他外幣支出",
        amount: asNum(opts.otherGbp) || 0,
        currency: "GBP",
        inclusion: "extra",
        required: false,
        assumption: true,
        note: "假設。若為 0，代表此試算未列其他外幣費，不代表實際上沒有。",
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

  return {
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
    asNum: asNum,
  };
});
