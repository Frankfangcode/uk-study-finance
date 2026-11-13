/**
 * 引導流程：個人資料 → 選校與待確認項目 → 成本計算 → 合規檢查。
 * 計算全部交給既有模組：A.buildStudentPlan（內含 C.calculatePlan）、C.simulateScenarios、
 * E.review、A.summarize。這裡只管步驟、欄位驗證和畫面，不另寫一套算術。
 *
 * 規則：
 * - 待確認的必要費用不會被預設成 0。學生要自己選「無此費用／已確認金額／仍待確認」。
 * - 沒有填來源，就不能改成「無此費用」或「另計」。
 * - 學生填的來源一律標「學生自報，非本站查證」。
 * - E 不是 PASS 時，總成本、缺口、貸款、月付一律顯示「尚未確定」。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(
      require("../a/aggregate.js"),
      require("../b/programmes.js"),
      require("../c/engine.js"),
      require("../e/review.js")
    );
  } else {
    root.GuidedFlow = factory(root.AModule, root.BModule, root.CModule, root.EModule);
    if (root.document && root.document.getElementById) {
      root.GuidedFlow.controller = root.GuidedFlow.mount(root.document);
    }
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (A, B, C, E) {
  "use strict";

  var STEPS = [
    { n: 1, title: "個人資料" },
    { n: 2, title: "選校與待確認" },
    { n: 3, title: "成本計算" },
    { n: 4, title: "合規檢查" },
  ];
  var SELF_REPORTED = "學生自報，非本站查證";
  var NOT_FINAL = "尚未確定";
  var DEMO_SOURCE = "示範：虛構來源";
  var MIN_SOURCE_LENGTH = 5;
  var RESOLVABLE_FEE = "school-insurance";

  // kind: int 整數、num 數字。positive: 必須大於 0。required: 不能留空。
  var FIELDS = [
    { id: "intakeYear", group: "basic", label: "預計入學年（西元）", kind: "int", required: true, positive: true, min: 2026, max: 2040, placeholder: "例如 2027", hint: "本站收錄的是 2027 年 9 月入學的公告學費。填別的年份時，學費與訂金會改標成假設。" },
    { id: "courseMonths", group: "basic", label: "課程長度（月）", kind: "int", required: true, positive: true, def: "12", hint: "用來估 IHS（簽證醫療附加費）。實際月數以 CAS 為準。" },
    { id: "savings", group: "funds", label: "自備款（台幣）", kind: "num", required: true, zeroOk: true, placeholder: "沒有請填 0" },
    { id: "family", group: "funds", label: "家庭支援（台幣）", kind: "num", required: true, zeroOk: true, placeholder: "沒有請填 0" },
    { id: "awardedTwd", group: "funds", label: "已核定獎學金（台幣）", kind: "num", placeholder: "沒有就留空", hint: "只填已經拿到核定通知的。還在申請中的不要填，不會計入資金。校方學費減免請在第 2 步勾選，不要在這裡再填一次。" },
    { id: "otherScholarshipTwd", group: "funds", label: "其他已入帳獎學金（台幣）", kind: "num", placeholder: "沒有就留空", hint: "錢已經入帳的才填。留空表示沒有。" },
    { id: "fxRate", group: "fx", label: "匯率假設（1 英鎊換多少台幣）", kind: "num", required: true, positive: true, def: "41", tag: "假設", hint: "預設 41 是試算示例，不是即時牌價，可以改。" },
    { id: "monthlyCap", group: "fx", label: "可接受的每月還款上限（台幣）", kind: "num", required: true, positive: true, placeholder: "例如 15000", hint: "第 3 步會拿估算月付跟這個上限比。" },
    { id: "livingMonthly", group: "more", label: "每月生活費（英鎊）", kind: "num", required: true, zeroOk: true, def: "1500", tag: "假設", hint: "預設 1,500 是示例，不是官價。" },
    { id: "livingMonths", group: "more", label: "生活費月數", kind: "int", required: true, positive: true, def: "12", tag: "假設" },
    { id: "otherGbp", group: "more", label: "其他外幣支出（英鎊）", kind: "num", required: true, zeroOk: true, def: "0", tag: "假設" },
    { id: "twdExpenses", group: "more", label: "台幣支出，如機票（台幣）", kind: "num", required: true, zeroOk: true, def: "55000", tag: "假設" },
    { id: "reservePct", group: "more", label: "預備金比例（%）", kind: "num", required: true, zeroOk: true, def: "5", tag: "假設", hint: "換算後的合計再加這個比例。不留預備金請填 0。" },
    { id: "ratePct", group: "more", label: "貸款年利率（%）", kind: "num", required: true, zeroOk: true, def: "3", tag: "假設", hint: "預設 3% 不是銀行報價，不保證核貸。" },
    { id: "termMonths", group: "more", label: "貸款攤還期數（月）", kind: "int", required: true, positive: true, def: "108", tag: "假設", positiveMsg: "攤還期數必須大於 0。0 期或負數算不出月付，不能顯示成月付 0。" },
  ];
  var GROUPS = [
    { id: "basic", title: "入學與課程" },
    { id: "funds", title: "可用資金（台幣）" },
    { id: "fx", title: "匯率與還款能力" },
    { id: "more", title: "生活費與貸款假設（已有預設，可以改）" },
  ];

  function isBlank(v) {
    return v === null || v === undefined || String(v).trim() === "";
  }

  function numOrNull(v) {
    if (isBlank(v)) return null;
    var n = Number(String(v).trim());
    return isFinite(n) ? n : null;
  }

  function createState() {
    var profile = { fxShockPct: "10" };
    FIELDS.forEach(function (f) { profile[f.id] = f.def || ""; });
    return {
      step: 1,
      demo: false,
      profile: profile,
      selected: [],
      awards: {},
      pending: {},
      errors: {},
      stepError: "",
    };
  }

  function validateProfile(profile) {
    var errors = {};
    var values = {};
    FIELDS.forEach(function (f) {
      var raw = profile[f.id];
      var name = "「" + f.label + "」";
      if (isBlank(raw)) {
        values[f.id] = null;
        if (f.required) errors[f.id] = name + "不能留空。" + (f.zeroOk ? "若這次是 0，請填 0，空白不會被當成 0。" : "");
        return;
      }
      var n = Number(String(raw).trim());
      values[f.id] = isFinite(n) ? n : null;
      if (!isFinite(n)) { errors[f.id] = name + "要填數字。"; return; }
      if (n < 0) { errors[f.id] = f.positive && f.positiveMsg ? f.positiveMsg : name + "不能是負數。"; return; }
      if (f.positive && n === 0) { errors[f.id] = f.positiveMsg || name + "必須大於 0。"; return; }
      if (f.kind === "int" && Math.floor(n) !== n) { errors[f.id] = name + "要填整數。"; return; }
      if (f.min !== undefined && n < f.min) { errors[f.id] = name + "不能早於 " + f.min + "。"; return; }
      if (f.max !== undefined && n > f.max) { errors[f.id] = name + "不能晚於 " + f.max + "。"; }
    });
    return { ok: Object.keys(errors).length === 0, errors: errors, values: values };
  }

  function pendingEntry(state, key) {
    if (!state.pending[key]) {
      state.pending[key] = { choice: "pending", source: "", amount: "", applied: { flag: "pending" }, error: "" };
    }
    return state.pending[key];
  }

  /**
   * 把學生在「待確認項目」的選擇套用到這所學校的校保。
   * 被擋下時維持（或退回）待確認，絕不會留下沒有來源的 none／extra。
   */
  function applyPending(state, key) {
    var entry = pendingEntry(state, key);
    entry.error = "";
    if (entry.choice === "pending") {
      entry.applied = { flag: "pending" };
      return { ok: true, flag: "pending" };
    }
    var source = String(entry.source || "").trim();
    function block(message) {
      entry.applied = { flag: "pending" };
      entry.error = message;
      return { ok: false, error: message };
    }
    var target = entry.choice === "none" ? "「無此費用」" : "「另計」";
    if (!source) {
      return block("沒有填來源，不能改成" + target + "，這一筆維持待確認。請填校方網址或說明（例如校方回信的日期與寄件單位）；還拿不到來源就選 (c) 仍待確認。本站不會把未知的費用當成 0。");
    }
    if (source.length < MIN_SOURCE_LENGTH) {
      return block("來源太短，看不出是哪一份文件，不能改成" + target + "，這一筆維持待確認。請寫清楚網址，或是誰、哪一天回覆的。");
    }
    if (entry.choice === "none") {
      entry.applied = { flag: "none", source: source };
      return { ok: true, flag: "none" };
    }
    if (entry.choice === "amount") {
      if (isBlank(entry.amount)) return block("選「已確認金額」要填金額，空白不會被當成 0。這一筆維持待確認。");
      var amount = numOrNull(entry.amount);
      if (amount === null) return block("金額要填數字。這一筆維持待確認。");
      if (amount < 0) return block("金額不能是負數。這一筆維持待確認。");
      if (amount === 0) return block("金額是 0 的話，請改選 (a)「不需要／無此費用」並附上來源。這一筆維持待確認。");
      entry.applied = { flag: "extra", amount: amount, source: source };
      return { ok: true, flag: "extra" };
    }
    return block("請先選一個處理方式。");
  }

  function sourceUrlOf(text) {
    return /^https?:\/\/\S+$/i.test(text) ? text : "";
  }

  function insuranceFor(state, key) {
    var applied = state.pending[key] && state.pending[key].applied;
    if (!applied || applied.flag === "pending") return { flag: "pending" };
    var source = { label: applied.source, url: sourceUrlOf(applied.source) };
    if (applied.flag === "none") return { flag: "none", amount: 0, zeroEvidence: true, source: source };
    return { flag: "extra", amount: applied.amount, zeroEvidence: false, source: source };
  }

  function intakeYearOf(programme) {
    var year = parseInt(String(programme.intake || ""), 10);
    return isFinite(year) ? year : null;
  }

  /** 對一所已選學校跑完整條既有流程：A（含 C）→ E → A.summarize → C 情境模擬。 */
  function evaluate(state, key) {
    var programme = B.buildOutput(key);
    if (!programme || !programme.tuition || programme.tuition.amount == null) {
      return { ok: false, key: key, programme: programme, error: "這個學程還不能試算。" };
    }
    var checked = validateProfile(state.profile);
    if (!checked.ok) {
      var first = Object.keys(checked.errors)[0];
      return { ok: false, key: key, programme: programme, error: "第 1 步的資料還沒填好：" + checked.errors[first] };
    }
    var v = checked.values;
    var yearMismatch = intakeYearOf(programme) !== v.intakeYear;
    programme.course_length_months = v.courseMonths;

    var awardedIds = Object.keys(state.awards[key] || {}).filter(function (id) { return state.awards[key][id]; });
    var schoolAwards = (programme.scholarships || []).filter(function (item) { return awardedIds.indexOf(item.id) !== -1; });
    var waiverGbp = schoolAwards.reduce(function (sum, item) { return sum + (item.amount_gbp || 0); }, 0);
    var awardedTwd = v.awardedTwd || 0;
    var otherTwd = v.otherScholarshipTwd || 0;

    var published = A.buildStudentPlan({
      programme: programme,
      depositPaid: null,
      insurance: insuranceFor(state, key),
      awardedWaiverGbp: waiverGbp,
      tuitionAssumption: yearMismatch,
      depositAssumption: yearMismatch,
      snapshot_id: "snap-guided-" + programme.program_id,
      assumptions: {
        fxRate: v.fxRate,
        reserveRate: v.reservePct / 100,
        livingMonthlyGbp: v.livingMonthly,
        livingMonths: v.livingMonths,
        otherGbp: v.otherGbp,
        twdExpenses: v.twdExpenses,
        savings: v.savings,
        family: v.family,
        manualScholarshipTwd: awardedTwd + otherTwd,
        incomeMonthly: null,
        loan: { annualRate: v.ratePct / 100, termMonths: v.termMonths, graceMonths: 0 },
      },
    });
    if (!published || !published.ok || !published.plan || published.plan.ok === false) {
      return {
        ok: false,
        key: key,
        programme: programme,
        error: (published && published.plan && published.plan.error) || (published && published.error) || "這份方案還不能算。",
      };
    }
    var plan = published.plan;
    var review = E.review({ lines: plan.lines, scenario: published.scenario });
    var summary = A.summarize(published, review);

    var funding = published.funding || {};
    var simAwards = [];
    // A.fundingCheck 把「現金欄剛好等於減免」視為同一筆、只計一次；這時落空情境也只算那一筆。
    if (awardedTwd > 0 && !funding.warning) {
      simAwards.push({ id: "student-awarded", name: "已核定獎學金", amount: awardedTwd, currency: "TWD", countedTwd: awardedTwd });
    }
    if (waiverGbp > 0 && funding.waiverTwd > 0) {
      simAwards.push({ id: schoolAwards[0].id, name: schoolAwards[0].name, amount: waiverGbp, currency: "GBP", countedTwd: funding.waiverTwd });
    }
    var sim = C.simulateScenarios(plan, {
      fxShockPct: numOrNull(state.profile.fxShockPct),
      awardedScholarships: simAwards,
      reviewVerdict: summary.complete ? review.verdict : "未放行",
    });

    return {
      ok: true,
      key: key,
      programme: programme,
      values: v,
      yearMismatch: yearMismatch,
      published: published,
      plan: plan,
      scenario: published.scenario,
      review: review,
      summary: summary,
      sim: sim,
      funding: funding,
      monthlyCap: v.monthlyCap,
      selfReported: plan.lines.filter(function (line) { return E.presentLine(line).selfReported; }),
    };
  }

  var HOW_TO_FIX = {
    "school-insurance": "向校方確認有沒有強制保險、金額多少。拿到來源（網址或校方回信）後，回第 2 步的「待確認項目」填寫。",
    ihs: "回第 1 步確認課程長度。這個長度的 IHS 規則本站還沒核對完，不會自己編數字。",
  };

  /** 還缺什麼：每一筆擋住放行的項目，以及學生可以怎麼補。 */
  function missingItems(model) {
    var out = [];
    if (!model.ok) return out;
    model.plan.lines.forEach(function (line) {
      var view = E.presentLine(line);
      if (view.blocked) {
        out.push({ id: line.id, name: line.name, why: view.reason, how: HOW_TO_FIX[line.id] || "補上來源，或回前面的步驟修正這一欄。" });
      } else if (line.inclusion === "pending" || (!line.known && line.inclusion !== "included")) {
        out.push({ id: line.id, name: line.name, why: "待確認，金額未知，不能當成 0。", how: HOW_TO_FIX[line.id] || "回第 1 步補上這一欄。" });
      }
    });
    model.review.blockers.forEach(function (item) {
      if (item.id === "scenario" || item.id === "assumptions" || item.id === "catalog") {
        out.push({ id: item.id, name: item.name, why: "審查代碼 " + item.code + "。", how: "這一項要由負責的組員處理，學生這邊無法自行補上。" });
      }
    });
    return out;
  }

  function demoState() {
    var state = createState();
    state.demo = true;
    state.step = 3;
    Object.assign(state.profile, {
      intakeYear: "2027",
      courseMonths: "12",
      savings: "600000",
      family: "900000",
      awardedTwd: "200000",
      otherScholarshipTwd: "0",
      fxRate: "41",
      monthlyCap: "15000",
    });
    state.selected = B.list().map(function (p) { return p.key; });
    state.selected.forEach(function (key, index) {
      var entry = pendingEntry(state, key);
      if (index === 0) {
        entry.choice = "none";
        entry.source = DEMO_SOURCE + "（虛構的校方回信，不是真實文件）";
      } else {
        entry.choice = "amount";
        entry.amount = "300";
        entry.source = DEMO_SOURCE + "（虛構的收費通知，£300 也是虛構金額）";
      }
      applyPending(state, key);
    });
    return state;
  }

  // ---------- 畫面 ----------

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function link(url, label) {
    if (!url || !/^https?:\/\//i.test(url)) return esc(label || "");
    return '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(label || url) + "</a>";
  }

  function money(n, currency) {
    if (n === null || n === undefined || n === "") return "—";
    var value = Number(n);
    if (!isFinite(value)) return "—";
    if (currency === "GBP") return "£" + value.toLocaleString("en-GB", { maximumFractionDigits: 2 });
    return "NT$" + Math.round(value).toLocaleString("en-US");
  }

  function finalOr(n) {
    return n === null || n === undefined ? NOT_FINAL : money(n);
  }

  function signed(n) {
    if (n === null || n === undefined) return "";
    if (n === 0) return "不變";
    return (n > 0 ? "＋" : "−") + money(Math.abs(n));
  }

  function schoolTitle(programme) {
    return esc(programme.school_name_zh) + " · " + esc(programme.program_name_zh);
  }

  function demoBanner(state) {
    if (!state.demo) return "";
    return '<div class="g-demo" role="note"><b>示範用虛構個案</b>　這一頁的個人資料、資金，以及「校方強制保險」的來源和金額都是虛構的（標有「' + DEMO_SOURCE +
      "」），只用來展示審查放行後的畫面。學費、訂金、IHS、簽證費仍是本站查到的公告數字。這不是任何真實學生的資料，也不代表校方真的沒有或有這筆費用。" +
      ' <button class="btn secondary" type="button" data-g-action="reset">清除示範資料，重新開始</button></div>';
  }

  function stepper(state) {
    var items = STEPS.map(function (s) {
      var cls = "g-step" + (s.n === state.step ? " current" : s.n < state.step ? " done" : "");
      return '<li><button type="button" class="' + cls + '" data-g-action="goto" data-g-step="' + s.n + '"' +
        (s.n === state.step ? ' aria-current="step"' : "") + '><span class="g-step-n">' + s.n + "</span>" + esc(s.title) + "</button></li>";
    }).join("");
    return '<ol class="g-stepper" aria-label="步驟">' + items + "</ol>";
  }

  function navButtons(state) {
    var prev = state.step > 1 ? '<button class="btn secondary" type="button" data-g-action="prev">← 上一步</button>' : "<span></span>";
    var next = state.step < STEPS.length
      ? '<button class="btn" type="button" data-g-action="next">下一步：' + esc(STEPS[state.step].title) + " →</button>"
      : '<button class="btn secondary" type="button" data-page="a">看各模組的詳細頁</button>';
    var error = state.stepError ? '<div class="banner bad" role="alert">' + esc(state.stepError) + "</div>" : "";
    return error + '<div class="g-nav">' + prev + next + "</div>";
  }

  function fieldHtml(state, f) {
    var error = state.errors[f.id];
    return '<div class="field"><label for="g-' + f.id + '">' + esc(f.label) + (f.tag ? ' <span class="tag assumption">' + esc(f.tag) + "</span>" : "") + "</label>" +
      '<input id="g-' + f.id + '" type="number" inputmode="decimal" step="any" data-g-field="' + f.id + '" value="' + esc(state.profile[f.id]) + '"' +
      (f.placeholder ? ' placeholder="' + esc(f.placeholder) + '"' : "") + (error ? ' aria-invalid="true"' : "") + " />" +
      (error ? '<div class="g-error" role="alert">' + esc(error) + "</div>" : "") +
      (f.hint ? '<div class="src">' + esc(f.hint) + "</div>" : "") + "</div>";
  }

  function renderStep1(state) {
    var groups = GROUPS.map(function (g) {
      var fields = FIELDS.filter(function (f) { return f.group === g.id; }).map(function (f) { return fieldHtml(state, f); }).join("");
      return "<fieldset><legend>" + esc(g.title) + '</legend><div class="g-fields">' + fields + "</div></fieldset>";
    }).join("");
    var demo = state.demo ? "" :
      '<div class="g-demo-offer"><button class="btn secondary" type="button" data-g-action="demo">一鍵填入「示範用虛構個案」</button>' +
      '<span class="fine">只想看放行後的畫面？這會填入虛構的個人資料與「' + DEMO_SOURCE + "」，畫面會全程標示是虛構示範。</span></div>";
    return "<h2>第 1 步　先填你的狀況</h2>" +
      '<p class="lede">這些數字只留在你的瀏覽器裡，不會送出。標「假設」的欄位已有預設值，可以改。空白不會被當成 0。</p>' +
      demo + groups;
  }

  function pendingStatus(entry) {
    var a = entry.applied;
    if (a.flag === "none") {
      return '<span class="tag ok">目前生效：無此費用</span><span class="tag self">' + SELF_REPORTED + "</span>" +
        '<div class="src">來源：' + link(sourceUrlOf(a.source), a.source) + "</div>";
    }
    if (a.flag === "extra") {
      return '<span class="tag ok">目前生效：另計 ' + money(a.amount, "GBP") + '</span><span class="tag self">' + SELF_REPORTED + "</span>" +
        '<div class="src">來源：' + link(sourceUrlOf(a.source), a.source) + "</div>";
    }
    return '<span class="tag pending">目前生效：待確認</span><div class="src">金額未知，不當成 0。這一筆沒處理之前，第 3 步的總成本會顯示「' + NOT_FINAL + "」。</div>";
  }

  function pendingCard(state, programme) {
    var key = programme.key;
    var entry = pendingEntry(state, key);
    var ins = programme.insurance || {};
    var src = ins.source || {};
    function radio(value, text) {
      return '<label class="g-choice"><input type="radio" name="g-choice-' + esc(key) + '" data-g-choice="' + value + '" data-g-key="' + esc(key) + '"' +
        (entry.choice === value ? " checked" : "") + " /> " + text + "</label>";
    }
    var inputs = "";
    if (entry.choice === "amount") {
      inputs += '<div class="field"><label for="g-amt-' + esc(key) + '">校方告知的金額（英鎊）</label>' +
        '<input id="g-amt-' + esc(key) + '" type="number" inputmode="decimal" step="any" min="0" data-g-pending-field="amount" data-g-key="' + esc(key) + '" value="' + esc(entry.amount) + '" /></div>';
    }
    if (entry.choice !== "pending") {
      inputs += '<div class="field"><label for="g-src-' + esc(key) + '">來源（必填）：校方網址，或說明是誰、哪一天、用什麼方式回覆你的</label>' +
        '<textarea id="g-src-' + esc(key) + '" rows="2" data-g-pending-field="source" data-g-key="' + esc(key) + '" placeholder="例如：https://…　或　2026-11-20 校方 Admissions 回信，寫明本學程沒有強制保險">' + esc(entry.source) + "</textarea>" +
        '<div class="src">沒有來源就不能改，這一筆會維持待確認。你填的來源會在結果和審查裡標成「' + SELF_REPORTED + "」。</div></div>";
    }
    return '<article class="card g-pending"><h3>' + esc(programme.school_name_zh) + "　校方強制保險</h3>" +
      "<div>" + pendingStatus(entry) + "</div>" +
      '<p class="src">本站查到的：' + esc(src.note || "還沒有查到金額。") + " " + link(src.url, src.label || "來源") + "</p>" +
      '<div class="g-choices" role="radiogroup" aria-label="' + esc(programme.school_name_zh) + '校方強制保險的處理方式">' +
      radio("none", "(a) 我已向校方確認「不需要／無此費用」") +
      radio("amount", "(b) 我已向校方確認金額") +
      radio("pending", "(c) 仍待確認（維持待確認，不會當成 0）") + "</div>" +
      inputs +
      (entry.error ? '<div class="banner bad" role="alert">' + esc(entry.error) + "</div>" : "") +
      '<div class="row-actions"><button class="btn" type="button" data-g-action="apply-pending" data-g-key="' + esc(key) + '">套用這個選擇</button></div></article>';
  }

  function renderStep2(state) {
    var year = numOrNull(state.profile.intakeYear);
    var cards = B.list().map(function (p) {
      var on = state.selected.indexOf(p.key) !== -1;
      var mismatch = year !== null && intakeYearOf(p) !== year
        ? '<div class="banner">你填的入學年是 ' + esc(year) + "，這裡是 " + esc(p.intake) + " 入學的公告價。選了以後，學費與訂金會標成假設，實際金額請以校方該年度公告為準。</div>"
        : "";
      var awards = (p.scholarships || []).map(function (item) {
        var checked = !!(state.awards[p.key] && state.awards[p.key][item.id]);
        return '<label class="g-choice"><input type="checkbox" data-g-award="' + esc(item.id) + '" data-g-key="' + esc(p.key) + '"' + (checked ? " checked" : "") + " /> 我已獲核定 " +
          esc(item.name) + "（" + money(item.amount_gbp, "GBP") + " " + esc(item.type) + "，只扣一次）</label>" +
          '<div class="src">沒勾就當未核定，不計入資金。' + link(item.source.url, "獎學金來源") + "</div>";
      }).join("");
      return '<article class="card program' + (on ? " selected" : "") + '">' +
        '<label class="g-pick"><input type="checkbox" data-g-programme="' + esc(p.key) + '"' + (on ? " checked" : "") + " /> <b>" + schoolTitle(p) + "</b></label>" +
        "<div>" + esc(p.program_name) + " · 入學 " + esc(p.intake) + "</div>" +
        '<table class="g-mini"><tbody>' +
        "<tr><td>學費（" + esc(p.tuition.year) + '）<span class="tag sourced">有來源</span></td><td class="num">' + money(p.tuition.amount, "GBP") + "</td></tr>" +
        '<tr><td>訂金（已含在學費，不另加）<span class="tag sourced">有來源</span></td><td class="num">' + money(p.deposit.amount, "GBP") + "</td></tr>" +
        '<tr><td>校方強制保險 <span class="tag pending">待確認</span></td><td class="num">未知</td></tr></tbody></table>' +
        '<p class="src">學費來源：' + link(p.tuition.source.url, p.tuition.source.label) + "（查閱 " + esc(p.tuition.source.consulted) + "）<br>訂金來源：" +
        link(p.deposit.source.url, p.deposit.source.label) + "（查閱 " + esc(p.deposit.source.consulted) + "）</p>" +
        mismatch + awards + "</article>";
    }).join("");

    var chosen = B.list().filter(function (p) { return state.selected.indexOf(p.key) !== -1; });
    var pending = chosen.length
      ? chosen.map(function (p) { return pendingCard(state, p); }).join("")
      : '<p class="muted">先在上面選至少一個學程，這裡才會列出它的待確認項目。</p>';
    return "<h2>第 2 步　選學校，處理待確認項目</h2>" +
      '<p class="lede">可以選一個或多個學程一起比。學費和訂金來自校方頁面；訂金會抵學費，不是另一筆成本。</p>' +
      '<div class="grid-2 g-programmes">' + cards + "</div>" +
      '<h3 class="g-section">待確認項目</h3>' +
      '<p class="muted">下面的必要費用本站還沒查到金額，所以不會自動當成 0。只要還有一筆是待確認，第 3 步就不會出現確定的總成本。你可以自己向校方確認後回來填，但一定要附來源。</p>' +
      pending;
  }

  function lineTag(line, view) {
    if (view.blocked) return '<span class="tag bad">不顯示</span>';
    if (line.inclusion === "pending") return '<span class="tag pending">待確認</span>';
    if (view.selfReported) return '<span class="tag self">' + SELF_REPORTED + "</span>";
    if (line.inclusion === "included") return '<span class="tag">已含</span>';
    if (line.assumption) return '<span class="tag assumption">假設</span>';
    if (line.sourceUrl) return '<span class="tag sourced">有來源</span>';
    return '<span class="tag pending">待確認</span>';
  }

  function sourceLine(line, view) {
    if (view.selfReported) return '<div class="src">' + SELF_REPORTED + "：" + link(line.sourceUrl, line.source) + "</div>";
    if (line.sourceUrl) return '<div class="src">' + link(line.sourceUrl, line.source || line.sourceUrl) + "</div>";
    return "";
  }

  function feeTable(plan) {
    var rows = plan.lines.map(function (line) {
      var view = E.presentLine(line);
      var amount = view.blocked ? "不顯示" : line.amount === null ? "未知" : money(line.amount, line.currency === "GBP" ? "GBP" : "TWD");
      var counted = view.blocked || line.contributeTwd === null ? "不計入" : money(line.contributeTwd);
      if (!view.blocked && line.inclusion === "included") counted = "已含，不另加";
      if (!view.blocked && line.inclusion === "none" && line.known) counted = "無此費用";
      return "<tr><td>" + esc(line.name) + "<br>" + lineTag(line, view) + (view.blocked ? '<div class="src">' + esc(view.reason) + "</div>" : "") +
        sourceLine(line, view) + '</td><td class="num">' + amount + '</td><td class="num">' + counted + "</td></tr>";
    }).join("");
    return '<div class="g-scroll"><table><thead><tr><th>項目</th><th class="num">金額</th><th class="num">計入成本（未含預備金）</th></tr></thead><tbody>' + rows + "</tbody></table></div>";
  }

  function capNote(payment, cap) {
    if (payment === null || payment === undefined || cap === null) return "";
    return payment > cap
      ? '<div class="src"><span class="tag bad">超過月付上限</span></div>'
      : '<div class="src"><span class="tag ok">在月付上限內</span></div>';
  }

  function scenarioTable(model) {
    var sim = model.sim;
    if (!sim.ok) return '<div class="banner bad" role="alert">' + esc(sim.error) + "</div>";
    function cell(value, delta, isBase) {
      if (value === null) return '<td class="num">' + NOT_FINAL + "</td>";
      return '<td class="num">' + money(value) + (isBase ? "" : '<div class="src">' + esc(signed(delta)) + "</div>") + "</td>";
    }
    var rows = sim.scenarios.map(function (item) {
      var isBase = item.id === "baseline";
      var pay = item.monthlyPayment === null
        ? '<td class="num">' + NOT_FINAL + "</td>"
        : '<td class="num">' + money(item.monthlyPayment) + (isBase ? "" : '<div class="src">' + esc(signed(item.delta.monthlyPayment)) + "</div>") + capNote(item.monthlyPayment, model.monthlyCap) + "</td>";
      return "<tr><td>" + esc(item.label) + '<div class="src">匯率 ' + esc(item.fxRate) + (item.scholarshipLost ? " · 已核定獎學金不計入" : "") + "</div></td>" +
        (sim.confirmed ? cell(item.finalTotal, item.delta.finalTotal, isBase) : cell(item.knownSubtotal, item.delta.knownSubtotal, isBase)) +
        cell(item.available, item.delta.available, isBase) +
        cell(item.confirmedGap, item.delta.confirmedGap, isBase) +
        cell(item.loanAmount, item.delta.loanAmount, isBase) + pay + "</tr>";
    }).join("");
    var status = sim.confirmed
      ? '<p class="fine">每格第二行是與基準的差額。這是演練，不是預測。</p>'
      : '<div class="banner"><span class="tag pending">' + NOT_FINAL + "</span> " + esc(sim.unconfirmedReason) + "下表的已知小計不是總成本。</div>";
    return status + '<div class="g-scroll"><table><thead><tr><th>情境</th><th class="num">' + (sim.confirmed ? "總成本" : "已知小計（不是總成本）") +
      '</th><th class="num">可用資金</th><th class="num">資金缺口</th><th class="num">建議貸款</th><th class="num">每月還款</th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
      '<p class="fine">' + esc(sim.scholarshipNote) + "</p>";
  }

  function missingList(model) {
    var items = missingItems(model);
    if (!items.length) return "";
    return '<ul class="list">' + items.map(function (item) {
      return "<li><b>" + esc(item.name) + "</b>：" + esc(item.why) + '<div class="src">怎麼補：' + esc(item.how) + "</div></li>";
    }).join("") + "</ul>";
  }

  function selfReportedBanner(model) {
    if (!model.selfReported.length) return "";
    return '<div class="banner"><span class="tag self">' + SELF_REPORTED + "</span> 這份結果裡的「" +
      model.selfReported.map(function (line) { return esc(line.name); }).join("、") +
      "」是依你自己填的來源計算的，本站沒有查證過。來源若有誤，總成本也會跟著錯。</div>";
  }

  function resultCard(model) {
    var title = "<h3>" + schoolTitle(model.programme) + "</h3>";
    if (!model.ok) return '<article class="card g-result">' + title + '<div class="banner bad" role="alert">' + esc(model.error) + "</div></article>";
    var s = model.summary;
    var status;
    if (s.complete) {
      status = '<div class="banner ok">必要費用都有金額，E 審查 PASS。下面是這組假設下的試算，不是學校或銀行的報價，也不保證核貸。</div>';
    } else {
      status = '<div class="banner" role="status"><b>' + NOT_FINAL + "</b>　E 審查是「" + esc(model.review.verdict) + "」，所以總成本、缺口、貸款、月付都不顯示數字。還缺：" +
        missingList(model) + '<button class="btn secondary" type="button" data-g-action="goto" data-g-step="2">回第 2 步處理待確認項目</button></div>';
    }
    var loanNote = "";
    if (s.complete) {
      loanNote = s.loan_amount_twd === 0
        ? '<p class="muted">可用資金已經蓋過總成本，這組假設下不需要貸款。</p>'
        : '<p class="muted">缺口向上取整到萬元當建議貸款。年利率 ' + esc(model.values.ratePct) + "%、" + esc(model.values.termMonths) + " 期（假設）。你的月付上限是 " + money(model.monthlyCap) + "。</p>";
    } else {
      loanNote = '<p class="muted">目前只有已知小計（含預備金）' + money(s.known_subtotal_twd) + "，這不是總成本，待確認的費用還沒算進去。</p>";
    }
    var warn = (model.funding && model.funding.warning) ? '<div class="banner">' + esc(model.funding.warning) + "</div>" : "";
    var mismatch = model.yearMismatch ? '<div class="banner">你填的入學年和這個學程收錄的 ' + esc(model.programme.intake) + " 不同，學費與訂金標成假設。</div>" : "";
    return '<article class="card g-result">' + title + status + selfReportedBanner(model) + mismatch + warn +
      '<div class="kpis">' +
      '<div class="kpi alt"><span>總成本</span><strong>' + finalOr(s.final_total_twd) + "</strong></div>" +
      '<div class="kpi alt"><span>資金缺口</span><strong>' + finalOr(s.confirmed_gap_twd) + "</strong></div>" +
      '<div class="kpi warn"><span>建議貸款</span><strong>' + finalOr(s.loan_amount_twd) + "</strong></div>" +
      '<div class="kpi warn"><span>每月還款</span><strong>' + finalOr(s.monthly_payment_twd) + "</strong>" +
      (s.complete ? capNote(s.monthly_payment_twd, model.monthlyCap) : "") + "</div></div>" +
      loanNote +
      "<h4>費用明細</h4>" + feeTable(model.plan) +
      "<h4>情境模擬</h4>" + scenarioTable(model) + "</article>";
  }

  function overview(models) {
    if (models.length < 2) return "";
    var rows = models.map(function (m) {
      if (!m.ok) return "<tr><td>" + schoolTitle(m.programme) + '</td><td colspan="5">' + esc(m.error) + "</td></tr>";
      var s = m.summary;
      return "<tr><td>" + schoolTitle(m.programme) + "</td><td>" + (s.complete ? '<span class="tag ok">PASS</span>' : '<span class="tag pending">' + NOT_FINAL + "</span>") +
        '</td><td class="num">' + finalOr(s.final_total_twd) + '</td><td class="num">' + finalOr(s.confirmed_gap_twd) +
        '</td><td class="num">' + finalOr(s.loan_amount_twd) + '</td><td class="num">' + finalOr(s.monthly_payment_twd) + "</td></tr>";
    }).join("");
    return '<article class="card"><h3>一起看</h3><div class="g-scroll"><table><thead><tr><th>學程</th><th>狀態</th><th class="num">總成本</th><th class="num">資金缺口</th><th class="num">建議貸款</th><th class="num">每月還款</th></tr></thead><tbody>' +
      rows + '</tbody></table></div><p class="fine">「' + NOT_FINAL + "」的學程不能拿來跟別的比高低。</p></article>";
  }

  function renderStep3(state, models) {
    return "<h2>第 3 步　成本、缺口、貸款</h2>" +
      '<p class="lede">數字由既有的 C 模組計算。只有必要費用都有金額、E 審查也 PASS 時，才會出現確定的數字。</p>' +
      '<div class="field g-shock"><label for="g-fxShockPct">情境模擬：匯率變動幅度（%）<span class="tag assumption">演練</span></label>' +
      '<input id="g-fxShockPct" type="number" inputmode="decimal" step="any" data-g-field="fxShockPct" data-g-rerender="1" value="' + esc(state.profile.fxShockPct) + '" />' +
      '<div class="src">改完按 Tab 或點別處就會重算。預設 10%，是演練用的假設，不是匯率預測。</div></div>' +
      overview(models) + models.map(resultCard).join("");
  }

  function reviewRows(model) {
    return model.plan.lines.map(function (line) {
      var view = E.presentLine(line);
      var verdict;
      var detail;
      if (view.blocked) {
        verdict = '<span class="tag bad">退修</span>';
        detail = esc(view.reason);
      } else if (line.inclusion === "pending" || (!line.known && line.inclusion !== "included")) {
        verdict = '<span class="tag pending">退修</span>';
        detail = "待確認，金額未知。不能當成 0，也不能宣稱總額算完。";
      } else {
        verdict = '<span class="tag ok">PASS</span>';
        detail = view.selfReported ? '<span class="tag self">' + SELF_REPORTED + "</span>來源：" + link(line.sourceUrl, line.source)
          : line.inclusion === "included" ? "已含在學費，不重複計。" + (line.assumption ? "金額是假設。" : "")
          : line.assumption ? '<span class="tag assumption">假設</span>有標示，可以顯示。'
          : '<span class="tag sourced">有來源</span>' + link(line.sourceUrl, line.source || "來源");
      }
      return "<tr><td>" + esc(line.name) + "</td><td>" + verdict + "</td><td>" + detail + "</td></tr>";
    }).join("");
  }

  function reviewCard(model) {
    var title = "<h3>" + schoolTitle(model.programme) + "</h3>";
    if (!model.ok) return '<article class="card g-result">' + title + '<div class="banner bad" role="alert">' + esc(model.error) + "</div></article>";
    var review = model.review;
    var s = model.summary;
    var pass = review.verdict === "PASS";
    var head = '<div class="banner' + (pass ? " ok" : review.verdict === "轉真人" ? " bad" : "") + '">E 審查：<b>' + esc(review.verdict) + "</b>。" + esc(review.note) +
      (review.self_reported.length ? "其中 " + review.self_reported.length + " 項來源是" + SELF_REPORTED + "。" : "") + "</div>";
    var missing = pass ? "" : "<h4>還缺什麼</h4>" + missingList(model) +
      '<button class="btn secondary" type="button" data-g-action="goto" data-g-step="2">回第 2 步處理待確認項目</button>';
    var rejected = (model.published.rejected || []).map(function (item) {
      return '<div class="banner bad">「' + esc(item.name) + "」被契約檢查拒收：" + esc(item.reason) + "</div>";
    }).join("");
    return '<article class="card g-result">' + title + head + rejected +
      '<div class="g-scroll"><table><thead><tr><th>項目</th><th>結果</th><th>說明／退修原因</th></tr></thead><tbody>' + reviewRows(model) +
      "<tr><td>常數目錄（來源與待確認標記）</td><td>" + (review.catalog_ok ? '<span class="tag ok">PASS</span>' : '<span class="tag bad">退修</span>') + "</td><td>" +
      (review.catalog_ok ? "每個已核對數字都有來源，待確認的沒有偷填金額。" : "目錄有問題，見審查頁。") + "</td></tr>" +
      "</tbody></table></div>" + missing +
      '<div class="kpis">' +
      '<div class="kpi alt"><span>總成本</span><strong>' + finalOr(s.final_total_twd) + "</strong></div>" +
      '<div class="kpi alt"><span>資金缺口</span><strong>' + finalOr(s.confirmed_gap_twd) + "</strong></div>" +
      '<div class="kpi warn"><span>建議貸款</span><strong>' + finalOr(s.loan_amount_twd) + "</strong></div>" +
      '<div class="kpi warn"><span>每月還款</span><strong>' + finalOr(s.monthly_payment_twd) + "</strong></div></div></article>";
  }

  function renderStep4(state, models) {
    return "<h2>第 4 步　合規檢查</h2>" +
      '<p class="lede">E 模組逐項檢查：有沒有來源、假設有沒有標、有沒有把未知當成 0。不是 PASS 的學程，確定數字一律顯示「' + NOT_FINAL + "」。</p>" +
      models.map(reviewCard).join("") +
      '<p class="fine">E 審查 PASS 只代表這份試算的每個數字都有來源或標示，不等於正式 Demo 放行（目前：尚未放行），也不構成錄取、簽證或貸款承諾。' +
      SELF_REPORTED + "的項目，請自己保留原始文件。</p>";
  }

  function renderHtml(state) {
    var body;
    if (state.step === 1) body = renderStep1(state);
    else if (state.step === 2) body = renderStep2(state);
    else {
      var models = state.selected.map(function (key) { return evaluate(state, key); });
      body = state.step === 3 ? renderStep3(state, models) : renderStep4(state, models);
    }
    return '<div class="kicker">引導流程 · 一步一步算完一份英國碩士財務方案</div>' +
      stepper(state) + demoBanner(state) + '<div class="g-body">' + body + "</div>" + navButtons(state);
  }

  // ---------- 操作 ----------

  /** 檢查目前這一步能不能往下走。擋下時把原因寫進 state。 */
  function leaveStep(state) {
    state.stepError = "";
    if (state.step === 1) {
      var checked = validateProfile(state.profile);
      state.errors = checked.errors;
      if (!checked.ok) {
        state.stepError = "有 " + Object.keys(checked.errors).length + " 個欄位要修正，改好才能到下一步。";
        return false;
      }
      return true;
    }
    if (state.step === 2) {
      if (!state.selected.length) {
        state.stepError = "請至少選一個學程。";
        return false;
      }
      var blocked = state.selected.filter(function (key) { return !applyPending(state, key).ok; });
      if (blocked.length) {
        state.stepError = "有待確認項目的選擇被擋下（見上方紅字）。補上來源，或改選 (c) 仍待確認，再按下一步。";
        return false;
      }
      return true;
    }
    return true;
  }

  function goTo(state, target) {
    target = Math.max(1, Math.min(STEPS.length, target));
    if (target <= state.step) {
      state.stepError = "";
      state.step = target;
      return true;
    }
    while (state.step < target) {
      if (!leaveStep(state)) return false;
      state.step += 1;
    }
    return true;
  }

  function mount(document) {
    var rootEl = document.getElementById("g-root");
    var state = createState();

    function render() {
      rootEl.innerHTML = renderHtml(state);
    }

    function replaceState(next) {
      Object.keys(state).forEach(function (k) { delete state[k]; });
      Object.assign(state, next);
    }

    function attr(target, name) {
      return target && target.getAttribute ? target.getAttribute(name) : null;
    }

    // 打字時只更新資料，不重畫，免得輸入框失去焦點。
    function capture(target) {
      var field = attr(target, "data-g-field");
      if (field) {
        state.profile[field] = target.value;
        return true;
      }
      var pendingField = attr(target, "data-g-pending-field");
      var key = attr(target, "data-g-key");
      if (pendingField && key) {
        pendingEntry(state, key)[pendingField] = target.value;
        return true;
      }
      return false;
    }

    document.addEventListener("input", function (event) {
      capture(event.target);
    });

    document.addEventListener("change", function (event) {
      var target = event.target;
      if (capture(target)) {
        if (attr(target, "data-g-rerender")) render();
        return;
      }
      var key = attr(target, "data-g-key");
      var programme = attr(target, "data-g-programme");
      if (programme) {
        var at = state.selected.indexOf(programme);
        if (target.checked && at === -1) state.selected.push(programme);
        if (!target.checked && at !== -1) state.selected.splice(at, 1);
        // 保持 B 的列出順序，不因點選先後而變。
        var order = B.list().map(function (p) { return p.key; });
        state.selected.sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); });
        state.stepError = "";
        render();
        return;
      }
      var choice = attr(target, "data-g-choice");
      if (choice && key) {
        var entry = pendingEntry(state, key);
        entry.choice = choice;
        entry.error = "";
        render();
        return;
      }
      var award = attr(target, "data-g-award");
      if (award && key) {
        if (!state.awards[key]) state.awards[key] = {};
        state.awards[key][award] = !!target.checked;
        render();
      }
    });

    document.addEventListener("click", function (event) {
      var btn = event.target && event.target.closest ? event.target.closest("[data-g-action]") : null;
      if (!btn) return;
      var action = btn.getAttribute("data-g-action");
      if (action === "next") goTo(state, state.step + 1);
      else if (action === "prev") goTo(state, state.step - 1);
      else if (action === "goto") goTo(state, Number(btn.getAttribute("data-g-step")));
      else if (action === "apply-pending") applyPending(state, btn.getAttribute("data-g-key"));
      else if (action === "demo") replaceState(demoState());
      else if (action === "reset") replaceState(createState());
      else return;
      render();
      if (action !== "apply-pending" && typeof scrollTo === "function") scrollTo(0, 0);
    });

    render();
    return { state: state, render: render };
  }

  return {
    STEPS: STEPS,
    FIELDS: FIELDS,
    SELF_REPORTED: SELF_REPORTED,
    NOT_FINAL: NOT_FINAL,
    DEMO_SOURCE: DEMO_SOURCE,
    createState: createState,
    validateProfile: validateProfile,
    applyPending: applyPending,
    insuranceFor: insuranceFor,
    evaluate: evaluate,
    missingItems: missingItems,
    demoState: demoState,
    goTo: goTo,
    renderHtml: renderHtml,
    mount: mount,
  };
});
