/**
 * E｜審查（Wenz／何則文，協調者）
 *
 * review() 不改費用、不刪紀錄。缺來源、未知當 0、未完成卻宣稱總額 → 退修。
 * 資料檢查過了，正式 Demo 仍是轉真人，直到 release_signed 由真人設為 true（這個網站不會自己簽）。
 * screenLines() 把不該給學生看的數字改成 null。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("../../shared/contract.js"));
  else root.EModule = factory(root.Contract);
})(typeof globalThis !== "undefined" ? globalThis : this, function (Contract) {
  "use strict";

  function item(partial) {
    return {
      id: partial.id,
      label: partial.label,
      value: partial.value === undefined ? null : partial.value,
      display: partial.display || "",
      unit: partial.unit || "",
      status: partial.status,
      url: partial.url || "",
      retrieved: partial.retrieved || "",
      record: partial.record || "",
      note: partial.note || "",
    };
  }

  var CONSTANTS = [
    item({ id: "ihs-year", label: "IHS 學生年費", value: 776, unit: "GBP／年", status: "採用", url: "https://www.gov.uk/healthcare-immigration-application/how-much-pay", retrieved: "2026-11-12", record: "D-20261105-d02b", note: "超過一年且 18 個月以內再加半年。" }),
    item({ id: "ihs-18", label: "IHS，超過 1 年且不超過 18 個月", value: 1164, unit: "GBP", status: "採用", url: "https://www.gov.uk/healthcare-immigration-application/how-much-pay", retrieved: "2026-11-12", record: "D-20261112-d31e", note: "776＋388。12 個月課程最長簽證 17 個月，落在這級。短於約一年的課程不套用。" }),
    item({ id: "ihs-24", label: "IHS，超過 18 個月且未滿 2 年", value: 1552, unit: "GBP", status: "採用", url: "https://www.gov.uk/healthcare-immigration-application/how-much-pay", retrieved: "2026-11-12", record: "D-20261112-d31e", note: "兩整年。14 個月課程可能落到這級。" }),
    item({ id: "ihs-2y", label: "IHS，滿 2 年及以上", value: null, status: "待確認", url: "https://www.gov.uk/healthcare-immigration-application/how-much-pay", retrieved: "2026-11-12", record: "D-20261112-d31e", note: "同頁沒有在本專題核到完整算法。" }),
    item({ id: "visa-fee", label: "學生簽證費（境外申請）", value: 558, unit: "GBP", status: "採用", url: "https://www.gov.uk/student-visa", retrieved: "2026-11-12", record: "B-20261106-h2b3" }),
    item({ id: "visa-length", label: "12 個月以上課程的簽證長度", value: null, display: "開課前最多 1 個月＋課程＋結束後 4 個月", status: "採用", url: "https://www.gov.uk/guidance/immigration-rules/immigration-rules-appendix-student", retrieved: "2026-11-12", record: "D-20261112-d31e", note: "Appendix Student ST 25.2–25.3。" }),
    item({ id: "maintenance", label: "非倫敦簽證財力門檻", value: 1171, unit: "GBP／月，最多 9 個月", status: "採用", url: "https://www.gov.uk/student-visa/money", retrieved: "2026-11-06", record: "B-20261106-h2b3", note: "這是簽證財力證明，不是生活費，不和自訂生活費加在一起。" }),
    item({ id: "uog-tuition", label: "格拉斯哥 MSc Data Science & AI 2027-28 國際／EU 學費", value: 34815, unit: "GBP", status: "採用", url: "https://www.gla.ac.uk/postgraduate/taught/data-science-artificial-intelligence/", retrieved: "2026-11-10", record: "B-20261110-m4p2" }),
    item({ id: "uog-deposit", label: "格拉斯哥同段訂金", value: 2000, unit: "GBP", status: "採用", url: "https://www.gla.ac.uk/postgraduate/feesandfunding/deposits/", retrieved: "2026-11-10", record: "B-20261106-h3c9", note: "已含在學費，條款 7.4 抵餘額。" }),
    item({ id: "uoe-tuition", label: "愛丁堡 MSc Data Science 2027/8 國際／EU 學費", value: 47680, unit: "GBP", status: "採用", url: "https://study.ed.ac.uk/programmes/postgraduate-taught-campus-fees?programme_code=PTMSCDATSC1F&year=2027", retrieved: "2026-11-10", record: "B-20261110-m4p1", note: "學費頁發布 2026-10-06。不含額外費用。" }),
    item({ id: "uoe-deposit", label: "愛丁堡同學程訂金", value: 1500, unit: "GBP", status: "採用", url: "https://study.ed.ac.uk/programmes/postgraduate-taught/902-data-science", retrieved: "2026-11-10", record: "B-20261110-m4p1" }),
    item({ id: "uoe-deposit-rule", label: "愛丁堡全日制碩士訂金通則", value: 1500, unit: "GBP", status: "採用", url: "https://study.ed.ac.uk/postgraduate/fees-funding/tuition-fees/deposits", retrieved: "2026-11-10", record: "B-20261110-k7m2", note: "通常 £1,500，學院可另訂。發布 2026-10-06。" }),
    item({ id: "uog-gls", label: "Glasgow Global Leadership Scholarship 2027/2028", value: 10000, unit: "GBP 學費減免", status: "採用", url: "https://www.gla.ac.uk/scholarships/globalleadershipscholarship/", retrieved: "2026-11-11", record: "D-20261111-d27a", note: "未核定不得使用。不可與其他校方折扣合併，Alumni Discount 除外但沒有金額。" }),
    item({ id: "school-insurance", label: "格拉斯哥與愛丁堡強制校保", value: null, status: "待確認", url: "https://www.gla.ac.uk/myglasgow/policy/studentcontract/termsandconditions/", retrieved: "2026-11-10", record: "D-20261110-d07g", note: "兩校都沒有可當零費證據的句子。" }),
    item({ id: "rejected-ihs", label: "格拉斯哥 US Loans 預算表一年碩 IHS", value: 1114, unit: "GBP", status: "不採用", url: "https://www.gla.ac.uk/myglasgow/registry/finance/usloans/costofliving202627/", retrieved: "2026-11-11", record: "D-20261111-d30d", note: "給美國貸款學生的預算表，與 GOV.UK £1,164 不符。不收費、不與官方值相加。" }),
    item({ id: "rejected-visa", label: "格拉斯哥 US Loans 預算表簽證費", value: 524, unit: "GBP", status: "不採用", url: "https://www.gla.ac.uk/myglasgow/registry/finance/usloans/costofliving202627/", retrieved: "2026-11-11", record: "D-20261111-d30d", note: "GOV.UK 境外申請是 £558。不採用校方表。" }),
    item({ id: "bot-pct", label: "臺銀個人網銀外匯匯出費率", value: 0.05, unit: "%", status: "採用", url: "https://www.bot.com.tw/Images/File/GetFileId/ec3f5562-ca20-4a4c-8597-37d3539fa9fb", retrieved: "2026-11-10", record: "E-20261110-coord-f9c1", note: "最低 TWD 120、最高 800，電報每通 300。不是學費跨境總費，不排名。" }),
    item({ id: "bot-min", label: "臺銀個人網銀匯出最低匯費", value: 120, unit: "TWD", status: "採用", url: "https://www.bot.com.tw/Images/File/GetFileId/ec3f5562-ca20-4a4c-8597-37d3539fa9fb", retrieved: "2026-11-10", record: "D-20261110-d16p" }),
    item({ id: "bot-max", label: "臺銀個人網銀匯出最高匯費", value: 800, unit: "TWD", status: "採用", url: "https://www.bot.com.tw/Images/File/GetFileId/ec3f5562-ca20-4a4c-8597-37d3539fa9fb", retrieved: "2026-11-10", record: "D-20261110-d16p" }),
    item({ id: "bot-cable", label: "臺銀個人網銀電報費", value: 300, unit: "TWD／通", status: "採用", url: "https://www.bot.com.tw/Images/File/GetFileId/ec3f5562-ca20-4a4c-8597-37d3539fa9fb", retrieved: "2026-11-10", record: "D-20261110-d16p" }),
    item({ id: "bot-limit", label: "臺銀個人網銀每日匯出額度", value: null, display: "低於等值 TWD 500,000（不含本數）", status: "採用", url: "https://www.bot.com.tw/Images/File/GetFileId/11a475fc-6b6e-47ef-a79b-c6f12b91a16e", retrieved: "2026-11-10", record: "D-20261110-d12l", note: "與約定書所列結購共用。新受款資料申辦日後次一日生效。只代表這個渠道。" }),
    item({ id: "convera-tw", label: "Convera／Flywire 對台灣付款人費率", value: null, status: "待確認", url: "https://convera.com/students/faq/payment-methods-and-instructions/", retrieved: "2026-11-10", record: "D-20261110-d10j" }),
    item({ id: "card-rate", label: "臺灣信用卡國外交易費", value: null, display: "不寫入比價", status: "待確認", url: "https://ecard.bot.com.tw/Pages/Note/P10.html", retrieved: "2026-11-10", record: "E-20261110-coord-e8b1", note: "臺銀用卡須知、星展與中信頁曾寫國際組織 1% 加銀行 0.5%。結匯日可能變動，而且沒有本專題的有效報價，所以不寫死、不拿來排名。另見 https://www.dbs.com.tw/personal-zh/cards/services/credit_card_fee 與 https://service.ctbcbank.com/FAQ/Page01?kmid=4724 。" }),
    item({ id: "fx", label: "匯率 GBP→TWD", value: 41, unit: "TWD／GBP", status: "假設", url: Contract.MANUSCRIPT_URL, retrieved: "2026-11-09", record: "C-20261109-atlas-m01", note: "協作表示例，不是即時牌價。" }),
    item({ id: "reserve", label: "預備金", value: 0.05, unit: "比例", status: "假設", url: Contract.MANUSCRIPT_URL, retrieved: "2026-11-09", record: "C-20261109-atlas-m01", note: "原稿公式。組員尚未定案。" }),
    item({ id: "twd-55", label: "台幣支出示例", value: 55000, unit: "TWD", status: "假設", url: Contract.MANUSCRIPT_URL, retrieved: "2026-11-09", record: "E-20261109-coord-71a3", note: "原稿另一寫法是 60,000，尚未選定。" }),
    item({ id: "twd-60", label: "台幣支出示例（另一寫法）", value: 60000, unit: "TWD", status: "假設", url: Contract.MANUSCRIPT_URL, retrieved: "2026-11-09", record: "E-20261109-coord-71a3" }),
    item({ id: "living", label: "生活費示例", value: 1500, unit: "GBP／月 × 12", status: "假設", url: Contract.MANUSCRIPT_URL, retrieved: "2026-11-09", record: "C-20261109-atlas-m01", note: "不是官價，不和簽證財力門檻相加。" }),
    item({ id: "loan-rate", label: "貸款年利率示例", value: 0.03, unit: "年利率", status: "假設", url: Contract.MANUSCRIPT_URL, retrieved: "2026-11-09", record: "C-20261109-atlas-m01", note: "不是銀行報價。原稿月息與月付反推的利率不一致，不寫成官方利率。" }),
    item({ id: "funds-backcalc", label: "原稿可用資金", value: 1505000, unit: "TWD", status: "假設", url: Contract.MANUSCRIPT_URL, retrieved: "2026-11-09", record: "E-20261109-coord-82b1", note: "由原稿缺口反推，不可拆成真實自備款或獎學金。" }),
  ];

  function screenLines(lines) {
    return (lines || []).map(function (line) {
      var copy = Object.assign({}, line);
      var pendingNumber = line.inclusion === "pending" && line.amount !== null && line.amount !== undefined;
      var noneWithoutProof = line.inclusion === "none" && !line.zeroEvidence;
      var unsourced = !line.assumption && line.inclusion !== "pending" && line.inclusion !== "none" && line.amount !== null && line.amount !== undefined && !line.sourceUrl;
      if (pendingNumber || noneWithoutProof || unsourced) {
        copy.amount = null;
        copy.contributeTwd = null;
        copy.inclusion = "pending";
        copy.blocked = true;
        copy.blockReason = unsourced ? "缺來源，學生畫面不顯示這個數字。" : "未知不能當 0，學生畫面不顯示這個數字。";
      }
      return copy;
    });
  }

  function lineProblem(line) {
    if (!line) return null;
    if (line.inclusion === "pending" && line.amount !== null && line.amount !== undefined) {
      return "待確認項目 " + (line.name || line.id) + " 填了數字。";
    }
    if (line.inclusion === "none" && !line.zeroEvidence) {
      return (line.name || line.id) + " 標成無此費用，但沒有零費證據。";
    }
    if (!line.assumption && line.inclusion !== "pending" && line.amount !== null && line.amount !== undefined && !line.sourceUrl && line.inclusion !== "none") {
      return (line.name || line.id) + " 有金額但沒有來源 URL，也沒有標假設。";
    }
    if (line.assumption && line.inclusion !== "pending" && line.amount !== null && line.amount !== undefined) {
      return null;
    }
    return null;
  }

  function review(ctx) {
    ctx = ctx || {};
    var scenario = ctx.scenario || {};
    var lines = ctx.lines || [];
    var payments = ctx.payments || null;
    var blockers = [];
    var notes = [];

    var pendingNames = [];
    lines.forEach(function (line) {
      var problem = lineProblem(line);
      if (problem) blockers.push(problem);
      if (line.assumption) notes.push((line.name || line.id) + " 是假設。");
      if (line.inclusion === "pending") {
        pendingNames.push(line.name || line.id);
        notes.push((line.name || line.id) + " 待確認，不計入確定總額。");
      }
    });
    if (pendingNames.length) {
      blockers.push("還有待確認項目（" + pendingNames.join("、") + "），不能宣稱完整總額。");
    }

    if (scenario.complete === false) {
      if (scenario.final_total_twd !== null && scenario.final_total_twd !== undefined) {
        blockers.push("計算未完成，卻寫了確定總額。");
      }
      if (scenario.confirmed_gap_twd !== null && scenario.confirmed_gap_twd !== undefined) {
        blockers.push("計算未完成，卻寫了確定缺口。");
      }
      if (scenario.loan_amount_twd !== null && scenario.loan_amount_twd !== undefined) {
        blockers.push("計算未完成，卻寫了貸款額。");
      }
    }
    if (scenario.complete === true && (scenario.final_total_twd === null || scenario.final_total_twd === undefined)) {
      blockers.push("標記完成，但沒有確定總額。");
    }
    if (scenario.funds_complete === false && scenario.confirmed_gap_twd !== null && scenario.confirmed_gap_twd !== undefined) {
      blockers.push("資金有空欄，缺口卻是數字。這會把未填資金當成 0。");
    }
    if (scenario.reference_only && scenario.complete === true) {
      notes.push("已完成的試算不需要暫估區塊。");
    }

    if (payments) {
      if (payments.rankable) blockers.push("沒有已確認的完整報價，卻標成可以排名。");
      if (payments.cheapest_channel_id) blockers.push("產出了最低成本管道。目前不應該有冠軍。");
      ["tuition", "deposit"].forEach(function (purpose) {
        ((payments.channels && payments.channels[purpose]) || []).forEach(function (item) {
          ["fixed_fee", "pct_fee", "min_fee", "max_fee", "fx_spread"].forEach(function (key) {
            if (item.fees && typeof item.fees[key] === "number" && item.quote_status !== "已報價") {
              blockers.push(item.name + " 的 " + key + " 沒有報價卻是數字。");
            }
          });
          if (!item.source || !item.source.url) blockers.push(item.name + " 沒有來源 URL。");
        });
      });
      (payments.reference_tariffs || []).forEach(function (tariff) {
        if (tariff.applies_to_school_payment || tariff.ranked) {
          blockers.push(tariff.name + " 被拿去當學校付款報價或排名。");
        }
      });
    }

    if (ctx.scholarship && ctx.scholarship.applied && ctx.scholarship.cash_twd) {
      blockers.push("校方減免已經反映在淨學費，又再計入獎學金資金。");
    }

    var screened = screenLines(lines);
    if (screened.some(function (line) { return line.blocked; })) {
      blockers.push("學生畫面已擋下缺來源或未知當零的數字。");
    }

    var unique = [];
    blockers.forEach(function (text) {
      if (unique.indexOf(text) === -1) unique.push(text);
    });

    var dataOk = unique.length === 0;
    var status = !dataOk ? "退修" : ctx.release_signed === true ? "PASS" : "轉真人";
    var showFinal = dataOk && scenario.complete === true && scenario.final_total_twd !== null && scenario.final_total_twd !== undefined && scenario.funds_complete !== false;
    var showGap = showFinal && scenario.confirmed_gap_twd !== null && scenario.confirmed_gap_twd !== undefined;

    return {
      status: status,
      release: "轉真人",
      release_reason: "協調確認欄還沒有真人簽字，正式 Demo 未放行。資料檢查通過也不等於可以對外當正式結果。",
      blockers: unique,
      notes: notes,
      constants: CONSTANTS,
      screened_lines: screened,
      student_claim: {
        may_show_final_total: showFinal,
        may_show_gap: showGap,
        final_total_twd: showFinal ? scenario.final_total_twd : null,
        confirmed_gap_twd: showGap ? scenario.confirmed_gap_twd : null,
        known_subtotal_twd: scenario.known_subtotal_twd === undefined ? null : scenario.known_subtotal_twd,
        label: showFinal ? "此假設下的試算" : "尚未確定",
      },
    };
  }

  return {
    CONSTANTS: CONSTANTS,
    review: review,
    screenLines: screenLines,
    MANUSCRIPT_URL: Contract.MANUSCRIPT_URL,
  };
});
