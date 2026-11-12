/**
 * B｜選校與獎學金。
 * 目前只收錄協作表已核對的兩個英國示例。未知留空，獎學金預設未核定。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("../../shared/constants.js"));
  } else {
    root.BModule = factory(root.SharedConstants);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (Constants) {
  "use strict";

  function num(id) {
    return Constants.byId(id);
  }

  var PROGRAMMES = {
    glasgow: {
      key: "glasgow",
      school_id: "glasgow",
      school_name: "University of Glasgow",
      school_name_zh: "格拉斯哥大學",
      program_id: "uog-msc-dsai",
      program_name: "MSc Data Science & Artificial Intelligence",
      program_name_zh: "資料科學與人工智慧碩士",
      intake: "2027-09",
      course_length_months: 12,
      course_length_text: "學程頁寫 12 個月全日制、9 月開學。",
      city: "Glasgow",
      london: false,
      tuition: {
        amount: num("glasgow-tuition-2027").amount,
        currency: "GBP",
        year: "2027-28",
        inclusion_flag: "另計",
        source: {
          label: "University of Glasgow 學程頁",
          url: Constants.urls.glasgowTuition,
          consulted: "2026-11-10",
          record: "B-20261110-m4p2",
        },
      },
      deposit: {
        amount: num("glasgow-deposit").amount,
        currency: "GBP",
        inclusion_flag: "已含",
        included_in_fee_id: "tuition",
        part_of_fee_id: "tuition",
        source: {
          label: "格拉斯哥研究所訂金頁",
          url: Constants.urls.glasgowDeposit,
          also: Constants.urls.glasgowTerms,
          consulted: "2026-11-10",
          record: "B-20261106-h3c9",
          note: "條款 7.4：訂金抵學費餘額。退費條款公開頁目前見到 2026/27，2027/28 待確認。",
        },
      },
      insurance: {
        amount: null,
        currency: "GBP",
        inclusion_flag: "待確認",
        source: {
          label: "Student Terms 2026-27",
          url: Constants.urls.glasgowTerms,
          consulted: "2026-11-10",
          record: "D-20261110-d07g",
          note: "條款要學生自行處理財產等保險，但不是「這個學程沒有強制校保」的明文。",
        },
      },
      scholarships: [
        {
          id: "uog-gls-2027",
          name: "Global Leadership Scholarship",
          type: "校方減免",
          amount_gbp: num("glasgow-gls-2027").amount,
          year: "2027/2028",
          stackable: false,
          stack_note: "不可與其他格拉斯哥校方折扣或獎學金、外部合作折扣合併。Alumni Discount 是頁面上寫的例外。",
          awarded: false,
          source: {
            label: "Global Leadership Scholarship",
            url: Constants.urls.gls,
            consulted: "2026-11-11",
            record: "D-20261111-d27a",
          },
        },
      ],
      sponsor_rule: {
        status: "待確認",
        note: "債務頁寫贊助者沒付款時，費用轉回學生帳戶、學生負全額責任。頁面沒標學年，2027/28 是否全面適用待確認。校方減免不走這條。",
        url: Constants.urls.glasgowDebt,
        record: "D-20261111-d26z",
      },
      payment_hint: "訂金與學費管道分開。訂金走 Applicant Self Service 卡付；學費不收學生直接匯款。細項交給 D。",
    },
    edinburgh: {
      key: "edinburgh",
      school_id: "edinburgh",
      school_name: "University of Edinburgh",
      school_name_zh: "愛丁堡大學",
      program_id: "uoe-msc-ds",
      program_name: "MSc Data Science",
      program_name_zh: "資料科學碩士",
      intake: "2027-09",
      course_length_months: 12,
      course_length_text: "學程頁寫全日制 1 年、2027 年 9 月入學。試算把 1 年對成 12 個月來套簽證級距；實際月數以 CAS 為準。",
      course_length_mapping: "假設",
      city: "Edinburgh",
      london: false,
      tuition: {
        amount: num("edinburgh-tuition-2027").amount,
        currency: "GBP",
        year: "2027/8",
        inclusion_flag: "另計",
        source: {
          label: "愛丁堡 2027/8 學費頁",
          url: Constants.urls.edinburghTuition,
          consulted: "2026-11-10",
          published: "2026-10-06",
          record: "B-20261110-k7m2",
          note: "International / EU，不含額外費用。",
        },
      },
      deposit: {
        amount: num("edinburgh-deposit").amount,
        currency: "GBP",
        inclusion_flag: "已含",
        included_in_fee_id: "tuition",
        part_of_fee_id: "tuition",
        source: {
          label: "愛丁堡學程頁",
          url: Constants.urls.edinburghProgramme,
          also: Constants.urls.edinburghDeposit,
          consulted: "2026-11-10",
          published: "2026-10-06",
          record: "B-20261110-m4p1",
          note: "原文 contributes towards your tuition fees。大學通則通常 £1,500，學院可另訂。",
        },
      },
      insurance: {
        amount: null,
        currency: "GBP",
        inclusion_flag: "待確認",
        source: {
          label: "愛丁堡研究紀錄",
          url: Constants.urls.edinburghProgramme,
          consulted: "2026-11-10",
          record: "B-20261110-k7m2",
          note: "條款只建議個人財物保險，沒有看到強制校保金額。",
        },
      },
      scholarships: [],
      scholarship_note: "這個示例還沒有收錄已核對的愛丁堡獎學金。不填 0，也不假設學生已獲獎。",
      sponsor_rule: {
        status: "待確認",
        note: "愛丁堡贊助未付是否轉回學生，本示例沒有核到對應頁，留空。",
        url: null,
        record: null,
      },
      payment_hint: "財務 FAQ 不提供銀行帳號，學費走 Flywire，另列 Convera。與訂金管道分開，交給 D。",
    },
  };

  var LEGACY = {
    "uog-msc-datascience": {
      key: "uog-msc-datascience",
      status: "待核對",
      school_id: "glasgow",
      school_name_zh: "格拉斯哥大學",
      program_id: "uog-msc-datascience",
      program_name: "MSc Data Science",
      program_name_zh: "資料科學碩士（舊稱）",
      intake: null,
      alias_of: null,
      do_not_overwrite: "uog-msc-dsai",
      tuition: { amount: null, currency: "GBP", inclusion_flag: "待確認" },
      deposit: { amount: null, currency: "GBP", inclusion_flag: "待確認" },
      insurance: { amount: null, inclusion_flag: "待確認" },
      scholarships: [],
      note: "舊網址曾寫 Data Science。校方沒有明文說它就是現在的 Data Science & Artificial Intelligence，所以不把新學程的學費寫進這個代號，也不覆蓋已存在的快照。",
      source: {
        url: "https://www.gla.ac.uk/postgraduate/taught/datascience/",
        record: "B-20261110-n5q1",
        consulted: "2026-11-10",
      },
    },
  };

  function buildOutput(id) {
    if (LEGACY[id]) return LEGACY[id];
    var found = PROGRAMMES[id];
    if (!found) {
      Object.keys(PROGRAMMES).forEach(function (key) {
        if (PROGRAMMES[key].program_id === id) found = PROGRAMMES[key];
      });
    }
    if (!found) return null;
    return JSON.parse(JSON.stringify(found));
  }

  function list() {
    return Object.keys(PROGRAMMES).map(function (key) {
      return buildOutput(key);
    });
  }

  function awardState(programme, awardedIds) {
    var awarded = {};
    (awardedIds || []).forEach(function (id) {
      awarded[id] = true;
    });
    return (programme.scholarships || []).map(function (item) {
      var copy = JSON.parse(JSON.stringify(item));
      copy.awarded = !!awarded[item.id];
      copy.counts_as_funds = copy.awarded;
      if (!copy.awarded) copy.amount_counted_gbp = null;
      else copy.amount_counted_gbp = copy.amount_gbp;
      return copy;
    });
  }

  return {
    list: list,
    buildOutput: buildOutput,
    awardState: awardState,
    legacy: LEGACY,
  };
});
