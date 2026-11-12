/**
 * B｜選校與獎學金（Hunter／曾尉庭）
 *
 * 對外：getProgramme(id)、listProgrammes()、resolveFunding(programme, awardedIds)、selectSchoolDiscount(list)
 * 金額都帶來源 URL。未核定的獎學金不進資金，也不先減學費。
 * 校方減免若套用，只反映在淨學費，呼叫端不可再扣一次。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("../../shared/contract.js"));
  else root.BModule = factory(root.Contract);
})(typeof globalThis !== "undefined" ? globalThis : this, function (Contract) {
  "use strict";

  var GLASGOW_TUITION = {
    label: "University of Glasgow MSc Data Science & Artificial Intelligence",
    url: "https://www.gla.ac.uk/postgraduate/taught/data-science-artificial-intelligence/",
    retrieved: "2026-11-10",
    record: "B-20261110-m4p2",
    note: "2027-28 國際／EU 學費。頁面未標發布日。不是 2028 入學保證價。",
  };
  var GLASGOW_DEPOSIT = {
    label: "University of Glasgow postgraduate deposits",
    url: "https://www.gla.ac.uk/postgraduate/feesandfunding/deposits/",
    retrieved: "2026-11-10",
    record: "B-20261110-m4p2",
    note: "訂金抵學費餘額。退費公開文字目前見到 2026/27，2027/28 是否沿用待確認，此處不做退費決策。",
  };
  var GLASGOW_TERMS = {
    label: "University of Glasgow Student Terms",
    url: "https://www.gla.ac.uk/myglasgow/policy/studentcontract/termsandconditions/",
    retrieved: "2026-11-10",
    record: "B-20261106-h3c9",
    note: "條款 7.4：訂金抵扣學費餘額。條款版本是 2026-27。",
  };
  var EDINBURGH_TUITION = {
    label: "University of Edinburgh MSc Data Science 2027/8 fees",
    url: "https://study.ed.ac.uk/programmes/postgraduate-taught-campus-fees?programme_code=PTMSCDATSC1F&year=2027",
    retrieved: "2026-11-10",
    published: "2026-10-06",
    record: "B-20261110-m4p1",
    note: "Academic Session 2027/8，International / EU，不含額外費用。",
  };
  var EDINBURGH_DEPOSIT = {
    label: "University of Edinburgh MSc Data Science",
    url: "https://study.ed.ac.uk/programmes/postgraduate-taught/902-data-science",
    retrieved: "2026-11-10",
    record: "B-20261110-m4p1",
    note: "£1,500 contributes towards your tuition fees。訂金句本身沒寫學年，對到同頁 Year of entry 2027。",
  };
  var EDINBURGH_DEPOSIT_RULE = {
    label: "University of Edinburgh tuition deposits",
    url: "https://study.ed.ac.uk/postgraduate/fees-funding/tuition-fees/deposits",
    retrieved: "2026-11-10",
    published: "2026-10-06",
    record: "B-20261110-k7m2",
    note: "全日制碩士通常 £1,500，學院可另訂。",
  };

  var PROGRAMMES = [
    {
      id: "uog-dsai-2027",
      school_id: "uog",
      program_id: "msc-dsai",
      school: "University of Glasgow",
      school_zh: "格拉斯哥大學",
      program_name: "MSc Data Science & Artificial Intelligence",
      program_zh: "資料科學與人工智慧碩士",
      intake: "2027-09",
      award_year: "2027-28",
      city: "Glasgow（非倫敦）",
      course_length_months: 12,
      course_length_assumption: false,
      course_length_note: "學程頁寫 12 個月全日制、9 月開學。",
      coverage_start: "2027-09",
      coverage_end: null,
      tuition: {
        amount: 34815,
        currency: "GBP",
        inclusion_flag: "另計",
        source: GLASGOW_TUITION,
      },
      deposit: {
        amount: 2000,
        currency: "GBP",
        inclusion_flag: "已含",
        source: GLASGOW_DEPOSIT,
        terms: GLASGOW_TERMS,
      },
      insurance: {
        amount: null,
        inclusion_flag: "待確認",
        source: {
          label: "Glasgow Student Terms（不足以證明這個學程免校保）",
          url: GLASGOW_TERMS.url,
          retrieved: "2026-11-10",
          record: "D-20261110-d07g",
          note: "條款沒有把這個學程、2027 入學寫成零費。金額維持 null，不能當 0。",
        },
      },
      scholarships: [
        {
          scholarship_id: "uog-gls-2027",
          name: "Glasgow Global Leadership Scholarship",
          name_zh: "全球領導獎學金",
          funding_type: "school_discount",
          amount_gbp: 10000,
          award_year: "2027/2028",
          stackable: false,
          stack_note: "不可與其他格拉斯哥折扣、獎學金或外部合作折扣合併。Alumni Discount 有例外，但本專題沒有該折扣的金額，不另填。",
          source: {
            label: "Glasgow Global Leadership Scholarship",
            url: "https://www.gla.ac.uk/scholarships/globalleadershipscholarship/",
            retrieved: "2026-11-11",
            record: "D-20261111-d27a",
            note: "一年學費減免 £10,000，不是第三方代付。未核定不得減學費，也不得進入 funds.scholarship。",
          },
        },
      ],
      funding_notes: [
        {
          status: "待確認",
          text: "贊助者沒付時，費用會轉回學生帳戶。這一頁沒標學年，2027/28 是否全面適用待確認。校方減免不套用這條。",
          source: {
            label: "University of Glasgow student debt policy",
            url: "https://www.gla.ac.uk/postgraduate/feesandfunding/policies/debts/",
            retrieved: "2026-11-11",
            record: "D-20261111-d26z",
          },
        },
      ],
    },
    {
      id: "uoe-ds-2027",
      school_id: "uoe",
      program_id: "msc-ds",
      school: "University of Edinburgh",
      school_zh: "愛丁堡大學",
      program_name: "MSc Data Science",
      program_zh: "資料科學碩士",
      intake: "2027-09",
      award_year: "2027/8",
      city: "Edinburgh（非倫敦）",
      course_length_months: 12,
      course_length_assumption: true,
      course_length_note: "學程頁寫全日制 1 year、2027 年 9 月開學，沒有寫幾個月。這裡暫記 12 個月，屬於假設，IHS 會跟著標成假設。",
      coverage_start: "2027-09",
      coverage_end: null,
      tuition: {
        amount: 47680,
        currency: "GBP",
        inclusion_flag: "另計",
        source: EDINBURGH_TUITION,
      },
      deposit: {
        amount: 1500,
        currency: "GBP",
        inclusion_flag: "已含",
        source: EDINBURGH_DEPOSIT,
        terms: EDINBURGH_DEPOSIT_RULE,
      },
      insurance: {
        amount: null,
        inclusion_flag: "待確認",
        source: {
          label: "University of Edinburgh terms and conditions",
          url: "https://study.ed.ac.uk/admissions/terms-conditions",
          retrieved: "2026-11-10",
          record: "B-20261110-k7m2",
          note: "條款只建議個人財物投保，沒有構成這個學程的零費證據。金額 null。",
        },
      },
      scholarships: [],
      funding_notes: [
        {
          status: "待確認",
          text: "這輪沒有核到可引用的愛丁堡獎學金金額。不填 0，也不假設已經獲獎。",
          source: {
            label: "尚無已核對的獎項頁",
            url: "",
            retrieved: "2026-11-12",
            record: "B-20261110-k7m2",
            note: "沒有來源就不列出假金額。",
          },
        },
      ],
    },
  ];

  var BY_ID = {};
  PROGRAMMES.forEach(function (programme) {
    BY_ID[programme.id] = programme;
  });

  function listProgrammes() {
    return PROGRAMMES.map(function (programme) {
      return Contract.clone(programme);
    });
  }

  function getProgramme(id) {
    return BY_ID[id] ? Contract.clone(BY_ID[id]) : null;
  }

  function selectSchoolDiscount(awarded) {
    var school = (awarded || []).filter(function (item) {
      return item && item.funding_type === "school_discount" && typeof item.amount_gbp === "number" && item.amount_gbp >= 0;
    });
    if (!school.length) return { applied: null, dropped: [] };
    var ranked = school.slice().sort(function (a, b) {
      return b.amount_gbp - a.amount_gbp;
    });
    return { applied: ranked[0], dropped: ranked.slice(1) };
  }

  function resolveFunding(programme, awardedIds) {
    var ids = awardedIds || [];
    var gross = programme.tuition.amount;
    var candidates = (programme.scholarships || []).map(function (item) {
      var awarded = ids.indexOf(item.scholarship_id) !== -1;
      return Object.assign({}, item, { awarded: awarded, status: awarded ? "已核定" : "未核定" });
    });
    var chosen = selectSchoolDiscount(candidates.filter(function (item) { return item.awarded; }));
    var net = gross;
    var applied = null;
    if (chosen.applied) {
      net = gross - chosen.applied.amount_gbp;
      if (net < 0) net = 0;
      applied = chosen.applied;
    }
    var warnings = [];
    if (chosen.dropped.length) {
      warnings.push("校方減免不能疊加，只留金額較高的一筆，其餘不計入。");
    }
    candidates.forEach(function (item) {
      if (item.awarded && item.funding_type !== "school_discount") {
        warnings.push("第三方贊助未確認到帳，不計入資金，也不從學費扣除。");
      }
    });
    return {
      gross_tuition_gbp: gross,
      net_tuition_gbp: net,
      applied: applied,
      dropped: chosen.dropped,
      cash_twd: 0,
      candidates: candidates,
      warnings: warnings,
    };
  }

  return {
    PROGRAMMES: PROGRAMMES,
    listProgrammes: listProgrammes,
    getProgramme: getProgramme,
    resolveFunding: resolveFunding,
    selectSchoolDiscount: selectSchoolDiscount,
    MANUSCRIPT_URL: Contract.MANUSCRIPT_URL,
  };
});
