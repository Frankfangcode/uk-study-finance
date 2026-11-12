/**
 * 已核對常數。金額旁的網址是公開頁，查閱日寫在每筆上。
 * 這些是查閱當下的公布值，不是 2028 入學保證價。
 * 假設與待確認分開，不把未知填成 0。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SharedConstants = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var CONSULTED = "2026-11-12";

  function sourced(entry) {
    entry.kind = "sourced";
    entry.consulted = entry.consulted || CONSULTED;
    return entry;
  }

  function assumption(entry) {
    entry.kind = "assumption";
    entry.amount = entry.amount == null ? null : entry.amount;
    return entry;
  }

  function pending(entry) {
    entry.kind = "pending";
    entry.amount = null;
    entry.consulted = entry.consulted || CONSULTED;
    return entry;
  }

  var IHS_URL = "https://www.gov.uk/healthcare-immigration-application/how-much-pay";
  var VISA_URL = "https://www.gov.uk/student-visa";
  var VISA_LENGTH_URL = "https://www.gov.uk/guidance/immigration-rules/immigration-rules-appendix-student";
  var MONEY_URL = "https://www.gov.uk/student-visa/money";
  var GLA_TUITION_URL = "https://www.gla.ac.uk/postgraduate/taught/data-science-artificial-intelligence/";
  var GLA_DEPOSIT_URL = "https://www.gla.ac.uk/postgraduate/feesandfunding/deposits/";
  var GLA_TERMS_URL = "https://www.gla.ac.uk/myglasgow/policy/studentcontract/termsandconditions/";
  var GLA_PAY_URL = "https://www.gla.ac.uk/myglasgow/students/payingyourfees/selffundedpaymentmethods/";
  var EDI_TUITION_URL = "https://study.ed.ac.uk/programmes/postgraduate-taught-campus-fees?programme_code=PTMSCDATSC1F&year=2027";
  var EDI_PROGRAMME_URL = "https://study.ed.ac.uk/programmes/postgraduate-taught/902-data-science";
  var EDI_DEPOSIT_URL = "https://study.ed.ac.uk/postgraduate/fees-funding/tuition-fees/deposits";
  var EDI_FAQ_URL = "https://uoe-finance.ed.ac.uk/students/faqs";
  var EDI_PAY_URL = "https://uoe-finance.ed.ac.uk/students/fees/self-funded/one-payment/bank-transfer-online-payment-platform";
  var GLS_URL = "https://www.gla.ac.uk/scholarships/globalleadershipscholarship/";
  var GLA_DEBT_URL = "https://www.gla.ac.uk/postgraduate/feesandfunding/policies/debts/";
  var CONVERA_URL = "https://convera.com/students/faq/payment-methods-and-instructions/";
  var BOT_FEE_URL = "https://www.bot.com.tw/Images/File/GetFileId/ec3f5562-ca20-4a4c-8597-37d3539fa9fb";
  var BOT_TERMS_URL = "https://www.bot.com.tw/Images/File/GetFileId/11a475fc-6b6e-47ef-a79b-c6f12b91a16e";
  var US_LOANS_URL = "https://www.gla.ac.uk/myglasgow/registry/finance/usloans/costofliving202627/";

  var catalog = [
    sourced({
      id: "ihs-year",
      label: "IHS 學生年費",
      amount: 776,
      currency: "GBP",
      unit: "年",
      url: IHS_URL,
      record: "D-20261105-d02b",
      note: "超過一年且不超過 18 個月再加半年份。",
    }),
    sourced({
      id: "ihs-half-year",
      label: "IHS 半年份（年費的一半）",
      amount: 388,
      currency: "GBP",
      url: IHS_URL,
      record: "D-20261105-d02b",
      note: "776 的一半。超過一年且 18 個月以內時加這一筆，合計 1,164。",
    }),
    sourced({
      id: "ihs-up-to-18-months",
      label: "IHS：簽證超過 1 年且不超過 18 個月",
      amount: 1164,
      currency: "GBP",
      url: IHS_URL,
      record: "D-20261112-d31e",
      note: "776＋388。12 個月課程依 ST 25.3 最長簽證 17 個月，落在這一級。",
    }),
    sourced({
      id: "ihs-under-two-years",
      label: "IHS：簽證超過 18 個月且未滿 2 年",
      amount: 1552,
      currency: "GBP",
      url: IHS_URL,
      record: "D-20261112-d31e",
      note: "兩整年。14 個月課程最長簽證 19 個月時可能落到這一級。",
    }),
    pending({
      id: "ihs-two-years-plus",
      label: "IHS：簽證滿 2 年及以上",
      currency: "GBP",
      url: IHS_URL,
      record: "D-20261112-d31e",
      note: "該頁在本專題沒有核到完整算法，不填金額。",
    }),
    sourced({
      id: "visa-fee-outside",
      label: "學生簽證費（境外申請）",
      amount: 558,
      currency: "GBP",
      url: VISA_URL,
      record: "B-20261106-h2b3",
      note: "查閱 2026-11-12 的公布費。不是校方預算表上的 524。",
    }),
    sourced({
      id: "maintenance-non-london",
      label: "非倫敦簽證財力門檻",
      amount: 1171,
      currency: "GBP",
      unit: "月",
      months_cap: 9,
      url: MONEY_URL,
      record: "B-20261106-h2b3",
      note: "這是簽證財力證明，最多算 9 個月。不是生活費報價，不可與自訂生活費加在一起。",
    }),
    sourced({
      id: "glasgow-tuition-2027",
      label: "格拉斯哥 MSc Data Science & Artificial Intelligence 2027-28 國際／EU 學費",
      amount: 34815,
      currency: "GBP",
      url: GLA_TUITION_URL,
      record: "B-20261110-m4p2",
      consulted: "2026-11-10",
      note: "學程頁 Tuition fees for 2027-28。舊稱 Data Science 不得覆蓋這筆。",
    }),
    sourced({
      id: "glasgow-deposit",
      label: "格拉斯哥上述學程訂金",
      amount: 2000,
      currency: "GBP",
      url: GLA_DEPOSIT_URL,
      also: [GLA_TUITION_URL, GLA_TERMS_URL],
      record: "B-20261110-m4p2",
      consulted: "2026-11-10",
      note: "已含在學費，條款 7.4 抵扣餘額。退費文字目前見到 2026/27，2027/28 是否沿用待確認，本工具不做退款判定。",
    }),
    sourced({
      id: "edinburgh-tuition-2027",
      label: "愛丁堡 MSc Data Science 2027/8 國際／EU 學費",
      amount: 47680,
      currency: "GBP",
      url: EDI_TUITION_URL,
      record: "B-20261110-m4p1",
      consulted: "2026-11-10",
      note: "學費頁發布 2026-10-06。不含額外費用。",
    }),
    sourced({
      id: "edinburgh-deposit",
      label: "愛丁堡 MSc Data Science 訂金",
      amount: 1500,
      currency: "GBP",
      url: EDI_PROGRAMME_URL,
      also: [EDI_DEPOSIT_URL],
      record: "B-20261110-m4p1",
      consulted: "2026-11-10",
      note: "學程頁寫 contributes towards your tuition fees。大學通則是全日制碩士通常 1,500，學院可另訂。",
    }),
    sourced({
      id: "glasgow-gls-2027",
      label: "Glasgow Global Leadership Scholarship 2027/2028",
      amount: 10000,
      currency: "GBP",
      url: GLS_URL,
      record: "D-20261111-d27a",
      consulted: "2026-11-11",
      note: "一年學費減免，不是第三方代付。不可與其他校方獎學金合併，Alumni Discount 除外。未獲核定不得計入資金。",
    }),
    sourced({
      id: "bot-outward-pct",
      label: "臺銀個人網銀外匯匯出費率",
      amount: 0.0005,
      currency: "TWD",
      unit: "比例",
      url: BOT_FEE_URL,
      record: "D-20261110-d16p",
      consulted: "2026-11-10",
      note: "匯費 0.05%、最低 120、最高 800。只是銀行端費用，不是把學費匯到學校的完整成本。",
    }),
    sourced({
      id: "bot-outward-min",
      label: "臺銀個人網銀外匯匯出最低費",
      amount: 120,
      currency: "TWD",
      url: BOT_FEE_URL,
      record: "D-20261110-d16p",
      consulted: "2026-11-10",
      note: "個人網銀。不用企業網銀表的最低 200。",
    }),
    sourced({
      id: "bot-outward-max",
      label: "臺銀個人網銀外匯匯出最高費",
      amount: 800,
      currency: "TWD",
      url: BOT_FEE_URL,
      record: "D-20261110-d16p",
      consulted: "2026-11-10",
    }),
    sourced({
      id: "bot-cable",
      label: "臺銀個人網銀電報費",
      amount: 300,
      currency: "TWD",
      unit: "每通",
      url: BOT_FEE_URL,
      record: "D-20261110-d16p",
      consulted: "2026-11-10",
    }),
    sourced({
      id: "bot-daily-limit",
      label: "臺銀個人網銀每日匯出額度上限（不含本數）",
      amount: 500000,
      currency: "TWD",
      url: BOT_TERMS_URL,
      record: "D-20261110-d12l",
      consulted: "2026-11-10",
      note: "低於等值 500,000，與約定書所列結購共用。只代表這個渠道，不代表學費必須拆天付。",
    }),
  ];

  catalog.push(
    pending({
      id: "school-insurance",
      label: "格拉斯哥與愛丁堡強制校保",
      currency: "GBP",
      url: GLA_TERMS_URL,
      also: [EDI_PROGRAMME_URL],
      record: "D-20261110-d07g",
      note: "兩校目前都沒有可引用的金額。維持 null。",
    }),
    pending({
      id: "convera-flywire-tw-rate",
      label: "Convera／Flywire 對台灣付款人的費率",
      url: CONVERA_URL,
      also: [EDI_FAQ_URL, GLA_PAY_URL],
      record: "D-20261110-d08h",
      note: "沒有本專題的有效報價。不排名、不填假費率。",
    }),
    pending({
      id: "card-fee-project-quote",
      label: "臺灣信用卡國外交易費（本專題報價）",
      url: GLA_PAY_URL,
      record: "D-20261110-d09i",
      note: "公開頁曾出現約 1%＋0.5% 的結構，但沒有鎖定到這兩所學校、這筆餘額的報價，所以不寫死。",
    }),
    assumption({
      id: "fx-gbp-twd",
      label: "匯率 GBP→TWD",
      amount: 41,
      note: "協作試算用的例子，不是即時牌價。",
    }),
    assumption({
      id: "reserve-rate",
      label: "預備金比例",
      amount: 0.05,
      unit: "比例",
      note: "原稿公式：外幣換算加台幣支出之後再乘。組員尚未定案。",
    }),
    assumption({
      id: "twd-expenses-55k",
      label: "台幣支出示例一（機票等）",
      amount: 55000,
      currency: "TWD",
      note: "原稿文字寫 55,000。與另一種 60,000 尚未選定。",
    }),
    assumption({
      id: "twd-expenses-60k",
      label: "台幣支出示例二（機票等）",
      amount: 60000,
      currency: "TWD",
      note: "原稿顯示的總成本對得上 60,000，與文字的 55,000 不一致。",
    }),
    assumption({
      id: "living-monthly-example",
      label: "生活費月預算示例",
      amount: 1500,
      currency: "GBP",
      unit: "月",
      note: "原稿示例，不是官價。不要加上簽證財力門檻。",
    }),
    assumption({
      id: "loan-rate-example",
      label: "貸款年利率示例",
      amount: 0.03,
      unit: "比例",
      note: "不是銀行報價。原稿月息與月付反推的利率彼此不同，不寫成官方利率。",
    }),
    assumption({
      id: "loan-term-example",
      label: "攤還期數示例",
      amount: 108,
      unit: "月",
      note: "原稿示例的 9 年。",
    }),
    assumption({
      id: "manuscript-funds",
      label: "原稿缺口反推的可用資金合計",
      amount: 1505000,
      currency: "TWD",
      note: "只為對上原稿缺口。不可拆成真實自備款、家庭支援或獎學金。",
    })
  );

  var rejected = [
    {
      id: "glasgow-us-loans-ihs",
      amount: 1114,
      currency: "GBP",
      url: US_LOANS_URL,
      reason: "格拉斯哥給美國貸款學生的 2026/27 預算表把一年碩 IHS 寫成 1,114。不可當收費標準，也不可與 GOV.UK 的 1,164 相加。",
    },
    {
      id: "glasgow-us-loans-visa",
      amount: 524,
      currency: "GBP",
      url: US_LOANS_URL,
      reason: "同一張表的簽證費 524 低於 GOV.UK 現行 558，不可當收費標準。",
    },
    {
      id: "bot-corporate-min",
      amount: 200,
      currency: "TWD",
      reason: "較早紀錄把企業網銀優惠的最低匯費當成學生費率，已撤回。個人網銀最低是 120。",
    },
  ];

  return {
    CONSULTED: CONSULTED,
    catalog: catalog,
    rejected: rejected,
    urls: {
      ihs: IHS_URL,
      visa: VISA_URL,
      visaLength: VISA_LENGTH_URL,
      money: MONEY_URL,
      glasgowTuition: GLA_TUITION_URL,
      glasgowDeposit: GLA_DEPOSIT_URL,
      glasgowTerms: GLA_TERMS_URL,
      glasgowPay: GLA_PAY_URL,
      edinburghTuition: EDI_TUITION_URL,
      edinburghProgramme: EDI_PROGRAMME_URL,
      edinburghDeposit: EDI_DEPOSIT_URL,
      edinburghFaq: EDI_FAQ_URL,
      edinburghPay: EDI_PAY_URL,
      gls: GLS_URL,
      glasgowDebt: GLA_DEBT_URL,
      convera: CONVERA_URL,
      botFee: BOT_FEE_URL,
      botTerms: BOT_TERMS_URL,
      usLoans: US_LOANS_URL,
    },
    byId: function (id) {
      for (var i = 0; i < catalog.length; i++) if (catalog[i].id === id) return catalog[i];
      return null;
    },
  };
});
