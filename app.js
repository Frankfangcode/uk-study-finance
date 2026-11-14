(function () {
  "use strict";

  var A = window.AModule;
  var B = window.BModule;
  var C = window.CModule;
  var D = window.DModule;
  var P = window.DProducts;
  var E = window.EModule;
  var Constants = window.SharedConstants;
  // g 是引導流程（modules/guided/flow.js 自己畫），放第一個，也是預設頁。
  // ai 是「AI 助理（試作）」（agents/ui.js 自己畫）。
  var pages = ["g", "a", "b", "c", "d", "e", "ai"];

  function $(id) { return document.getElementById(id); }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function link(url, label) {
    if (!url) return esc(label || "");
    return '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(label || url) + "</a>";
  }

  function money(n, currency) {
    if (n === null || n === undefined || n === "") return "—";
    if (currency === "GBP") {
      var gbp = Number(n);
      if (!isFinite(gbp)) return "—";
      return "£" + gbp.toLocaleString("en-GB", { maximumFractionDigits: 2 });
    }
    var twd = Math.round(Number(n));
    if (!isFinite(twd)) return "—";
    return "NT$" + twd.toLocaleString("zh-Hant");
  }

  function numOrNull(value) {
    if (value === null || value === undefined || value === "") return null;
    var n = Number(value);
    return isFinite(n) ? n : null;
  }

  function paidValue() {
    var value = $("deposit-paid").value;
    if (value === "paid") return true;
    if (value === "unpaid") return false;
    return null;
  }

  function showPage(name) {
    if (pages.indexOf(name) < 0) name = "g";
    pages.forEach(function (page) {
      $("page-" + page).classList.toggle("hidden", page !== name);
    });
    document.querySelectorAll(".nav-btn").forEach(function (btn) {
      btn.setAttribute("aria-current", btn.getAttribute("data-page") === name ? "page" : "false");
    });
    if (location.hash !== "#" + name) history.replaceState(null, "", "#" + name);
    render();
    window.scrollTo(0, 0);
  }

  function applyOfficialNumbers() {
    var programme = B.buildOutput($("preset").value);
    if (!programme || programme.tuition.amount == null) return;
    $("tuition").value = programme.tuition.amount;
    $("deposit").value = programme.deposit.amount;
    $("course-months").value = programme.course_length_months;
    $("tuition-src").innerHTML = "來源：" + link(programme.tuition.source.url, programme.tuition.source.label) + "。查閱 " + esc(programme.tuition.source.consulted) + "。";
    $("deposit-src").innerHTML = "來源：" + link(programme.deposit.source.url, programme.deposit.source.label) + "。已含在學費裡。";
    if (programme.key !== "glasgow") $("awarded").checked = false;
  }

  function readProgramme() {
    var key = $("preset").value;
    var programme = B.buildOutput(key);
    var tuition = numOrNull($("tuition").value);
    var deposit = numOrNull($("deposit").value);
    var months = numOrNull($("course-months").value);
    var tuitionEdited = tuition !== null && tuition !== programme.tuition.amount;
    var depositEdited = deposit !== null && deposit !== programme.deposit.amount;
    // 留空就是留空：不默默退回公告價，交給 currentCase 依「留空先不算」擋下。
    programme._tuitionBlank = tuition === null;
    programme._depositBlank = deposit === null;
    programme.tuition.amount = tuition;
    programme.deposit.amount = deposit;
    programme.course_length_months = months;
    if (tuitionEdited) {
      programme.tuition.source = { label: "自訂學費", url: "", assumption: true, consulted: "2026-11-12", note: "已改過公告學費。" };
    }
    if (depositEdited) {
      programme.deposit.source = { label: "自訂訂金", url: "", assumption: true, consulted: "2026-11-12", note: "已改過公告訂金。" };
    }
    programme._tuitionEdited = tuitionEdited;
    programme._depositEdited = depositEdited;
    return programme;
  }

  function currentCase() {
    var programme = readProgramme();
    if (programme._tuitionBlank || programme._depositBlank) {
      return { ok: false, error: "學費或訂金留空時先不算，避免把空白當成 0，也不會默默改用公告價。要用公告價請重新選一次學程。", programme: programme };
    }
    var reserveInput = numOrNull($("reserve").value);
    if (reserveInput !== null && reserveInput < 0) {
      return { ok: false, error: "預備金比例不能是負數。不留預備金請填 0。", programme: programme };
    }
    var termInput = numOrNull($("term").value);
    if (termInput !== null && termInput <= 0) {
      return { ok: false, error: "攤還期數必須大於 0。0 期或負數算不出月付。", programme: programme };
    }
    var published = A.buildStudentPlan({
      programme: programme,
      depositPaid: paidValue(),
      insurance: {
        flag: $("ins-flag").value,
        amount: numOrNull($("ins-amt").value),
        zeroEvidence: $("ins-evidence").checked,
      },
      awardedWaiverGbp: $("awarded").checked && programme.scholarships && programme.scholarships.length ? programme.scholarships[0].amount_gbp : 0,
      assumptions: {
        fxRate: numOrNull($("fx").value),
        reserveRate: numOrNull($("reserve").value),
        livingMonthlyGbp: numOrNull($("living-m").value),
        livingMonths: numOrNull($("living-months").value),
        otherGbp: numOrNull($("other-gbp").value),
        twdExpenses: numOrNull($("twd").value),
        savings: numOrNull($("savings").value),
        family: numOrNull($("family").value),
        manualScholarshipTwd: numOrNull($("scholarship").value),
        incomeMonthly: numOrNull($("income").value),
        loan: {
          annualRate: numOrNull($("rate").value),
          termMonths: numOrNull($("term").value),
          graceMonths: numOrNull($("grace").value),
        },
      },
      tuitionAssumption: programme._tuitionEdited,
      depositAssumption: programme._depositEdited,
    });
    if (numOrNull($("fx").value) === null || numOrNull($("reserve").value) === null) {
      return { ok: false, error: "匯率或預備金留空時先不算，避免把空白當成 0。", programme: programme };
    }
    if (numOrNull($("savings").value) === null || numOrNull($("family").value) === null || numOrNull($("grace").value) === null) {
      return { ok: false, error: "自備款、家庭支援或寬限期留空時先不算。若這次假設是 0，請填 0。", programme: programme };
    }
    if (programme.tuition.amount == null || programme.deposit.amount == null) {
      return { ok: false, error: "學費或訂金留空時先不算，避免把空白當成 0。", programme: programme };
    }
    if (!published || !published.ok || !published.plan || published.plan.ok === false) {
      return { ok: false, error: (published && published.plan && published.plan.error) || (published && published.error) || "這份方案還不能算。", programme: programme };
    }
    if (programme._tuitionEdited && published.plan) {
      published.plan.lines.forEach(function (line) {
        if (line.id === "tuition") line.assumption = true;
      });
    }
    var review = E.review({ lines: published.plan.lines, scenario: published.scenario });
    var summary = A.summarize(published, review);
    var depositDue = D.outstanding(published.scenario, "deposit");
    var tuitionDue = D.outstanding(published.scenario, "tuition");
    return {
      ok: true,
      programme: programme,
      published: published,
      plan: published.plan,
      scenario: published.scenario,
      review: review,
      summary: summary,
      awards: B.awardState(programme, $("awarded").checked ? programme.scholarships.map(function (item) { return item.id; }) : []),
      depositPay: D.compare({
        school_id: programme.school_id,
        fee_purpose: "deposit",
        amount_due: depositDue.amount,
        currency: depositDue.currency,
        payer_country: "TW",
        amount_basis: depositDue.basis,
      }),
      tuitionPay: D.compare({
        school_id: programme.school_id,
        fee_purpose: "tuition",
        amount_due: tuitionDue.amount,
        currency: tuitionDue.currency,
        payer_country: "TW",
        amount_basis: tuitionDue.basis,
      }),
      depositDue: depositDue,
      tuitionDue: tuitionDue,
    };
  }

  function verdictClass(verdict) {
    if (verdict === "PASS") return "banner ok";
    if (verdict === "轉真人") return "banner bad";
    return "banner";
  }

  function statusTag(line, view) {
    if (view && view.blocked) return '<span class="tag bad">不顯示</span>';
    if (line.inclusion === "pending") return '<span class="tag pending">待確認</span>';
    if (line.inclusion === "included") return '<span class="tag">已含</span>';
    if (line.assumption) return '<span class="tag assumption">假設</span>';
    if (line.sourceUrl) return '<span class="tag sourced">有來源</span>';
    return '<span class="tag pending">待確認</span>';
  }

  function acceptanceTag(value) {
    if (value === "核准") return '<span class="tag ok">核准</span>';
    if (value === "不接受") return '<span class="tag bad">不接受</span>';
    return '<span class="tag pending">待確認</span>';
  }

  function feeTable(plan) {
    var rows = plan.lines.map(function (line) {
      var view = E.presentLine(line);
      var amount = view.blocked ? "不顯示" : (line.amount === null ? "null" : (line.currency === "GBP" ? money(line.amount, "GBP") : money(line.amount)));
      var contribute = view.blocked || line.contributeTwd === null ? "不計入" : money(line.contributeTwd);
      if (!view.blocked && line.inclusion === "included") contribute = "已含，不另加";
      var src = line.sourceUrl ? '<div class="src">' + link(line.sourceUrl, line.source || line.sourceUrl) + "</div>" : "";
      var note = line.note ? '<div class="src">' + esc(line.note) + "</div>" : "";
      var blocked = view.blocked ? '<div class="src">' + esc(view.reason) + "</div>" : "";
      return "<tr><td>" + esc(line.name) + "<br>" + statusTag(line, view) + blocked + src + note + '</td><td class="num">' + amount + '</td><td class="num">' + contribute + "</td></tr>";
    }).join("");
    return '<table><thead><tr><th>項目</th><th class="num">金額</th><th class="num">計入成本（未含預備金）</th></tr></thead><tbody>' + rows + "</tbody></table>";
  }

  function channelCard(ch) {
    var fees = "固定費 " + (ch.fixed_fee === null ? "null" : ch.fixed_fee) +
      " · 比例 " + (ch.pct_fee === null ? "null" : ch.pct_fee) +
      " · 最低 " + (ch.min_fee === null ? "null" : ch.min_fee) +
      " · 最高 " + (ch.max_fee === null ? "null" : ch.max_fee) +
      " · 匯差 " + (ch.fx_spread === null ? "null" : ch.fx_spread);
    var pre = (ch.preconditions || []).map(esc).join("；");
    return '<article class="card channel"><h3>' + esc(ch.name) + "</h3><p>" +
      acceptanceTag(ch.school_acceptance) + "學校是否接受 · " + acceptanceTag(ch.payer_eligibility) + "台灣付款人是否已確認</p>" +
      (pre ? '<p class="fine">前提：' + pre + "</p>" : "") +
      '<p class="fine">報價狀態：' + esc(ch.quote_status) + "。實付合計：" + (ch.payer_total === null ? "null" : esc(ch.payer_total)) + "</p>" +
      '<p class="fine">' + esc(fees) + "</p>" +
      '<p class="src">' + esc(ch.note) + "</p>" +
      '<p class="src">來源：' + link(ch.source_url, ch.source_url) + (ch.record ? " · " + esc(ch.record) : "") + "</p></article>";
  }

  function findLine(plan, id) {
    for (var i = 0; i < plan.lines.length; i++) if (plan.lines[i].id === id) return plan.lines[i];
    return null;
  }

  // 只講目前選的這所學校。「格拉斯哥直接匯校不接受」只在選格拉斯哥時出現。
  function refusedChannelText(model) {
    if (model.programme.key !== "glasgow") return "";
    var refused = model.tuitionPay.channels.some(function (ch) {
      return ch.channel_id === "uog-direct-bank" && ch.school_acceptance === "不接受";
    });
    return refused ? "格拉斯哥直接匯到學校是不接受；" : "";
  }

  // 比率（unit 為「比例」）顯示成百分比，不能套台幣格式變成 NT$0。
  function percent(n) {
    var value = Number(n);
    if (!isFinite(value)) return "—";
    return parseFloat((value * 100).toFixed(4)) + "%";
  }

  function catalogValue(entry) {
    if (entry.amount === null || entry.amount === undefined) return "null";
    if (entry.unit === "比例") return percent(entry.amount);
    if (entry.currency === "GBP") return money(entry.amount, "GBP");
    if (entry.currency === "TWD") return money(entry.amount);
    return esc(entry.amount);
  }

  // C 頁給人看的情境 JSON。E 沒放行時，確定值一律遮成 null。
  function scenarioForDisplay(scenario, summary, review) {
    if (summary.complete || !scenario.complete) return scenario;
    var copy = JSON.parse(JSON.stringify(scenario));
    copy.complete = false;
    ["final_total_twd", "confirmed_gap_twd", "loan_amount_twd", "monthly_payment_twd", "grace_interest_monthly_twd", "burden_percent"].forEach(function (key) {
      copy[key] = null;
    });
    copy.review_verdict = review.verdict;
    return copy;
  }

  function signed(n, formatter) {
    if (n === null || n === undefined) return "";
    if (n === 0) return "不變";
    return (n > 0 ? "＋" : "−") + formatter(Math.abs(n));
  }

  // 情境模擬表。確定值只在 A.summarize（已套 E 審查）放行時才有；否則只列已知小計與可用資金的變化。
  function scenarioSection(model) {
    var shock = numOrNull($("fx-shock").value);
    var head = '<article class="card" style="margin-top:12px"><h3>情境模擬</h3>' +
      '<p class="fine">這是演練，不是預測：不猜匯率會怎麼走，也不猜獎學金會不會落空，只算「如果發生了，數字會變多少」，讓你先演練再決定。匯率、利率、期數都沿用左邊的假設，不保證核貸。</p>';
    if (shock === null) {
      return head + '<div class="banner bad">匯率變動幅度留空時先不模擬，不會默默當成 10%。</div></article>';
    }
    var programme = model.programme;
    var funding = model.published.funding || {};
    var awarded = [];
    if ($("awarded").checked && programme.scholarships && programme.scholarships.length && funding.waiverTwd > 0) {
      awarded.push({
        id: programme.scholarships[0].id,
        name: programme.scholarships[0].name,
        amount: programme.scholarships[0].amount_gbp,
        currency: "GBP",
        countedTwd: funding.waiverTwd,
      });
    }
    var sim = C.simulateScenarios(model.plan, {
      fxShockPct: shock,
      awardedScholarships: awarded,
      reviewVerdict: model.summary.complete ? model.review.verdict : "未放行",
    });
    if (!sim.ok) return head + '<div class="banner bad">' + esc(sim.error) + "</div></article>";

    function cell(value, delta, isBase) {
      if (value === null) return '<td class="num">尚未確定</td>';
      var change = isBase ? "" : '<div class="src">' + esc(signed(delta, money)) + "</div>";
      return '<td class="num">' + money(value) + change + "</td>";
    }
    var rows = sim.scenarios.map(function (item) {
      var isBase = item.id === "baseline";
      var burden = item.burdenPercent === null ? "" : '<div class="src">負擔比 ' + esc(item.burdenPercent) + "%</div>";
      var pay = item.monthlyPayment === null
        ? '<td class="num">尚未確定</td>'
        : '<td class="num">' + money(item.monthlyPayment) + (isBase ? "" : '<div class="src">' + esc(signed(item.delta.monthlyPayment, money)) + "</div>") + burden + "</td>";
      return "<tr><td>" + esc(item.label) + '<div class="src">匯率 ' + esc(item.fxRate) + (item.scholarshipLost ? " · 獎學金不計入" : "") + "</div></td>" +
        (sim.confirmed ? cell(item.finalTotal, item.delta.finalTotal, isBase) : cell(item.knownSubtotal, item.delta.knownSubtotal, isBase)) +
        cell(item.available, item.delta.available, isBase) +
        cell(item.confirmedGap, item.delta.confirmedGap, isBase) +
        cell(item.loanAmount, item.delta.loanAmount, isBase) +
        pay + "</tr>";
    }).join("");
    var status = sim.confirmed
      ? '<div class="banner ok">必要費用都有金額、E 審查 PASS。下表是這組假設下的試算，每格第二行是與基準的差額。</div>'
      : '<div class="banner"><span class="tag pending">尚未確定</span> ' + esc(sim.unconfirmedReason) + "下表的已知小計不是總成本，缺口、貸款、月付維持空白。</div>";
    return head + status +
      '<div style="overflow-x:auto"><table><thead><tr><th>情境</th><th class="num">' + (sim.confirmed ? "總成本（台幣）" : "已知小計（不是總成本）") +
      '</th><th class="num">可用資金</th><th class="num">資金缺口</th><th class="num">建議貸款</th><th class="num">每月還款</th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
      '<p class="fine">' + esc(sim.scholarshipNote) + (sim.hasAwardedScholarship ? "「落空」只針對已勾選核定的減免；其他已入帳的獎學金不動。" : "") +
      " 匯率變動幅度 " + esc(sim.fxShockPct) + "% 可在左邊調整。</p></article>";
  }

  function renderA(model) {
    if (!model.ok) {
      $("page-a").innerHTML = '<div class="banner bad">' + esc(model.error) + "</div>";
      return;
    }
    var programme = model.programme;
    var review = model.review;
    var summary = model.summary;
    var scenario = model.scenario;
    var finalText = summary.final_total_twd === null ? "尚未確定" : money(summary.final_total_twd);
    var gapText = summary.confirmed_gap_twd === null ? "尚未確定" : money(summary.confirmed_gap_twd);
    var loanText = summary.loan_amount_twd === null ? "尚未確定" : money(summary.loan_amount_twd);
    var ref = "";
    if (scenario.reference_only) {
      ref = '<p class="muted">已知項目的暫估是 ' + money(scenario.reference_only.total) + "，暫估缺口 " + money(scenario.reference_only.gap) + "。這不是確定總額，也不能拿來排名。</p>";
    }
    var awardRows = model.awards.length ? model.awards.map(function (award) {
      return "<li><b>" + esc(award.name) + "</b> " + (award.awarded ? '<span class="tag ok">已核定，計入一次</span>' : '<span class="tag pending">未核定，不計入</span>') +
        " " + money(award.amount_gbp, "GBP") + " " + esc(award.type) + '<div class="src">' + link(award.source.url, "來源") + " · " + esc(award.stack_note) + "</div></li>";
    }).join("") : "<li>這個示例還沒有已核對的獎學金，所以不顯示 0 元。</li>";
    $("page-a").innerHTML =
      '<div class="kicker">模組 A · 陳致安 · 彙整，不代替審查放行</div>' +
      "<h2>" + esc(programme.school_name_zh) + " · " + esc(programme.program_name_zh) + "</h2>" +
      '<p class="lede">下面這頁把學程、費用、試算、付不付得了、以及審查狀態放在一起。確定總額只有在必要項目都有金額、而且 E 沒有退修時才會出現。</p>' +
      '<div class="' + verdictClass(review.verdict) + '">審查：' + esc(review.verdict) + "。正式 Demo：" + esc(review.formal_demo) + "。" + esc(review.note) + "</div>" +
      '<div class="kpis">' +
      '<div class="kpi"><span>已知小計（含預備金）</span><strong>' + money(summary.known_subtotal_twd) + "</strong></div>" +
      '<div class="kpi alt"><span>確定總額</span><strong>' + finalText + "</strong></div>" +
      '<div class="kpi alt"><span>確定缺口</span><strong>' + gapText + "</strong></div>" +
      '<div class="kpi warn"><span>建議貸款</span><strong>' + loanText + "</strong></div></div>" +
      ref +
      '<div class="grid-2">' +
      '<article class="card"><h3>學程</h3><p>' + esc(programme.program_name) + "</p><p class=\"fine\">入學 " + esc(programme.intake || "—") + " · " + esc(programme.course_length_text || "") + "</p>" +
      '<p class="src">學費 ' + money(programme.tuition.amount, "GBP") + " · " + link(programme.tuition.source.url, "學費來源") + "</p>" +
      '<p class="src">訂金 ' + money(programme.deposit.amount, "GBP") + "，已含在學費。 " + link(programme.deposit.source.url, "訂金來源") + "</p></article>" +
      '<article class="card"><h3>資金怎麼分</h3><ul class="list">' + awardRows +
      "<li>自備款 " + money(scenario.funds.savings) + " <span class=\"tag assumption\">假設</span></li>" +
      "<li>家庭支援 " + money(scenario.funds.family) + " <span class=\"tag assumption\">假設</span></li>" +
      "<li>已計入的獎學金／減免 " + money(scenario.funds.scholarship) + "。未核定的獎項不會出現在這裡。</li></ul>" +
      '<p class="fine">匯率 ' + esc(scenario.fx_rate) + "（假設）、預備金 " + esc(scenario.reserve_rate) + "（假設）。</p></article></div>" +
      '<article class="card" style="margin-top:16px"><h3>費用</h3>' + feeTable(model.plan) + "</article>" +
      '<article class="card" style="margin-top:16px"><h3>付不付得了</h3><p>學費管道比的是待付餘額 ' +
      (model.tuitionDue.amount === null ? "（尚未確認，不排名）" : money(model.tuitionDue.amount, "GBP")) +
      "。" + refusedChannelText(model) + "沒有報價的管道不產生最低價。" +
      ' <button class="btn secondary" type="button" data-page="d" data-d-tab="pay">看支付比較</button></p></article>';
  }

  function renderB() {
    var selected = $("preset").value;
    var cards = B.list().map(function (programme) {
      var on = programme.key === selected ? " selected" : "";
      return '<article class="card program' + on + '">' +
        '<span class="tag sourced">有來源</span>' +
        "<h3>" + esc(programme.school_name_zh) + " · " + esc(programme.program_name_zh) + "</h3>" +
        "<div>" + esc(programme.program_name) + " · 入學 " + esc(programme.intake) + "</div>" +
        "<p>學費 " + money(programme.tuition.amount, "GBP") + " · 訂金 " + money(programme.deposit.amount, "GBP") + "（已含在學費）</p>" +
        '<p class="src">學費：' + link(programme.tuition.source.url, "來源") + " · 訂金：" + link(programme.deposit.source.url, "來源") + "</p>" +
        '<button class="btn" type="button" data-action="select-programme" data-key="' + esc(programme.key) + '">選這個學程</button></article>';
    }).join("");
    var programme = B.buildOutput(selected);
    var scholarships = programme.scholarships.length ? programme.scholarships.map(function (item) {
      return "<li><b>" + esc(item.name) + "</b> · " + esc(item.type) + " · " + money(item.amount_gbp, "GBP") + " · " + esc(item.year) +
        '<div class="src">' + link(item.source.url, "來源") + "</div><p class=\"fine\">" + esc(item.stack_note) + "</p></li>";
    }).join("") : "<li>" + esc(programme.scholarship_note || "尚無已核對獎學金。") + "</li>";
    var lengthTag = programme.course_length_mapping === "假設" ? '<span class="tag assumption">假設</span>' : '<span class="tag sourced">學程頁</span>';
    $("page-b").innerHTML =
      '<div class="kicker">模組 B · 曾尉庭 · 學程、學費、訂金、獎學金</div>' +
      "<h2>先選一個英國示例</h2>" +
      '<p class="lede">這兩個學程的學費和訂金來自校方頁面。訂金會抵學費，不是第三筆成本。獎學金在你確認獲獎之前，不會拿去填缺口。</p>' +
      '<div class="grid-2" style="margin:16px 0">' + cards + "</div>" +
      '<div class="grid-2"><article class="card"><h3>目前這一個</h3>' +
      "<p>" + esc(programme.school_name_zh) + " · " + esc(programme.program_name) + "</p>" +
      "<p>課程長度 " + esc(programme.course_length_months) + " 個月 " + lengthTag + "</p>" +
      '<p class="fine">' + esc(programme.course_length_text) + "</p>" +
      "<p>校方保險 <span class=\"tag pending\">待確認</span> 金額 null，不當成 0。</p>" +
      '<p class="fine">' + esc(programme.payment_hint) + "</p>" +
      '<div class="row-actions"><button class="btn" type="button" data-page="c">用這個學程試算</button></div></article>' +
      '<article class="card"><h3>獎學金</h3><ul class="list">' + scholarships + "</ul>" +
      (programme.sponsor_rule ? '<p class="fine">' + esc(programme.sponsor_rule.note) + (programme.sponsor_rule.url ? " " + link(programme.sponsor_rule.url, "相關頁") : "") + "</p>" : "") +
      "</article></div>";
  }

  function renderC(model) {
    var programme = model.programme || B.buildOutput($("preset").value);
    var ihs = C.ihsAmountGbp($("course-months").value);
    $("ihs").value = ihs.amount === null ? "待確認" : String(ihs.amount);
    $("visa-fee").value = String(C.VISA_FEE_OUTSIDE_GBP);
    if (!model.ok) {
      $("c-results").innerHTML = '<div class="banner bad">' + esc(model.error) + "</div>";
      return;
    }
    var plan = model.plan;
    var scenario = model.scenario;
    var review = model.review;
    // 跟 A 頁一樣：確定值只從 A.summarize（已套 E 審查）拿，不直接讀 scenario。
    var summary = model.summary;
    var banner;
    if (summary.complete) {
      banner = '<div class="banner ok">必要費用都有金額。下面的確定總額仍是這組假設下的試算，不是學校或銀行報價。正式 Demo 尚未放行。</div>';
    } else if (scenario.complete) {
      var why = review.blockers.map(function (item) {
        return esc(item.name) + "：" + esc(E.presentLine(findLine(plan, item.id) || {}).reason || item.code);
      }).join("；");
      banner = '<div class="' + verdictClass(review.verdict) + '">金額都填了，但 E 審查是「' + esc(review.verdict) + "」，所以確定總額、確定缺口、建議貸款都空著。" +
        esc(review.note) + (why ? "原因：" + why : "") + "</div>";
    } else {
      banner = '<div class="banner">還有待確認項目（目前通常是校方保險），所以確定總額、確定缺口、建議貸款都空著。已知小計只供對照。</div>';
    }
    var rejectedNote = (model.published.rejected || []).map(function (item) {
      return '<div class="banner bad">「' + esc(item.name) + "」被契約檢查拒收：" + esc(item.reason) + "。這一筆先當待確認，不計入總額；改好欄位就會重算。</div>";
    }).join("");
    var depositLine = "待付學費餘額：";
    if (!plan.deposit || plan.deposit.balanceDue === null) depositLine += "尚未確認";
    else depositLine += money(plan.deposit.balanceDue, "GBP") + "（訂金" + (plan.deposit.paid ? "已付" : "未付") + "）。總學費不因訂金改變。";
    var loanLine = "";
    if (summary.complete && summary.monthly_payment_twd !== null) {
      loanLine = '<p class="muted">假設年利率 ' + (plan.annualRate === null ? "—" : (plan.annualRate * 100).toFixed(2)) +
        "%、" + esc(plan.termMonths) + " 期，估月付 " + money(summary.monthly_payment_twd) +
        (plan.burdenPercent === null ? "" : "，負擔比 " + plan.burdenPercent + "%") + "。不保證核貸。</p>";
    } else if (summary.reference_only) {
      loanLine = '<p class="muted">若只看已知名目，暫估缺口 ' + money(summary.reference_only.gap) + "，暫估貸款 " + money(summary.reference_only.loan) + "。這不是確定值。</p>";
    }
    var lastLabel = "建議貸款（假設）";
    var lastValue = summary.loan_amount_twd === null ? "尚未確定" : money(summary.loan_amount_twd);
    if (!summary.complete && summary.reference_only) {
      lastLabel = "暫估總額";
      lastValue = money(summary.reference_only.total);
    }
    var shown = scenarioForDisplay(scenario, summary, review);
    var jsonTitle = shown === scenario ? "交給 A 的情境 JSON" : "情境 JSON（E 還沒放行，確定值先遮成 null）";
    $("c-results").innerHTML = banner + rejectedNote +
      '<div class="kpis"><div class="kpi"><span>已知小計</span><strong>' + money(summary.known_subtotal_twd) + "</strong></div>" +
      '<div class="kpi alt"><span>確定總額</span><strong>' + (summary.final_total_twd === null ? "尚未確定" : money(summary.final_total_twd)) + "</strong></div>" +
      '<div class="kpi alt"><span>確定缺口</span><strong>' + (summary.confirmed_gap_twd === null ? "尚未確定" : money(summary.confirmed_gap_twd)) + "</strong></div>" +
      '<div class="kpi warn"><span>' + lastLabel + "</span><strong>" + lastValue + "</strong></div></div>" +
      '<article class="card"><h3>費用明細</h3><p class="fine">' + esc(depositLine) + "</p>" + loanLine + feeTable(plan) + "</article>" +
      scenarioSection(model) +
      '<details class="card" style="margin-top:12px"><summary>' + jsonTitle + '</summary><pre class="json">' + esc(JSON.stringify(shown, null, 2)) + "</pre></details>" +
      '<p class="fine">IHS 說明：' + esc(ihs.reason || "") + "</p>";
    $("tuition-src").innerHTML = programme && programme._tuitionEdited
      ? "你改過學費，這格改標假設，不再掛校方公布價。"
      : "來源：" + link(programme.tuition.source.url, programme.tuition.source.label) + "。";
    $("deposit-src").innerHTML = programme && programme._depositEdited
      ? "你改過訂金，這格改標假設。訂金仍不另加總成本。"
      : "來源：" + link(programme.deposit.source.url, programme.deposit.source.label) + "。已含在學費裡。";
  }

  // ---- D 頁子分頁：匯款／支付、信用卡、外幣帳戶、保險類型 ----
  var D_TABS = [
    { id: "pay", label: "匯款／支付" },
    { id: "cards", label: "信用卡" },
    { id: "fx", label: "外幣帳戶" },
    { id: "insurance", label: "保險類型" },
  ];
  var fxAssumption = Constants.byId("fx-gbp-twd");
  // 試算輸入留字串，跟 input.value 一樣；空白不會被偷偷補成預設值。
  var dState = { tab: "pay", amountGbp: "30000", count: "1", fxRate: String(fxAssumption.amount) };

  function dTabs() {
    return '<div class="subtabs" role="tablist" aria-label="金融工具類別">' + D_TABS.map(function (tab) {
      var on = tab.id === dState.tab;
      return '<button type="button" role="tab" class="subtab' + (on ? " current" : "") + '" aria-selected="' + (on ? "true" : "false") +
        '" data-d-tab="' + tab.id + '">' + esc(tab.label) + "</button>";
    }).join("") + "</div>";
  }

  function dInput() {
    return { amountGbp: numOrNull(dState.amountGbp), count: numOrNull(dState.count), fxRate: numOrNull(dState.fxRate) };
  }

  function dCalcForm() {
    function field(id, label, hint) {
      return '<div class="field"><label for="d-' + id + '">' + label + '</label><input id="d-' + id + '" type="number" inputmode="decimal" min="0" step="any" data-d-field="' + id +
        '" value="' + esc(dState[id]) + '" />' + (hint ? '<div class="src">' + hint + "</div>" : "") + "</div>";
    }
    return '<article class="card d-calc"><h3>同條件試算</h3><div class="d-fields">' +
      field("amountGbp", "每筆金額（GBP）", "例如學費 £30,000，或每月生活費。") +
      field("count", "筆數", "學費一次付填 1；每月匯生活費填月數。") +
      field("fxRate", '匯率 GBP→TWD <span class="tag assumption">假設</span>', "不是即時牌價，可以改。") +
      '</div><p class="fine">改完按 Tab 或點別處就會重算。每個工具套同一組輸入，照資料順序列出，不排名、不選最划算。</p></article>';
  }

  function figTag(fig) {
    return fig.value === null ? '<span class="tag pending">待確認</span>' : '<span class="tag sourced">有來源</span>';
  }

  function pctOrPending(fig) {
    return fig.value === null ? '<span class="tag pending">待確認</span>' : esc(fig.value) + "%";
  }

  function twdOrPending(n) {
    return n === null || n === undefined ? '<span class="tag pending">待確認</span>' : money(n);
  }

  function srcLine(fig) {
    var where = fig.sourceUrl ? link(fig.sourceUrl, "來源") + " · 查閱 " + esc(fig.checkedAt) : "尚無來源";
    return '<div class="src">' + esc(fig.note) + " " + where + "</div>";
  }

  function sourceList(urls, checkedAt) {
    return '<p class="src">來源（查閱 ' + esc(checkedAt) + "）：" + urls.map(function (url) { return link(url, url); }).join(" · ") + "</p>";
  }

  function rewardTag(value) {
    if (value === "適用") return '<span class="tag ok">適用</span>';
    if (value === "不適用") return '<span class="tag bad">不適用</span>';
    return '<span class="tag pending">待確認</span>';
  }

  function dDisclaimer() {
    return '<div class="banner">' + esc(P.DISCLAIMER) + esc(P.ESTIMATE_NOTE) + "不排名，也不推薦特定產品。</div>";
  }

  function renderDCards() {
    var input = dInput();
    var base = P.normaliseInput(input);
    var cards = P.cards();
    var rows = cards.map(function (card) {
      var est = P.estimateCard(card, input);
      return "<tr><td><b>" + esc(card.issuer) + "</b><br>" + esc(card.name) + '</td><td class="num">' + pctOrPending(card.networkFeePct) +
        '</td><td class="num">' + pctOrPending(card.bankFeePct) + '</td><td class="num">' + (est.feePct === null ? '<span class="tag pending">待確認</span>' : esc(est.feePct) + "%") +
        '<div class="src">' + esc(est.feeBasis) + '</div></td><td class="num">' + (base.ok ? twdOrPending(est.feeTwd) : "—") + "</td></tr>";
    }).join("");
    var details = cards.map(function (card) {
      return '<article class="card channel"><h3>' + esc(card.issuer) + "｜" + esc(card.name) + "</h3>" +
        "<p>發卡組織費 " + pctOrPending(card.networkFeePct) + " " + figTag(card.networkFeePct) + "</p>" + srcLine(card.networkFeePct) +
        "<p>銀行國外交易服務費 " + pctOrPending(card.bankFeePct) + " " + figTag(card.bankFeePct) + "</p>" + srcLine(card.bankFeePct) +
        "<p>官方合計費率 " + pctOrPending(card.totalFeePct) + "</p>" + srcLine(card.totalFeePct) +
        "<p>海外回饋 " + pctOrPending(card.rewardPct) + "（" + esc(card.rewardKind) + "）</p>" + srcLine(card.rewardPct) +
        "<p>英國實體店消費回饋：" + rewardTag(card.ukInStoreReward) + esc(card.ukInStoreRewardNote) + "</p>" +
        "<p>繳英國學費回饋：" + rewardTag(card.tuitionReward) + esc(card.tuitionRewardNote) + "</p>" +
        '<p class="src">' + esc(card.note) + "</p>" + sourceList(card.sourceUrls, card.networkFeePct.checkedAt) + "</article>";
    }).join("");
    return dCalcForm() + (base.ok ? "" : '<div class="banner bad">' + esc(base.error) + "</div>") +
      '<article class="card"><h3>海外刷卡手續費試算</h3><p class="fine">刷卡金額換算 ' + (base.ok ? money(base.totalTwd) : "—") +
      "（" + esc(dState.amountGbp) + " GBP × " + esc(dState.count) + " 筆 × 匯率 " + esc(dState.fxRate) + "）。手續費＝發卡組織費＋銀行費。回饋另列，不拿來抵手續費。</p>" +
      '<div class="g-scroll"><table><thead><tr><th>卡片</th><th class="num">發卡組織費</th><th class="num">銀行費</th><th class="num">試算費率</th><th class="num">估計手續費</th></tr></thead><tbody>' +
      rows + '</tbody></table></div><p class="fine">發卡組織的結匯匯率不是即時牌價，匯差不在表內。學校收不收信用卡、單筆上限多少，請看「匯款／支付」分頁，並先向發卡行確認額度。</p></article>' +
      '<h3 class="d-sub">各卡費率、回饋與來源</h3><div class="grid-2">' + details + "</div>";
  }

  function handlingText(account) {
    var h = account.handling;
    if (h.type === "flat") return (h.amountTwd.value === null ? "待確認" : money(h.amountTwd.value) + "／筆");
    if (h.type === "pct") {
      if (h.pct.value === null) return "待確認";
      return h.pct.value + "%，最低 " + (h.minTwd.value === null ? "待確認" : money(h.minTwd.value)) + "，最高 " + (h.maxTwd.value === null ? "待確認" : money(h.maxTwd.value));
    }
    return h.tiers.map(function (tier) {
      return (tier.upToTwd === null ? "以上" : "≤" + money(tier.upToTwd)) + " " + (tier.feeTwd.value === null ? "待確認" : money(tier.feeTwd.value));
    }).join("；");
  }

  function handlingFigures(account) {
    var h = account.handling;
    if (h.type === "flat") return [h.amountTwd];
    if (h.type === "pct") return [h.pct, h.minTwd, h.maxTwd];
    return h.tiers.map(function (tier) { return tier.feeTwd; });
  }

  function renderDFx() {
    var input = dInput();
    var base = P.normaliseInput(input);
    var accounts = P.fxAccounts();
    var rows = accounts.map(function (account) {
      var est = P.estimateFxAccount(account, input);
      var pending = est.pending.length ? '<div class="src">待確認：' + esc(est.pending.join("、")) + "</div>" : "";
      var subtotal = est.feeTwd === null && est.knownSubtotalTwd !== null ? '<div class="src">已知小計 ' + money(est.knownSubtotalTwd) + "，不是總費用</div>" : "";
      return "<tr><td><b>" + esc(account.provider) + "</b><br>" + esc(account.channel) + '</td><td class="num">' + (base.ok ? twdOrPending(est.handlingFeeTwd) : "—") +
        '</td><td class="num">' + (base.ok ? twdOrPending(est.cableFeeTwd) : "—") + '</td><td class="num"><span class="tag pending">待確認</span></td><td class="num">' +
        (base.ok ? twdOrPending(est.feeTwd) : "—") + subtotal + pending + "</td></tr>";
    }).join("");
    var details = accounts.map(function (account) {
      var notes = handlingFigures(account).concat([account.cableFeeTwd, account.fullAmountExtraTwd, account.fxSpreadPct]).map(srcLine).join("");
      return '<article class="card channel"><h3>' + esc(account.provider) + "｜" + esc(account.name) + "</h3>" +
        '<p class="fine">' + esc(account.type) + " · " + esc(account.channel) + " · 可否從新臺幣使用：" + esc(account.availableFromTwd) + "</p>" +
        "<p>手續費：" + esc(handlingText(account)) + "</p>" +
        "<p>郵電費／匯出費：" + (account.cableFeeTwd.value === null ? '<span class="tag pending">待確認</span>' : money(account.cableFeeTwd.value) + "／筆") + "</p>" +
        "<p>全額到行加收：" + (account.fullAmountExtraTwd.value === null ? '<span class="tag pending">待確認</span>' : money(account.fullAmountExtraTwd.value) + "／筆") +
        (account.fullAmountCableFeeTwd ? "（全額到行郵電費 " + money(account.fullAmountCableFeeTwd.value) + "／筆）" : "") + "</p>" +
        '<p>換匯點差：<span class="tag pending">待確認</span></p>' + notes +
        '<p class="src">' + esc(account.note) + "</p>" + sourceList(account.sourceUrls, account.cableFeeTwd.checkedAt) + "</article>";
    }).join("");
    return dCalcForm() + (base.ok ? "" : '<div class="banner bad">' + esc(base.error) + "</div>") +
      '<article class="card"><h3>外幣匯出費用試算</h3><p class="fine">每筆換算 ' + (base.ok ? money(base.perTransferTwd) : "—") + "，共 " + esc(dState.count) +
      " 筆。估計費用＝（手續費＋郵電費）× 筆數，不含匯差、不含中間行與收款行內扣。缺任何一項就顯示待確認，不當成 0。</p>" +
      '<div class="g-scroll"><table><thead><tr><th>帳戶／通路</th><th class="num">手續費</th><th class="num">郵電費</th><th class="num">換匯點差</th><th class="num">估計費用（不含匯差）</th></tr></thead><tbody>' +
      rows + '</tbody></table></div><p class="fine">這是把英鎊從台灣匯出去的銀行端費用。兩校都不收學生直接匯到學校帳戶（見「匯款／支付」分頁），所以這張表主要用在匯生活費到自己的英國帳戶。</p></article>' +
      '<h3 class="d-sub">各帳戶費用與來源</h3><div class="grid-2">' + details + "</div>";
  }

  function renderDInsurance() {
    var summary = P.insurance();
    var names = {};
    summary.lines.forEach(function (line) { names[line.id] = line.name; });
    var rows = summary.lines.map(function (line) {
      var amount = line.amount.value === null ? '<span class="tag pending">' + (line.id === "commercial" ? "不列報價" : "待確認") + "</span>"
        : "£" + esc(line.amount.value) + "／年";
      var overlap = line.mayOverlapWith.map(function (id) { return esc(names[id]); }).join("、");
      return "<tr><td><b>" + esc(line.name) + '</b><br><span class="tag">' + esc(line.category) + "</span></td><td>" + esc(line.mandatory) + "</td><td>" + esc(line.collectedBy) +
        "</td><td>" + amount + srcLine(line.amount) + "</td><td>" + line.covers.map(esc).join("；") + "</td><td>" + overlap + '<div class="src">' + esc(line.overlapNote) + "</div></td></tr>";
    }).join("");
    return '<div class="banner">' + esc(summary.disclaimer) + "</div>" +
      '<div class="banner bad">不要把這三條線加成一個「保險費」。' + esc(summary.totalNote) + "</div>" +
      '<article class="card"><h3>三條線對照</h3><div class="g-scroll"><table><thead><tr><th>類型</th><th>是否強制</th><th>誰收</th><th>金額</th><th>涵蓋</th><th>可能重複</th></tr></thead><tbody>' +
      rows + '</tbody></table></div><p class="fine">合計：不加總。這一頁沒有「保險總額」，也不會把任何一條帶進 C 的總成本；IHS 由 C 自己依簽證長度計算。</p></article>';
  }

  function renderDProducts() {
    var body = dState.tab === "cards" ? renderDCards() : dState.tab === "fx" ? renderDFx() : renderDInsurance();
    var titles = { cards: "信用卡海外刷卡", fx: "外幣帳戶與多幣別帳戶", insurance: "保險類型對照" };
    $("page-d").innerHTML =
      '<div class="kicker">模組 D · 方澤享 · 金融工具比較</div>' +
      "<h2>" + titles[dState.tab] + "</h2>" + dTabs() + (dState.tab === "insurance" ? "" : dDisclaimer()) + body;
  }

  function renderD(model) {
    if (dState.tab !== "pay") {
      renderDProducts();
      return;
    }
    if (!model.ok) {
      $("page-d").innerHTML = dTabs() + '<div class="banner bad">' + esc(model.error) + "</div>";
      return;
    }
    var ref = model.tuitionPay.reference_only[0];
    $("page-d").innerHTML =
      '<div class="kicker">模組 D · 方澤享 · 先看收不收，再看有沒有報價</div>' + dTabs() +
      "<h2>訂金和學費分開付</h2>" +
      '<p class="lede">比較用的是 C 算出的待付金額，不是把訂金再加進學費。沒有來源的手續費維持 null，這頁不選出最便宜的管道。</p>' +
      '<div class="banner">' + esc(model.tuitionPay.message) + "。最低成本：沒有。</div>" +
      '<div class="grid-2"><section><h3>訂金管道</h3><p class="fine">這次待付 ' +
      (model.depositDue.amount === null ? "尚未確認" : money(model.depositDue.amount, "GBP")) + "。 " + esc(model.depositDue.note || "") + "</p>" +
      model.depositPay.channels.map(channelCard).join("") + "</section><section><h3>學費餘額管道</h3><p class=\"fine\">這次待付 " +
      (model.tuitionDue.amount === null ? "尚未確認" : money(model.tuitionDue.amount, "GBP")) + "。 " + esc(model.tuitionDue.note || "") + "</p>" +
      model.tuitionPay.channels.map(channelCard).join("") + "</section></div>" +
      '<article class="card" style="margin-top:8px"><h3>參考，不參與排名</h3><p><b>' + esc(ref.name) + "</b> <span class=\"tag pending\">" + esc(ref.applicability) + "</span></p>" +
      "<p>匯費 0.05%，最低 " + money(ref.min_fee) + "，最高 " + money(ref.max_fee) + "，電報 " + money(ref.fixed_fee) + "／通。每日額度低於 " + money(ref.daily_limit_twd) + "（不含本數）。新受款資料「" + esc(ref.payee_setup_lead) + "」生效，原文沒有定義是不是營業日。</p>" +
      '<p class="src">' + esc(ref.note) + "</p><p class=\"src\">" + link(ref.source_urls[0], "收費標準") + " · " + link(ref.source_urls[1], "個人網銀約定") + "</p></article>";
  }

  function renderE(model) {
    var rows = Constants.catalog.map(function (entry) {
      var kind = entry.kind === "sourced" ? '<span class="tag sourced">有來源</span>' : entry.kind === "assumption" ? '<span class="tag assumption">假設</span>' : '<span class="tag pending">待確認</span>';
      var amount = catalogValue(entry);
      var url = entry.url ? link(entry.url, "開啟來源") : "—";
      return "<tr><td>" + esc(entry.label) + "<br>" + kind + '<div class="src">' + esc(entry.note || "") + "</div></td><td class=\"num\">" + amount + "</td><td>" + url + "</td></tr>";
    }).join("");
    var rejected = Constants.rejected.map(function (item) {
      return "<li>" + esc(item.currency) + " " + esc(item.amount) + "：" + esc(item.reason) + "</li>";
    }).join("");
    var verdict = model.ok ? model.review : { verdict: "退修", formal_demo: "尚未放行", note: model.error, pending: [], blockers: [] };
    var pending = model.ok ? model.review.pending.map(esc).join("、") : "";
    $("page-e").innerHTML =
      '<div class="kicker">模組 E · 何則文 · 來源、待確認、放行檢查</div>' +
      "<h2>學生畫面只留下查得到的數字</h2>" +
      '<div class="' + verdictClass(verdict.verdict) + '">這份試算：' + esc(verdict.verdict) + "。正式 Demo：" + esc(verdict.formal_demo) + "。" + esc(verdict.note || "") + "</div>" +
      (pending ? '<p class="muted">待確認的費用代號：' + pending + "。這些存在時，不能把已知小計說成完整總額。</p>" : "") +
      '<article class="card"><h3>這次試算用到的常數</h3><table><thead><tr><th>項目</th><th class="num">值</th><th>來源</th></tr></thead><tbody>' + rows + "</tbody></table></article>" +
      '<div class="grid-2" style="margin-top:16px"><article class="card"><h3>明確不用的數字</h3><ul class="list">' + rejected + "</ul></article>" +
      '<article class="card"><h3>這輪先不做</h3><ul class="list"><li>IHS 校方預算表和 GOV.UK 差多少，不再往下追；收費以 GOV.UK 為準。</li><li>圖書館罰款、退款基數、Flywire 狀態日期，都不做自動判定。</li><li>簽證滿兩年以後的 IHS 算法還沒核完，金額維持 null。</li><li>協調頁還沒有 D-20261112-d33g 的組員確認欄。範圍先照該次拍板，狀態仍是待確認。</li></ul></article></div>';
  }

  function render() {
    var model = currentCase();
    renderA(model);
    renderB();
    renderC(model);
    renderD(model);
    renderE(model);
  }

  $("calc-form").addEventListener("submit", function (event) { event.preventDefault(); });

  // D 頁的試算欄位是動態畫的，用委派事件。change 才重畫，打字中不搶焦點。
  document.addEventListener("input", function (event) {
    var target = event.target;
    var field = target && target.getAttribute ? target.getAttribute("data-d-field") : null;
    if (field && Object.prototype.hasOwnProperty.call(dState, field)) dState[field] = target.value;
  });
  document.addEventListener("change", function (event) {
    var target = event.target;
    var field = target && target.getAttribute ? target.getAttribute("data-d-field") : null;
    if (!field || !Object.prototype.hasOwnProperty.call(dState, field)) return;
    dState[field] = target.value;
    renderD(currentCase());
  });

  document.addEventListener("click", function (event) {
    var tabBtn = event.target.closest("[data-d-tab]");
    if (tabBtn) {
      var tab = tabBtn.getAttribute("data-d-tab");
      if (D_TABS.some(function (item) { return item.id === tab; })) dState.tab = tab;
      // 從引導流程的提示過來時，同一顆按鈕也帶 data-page，下面會切頁並重畫。
      if (!tabBtn.getAttribute("data-page")) {
        renderD(currentCase());
        return;
      }
    }
    var pageBtn = event.target.closest("[data-page]");
    if (pageBtn && pageBtn.getAttribute("data-page")) {
      showPage(pageBtn.getAttribute("data-page"));
      return;
    }
    var actionBtn = event.target.closest("[data-action]");
    if (!actionBtn) return;
    var action = actionBtn.getAttribute("data-action");
    if (action === "select-programme") {
      $("preset").value = actionBtn.getAttribute("data-key");
      applyOfficialNumbers();
      render();
    }
    if (action === "use-55k") $("twd").value = "55000";
    if (action === "use-60k") $("twd").value = "60000";
    if (action === "use-55k" || action === "use-60k") render();
  });

  ["preset", "tuition", "deposit", "course-months", "deposit-paid", "living-m", "living-months", "other-gbp", "twd", "ins-flag", "ins-amt", "ins-evidence", "fx", "reserve", "fx-shock", "awarded", "savings", "family", "scholarship", "income", "rate", "term", "grace"].forEach(function (id) {
    var el = $(id);
    el.addEventListener("input", render);
    el.addEventListener("change", function () {
      if (id === "preset") applyOfficialNumbers();
      render();
    });
  });

  window.addEventListener("hashchange", function () {
    showPage((location.hash || "#g").slice(1));
  });

  applyOfficialNumbers();
  showPage((location.hash || "#g").replace("#", "") || "g");
})();
