(function () {
  "use strict";
  var A = window.AModule;
  var B = window.BModule;
  var pages = ["a", "b", "c", "d", "e"];
  var sessionLog = [];
  var lastKey = "";

  function $(id) { return document.getElementById(id); }

  function esc(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function link(url, label) {
    if (!url) return esc(label || "沒有網址");
    return '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(label || url) + "</a>";
  }

  function formatNumber(value, digits) {
    return Number(value).toLocaleString("zh-Hant", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  }

  function moneyTwd(value) {
    if (value === null || value === undefined) return "尚未確定";
    var rounded = Math.round(value * 100) / 100;
    var digits = Math.abs(rounded - Math.round(rounded)) > 0.001 ? 2 : 0;
    return "NT$" + formatNumber(rounded, digits);
  }

  function moneyGbp(value) {
    if (value === null || value === undefined) return "尚未確定";
    return "£" + Number(value).toLocaleString("en-GB");
  }

  function fieldNumber(id) {
    var raw = $(id).value;
    if (raw === "") return null;
    var number = Number(raw);
    return Number.isFinite(number) ? number : null;
  }

  function inclusionLabel(value) {
    return { included: "已含", extra: "另計", pending: "待確認", none: "無此費用" }[value] || value || "";
  }

  function showPage(name) {
    pages.forEach(function (page) {
      $("page-" + page).classList.toggle("hidden", page !== name);
    });
    document.querySelectorAll(".nav-btn").forEach(function (button) {
      button.setAttribute("aria-current", button.getAttribute("data-page") === name ? "page" : "false");
    });
    if (window.history && window.history.replaceState && location.hash !== "#" + name) {
      window.history.replaceState(null, "", "#" + name);
    }
    window.scrollTo(0, 0);
  }

  function readInput() {
    var deposit = $("deposit-status").value;
    return {
      programmeId: $("programme").value,
      depositPaid: deposit === "paid" ? true : deposit === "unpaid" ? false : null,
      awardedScholarshipIds: $("award-gls").checked ? ["uog-gls-2027"] : [],
      hasUkAccount: $("uk-account").checked,
      courseLengthMonths: fieldNumber("course-months"),
      livingMonthlyGbp: fieldNumber("living-m"),
      livingMonths: fieldNumber("living-months"),
      twdExpenses: fieldNumber("twd"),
      fxRate: fieldNumber("fx"),
      reserveRate: fieldNumber("reserve"),
      savings: fieldNumber("savings"),
      family: fieldNumber("family"),
      confirmedScholarshipTwd: fieldNumber("scholarship-cash"),
      incomeMonthly: fieldNumber("income"),
      loan: {
        annualRate: fieldNumber("rate"),
        termMonths: fieldNumber("term"),
        graceMonths: fieldNumber("grace"),
      },
    };
  }

  function compute() {
    var input = readInput();
    return { input: input, plan: A.buildStudentPlan(input) };
  }

  function feeRows(lines) {
    return (lines || []).map(function (line) {
      var tags = "";
      if (line.assumption) tags += '<span class="tag assumption">假設</span>';
      else if (line.sourceUrl && !line.blocked) tags += '<span class="tag sourced">有來源</span>';
      var inclusion = inclusionLabel(line.inclusion);
      if (inclusion === "待確認" || line.blocked) tags += '<span class="tag pending">待確認</span>';
      if (inclusion === "已含") tags += '<span class="tag included">已含</span>';
      if (inclusion === "無此費用") tags += '<span class="tag included">無此費用</span>';
      var amount = line.amount === null || line.amount === undefined
        ? "尚未確定"
        : (line.currency === "GBP" ? moneyGbp(line.amount) : moneyTwd(line.amount));
      var contribute = line.contributeTwd === null || line.contributeTwd === undefined ? "不計入" : moneyTwd(line.contributeTwd);
      var source = line.sourceUrl ? '<div class="src">' + link(line.sourceUrl, line.source || line.sourceUrl) + "</div>" : "";
      var note = line.blockReason || line.note || "";
      return "<tr" + (line.blocked ? ' class="blocked"' : "") + "><td>" + esc(line.name) + "<br>" + tags + source +
        (note ? '<div class="src">' + esc(note) + "</div>" : "") +
        "</td><td class=\"num\">" + amount + "</td><td class=\"num\">" + contribute + "</td></tr>";
    }).join("");
  }

  function feeTable(lines) {
    return '<table><thead><tr><th>項目</th><th>金額</th><th>計入已知成本</th></tr></thead><tbody>' + feeRows(lines) + "</tbody></table>";
  }

  function kpis(plan) {
    var claim = plan.review.student_claim;
    var cards = [];
    cards.push('<div class="kpi"><span>已知小計（含預備金，不是確定總額）</span><strong>' + moneyTwd(plan.calc.knownSubtotal) + "</strong></div>");
    cards.push('<div class="kpi alt"><span>確定總額</span><strong>' + (claim.may_show_final_total ? moneyTwd(claim.final_total_twd) : "尚未確定") + "</strong></div>");
    cards.push('<div class="kpi alt"><span>確定缺口</span><strong>' + (claim.may_show_gap ? moneyTwd(claim.confirmed_gap_twd) : "尚未確定") + "</strong></div>");
    if (claim.may_show_gap && plan.calc.loanAmount !== null) {
      cards.push('<div class="kpi"><span>建議貸款（上取整萬，假設）</span><strong>' + moneyTwd(plan.calc.loanAmount) + "</strong></div>");
    } else if (plan.calc.reference) {
      cards.push('<div class="kpi warn"><span>暫估總額（非正式）</span><strong>' + moneyTwd(plan.calc.reference.total) + "</strong></div>");
    }
    return cards.join("");
  }

  function bannerClass(review) {
    if (review.status === "退修") return "banner bad";
    if (review.status === "PASS") return "banner ok";
    return "banner";
  }

  function bannerText(plan) {
    var review = plan.review;
    var head = "資料檢查：" + review.status + "。正式放行：" + review.release + "。";
    if (review.blockers.length) return head + review.blockers[0];
    return head + review.release_reason;
  }

  function renderA(plan) {
    var programme = plan.programme;
    $("a-title").textContent = programme.school_zh + " · " + programme.program_zh;
    $("a-banner").className = bannerClass(plan.review);
    $("a-banner").textContent = bannerText(plan);
    $("a-kpis").innerHTML = kpis(plan);
    var deposit = plan.calc.deposit;
    var depositText = "訂金狀態未知，待付餘額不猜測。";
    if (deposit && deposit.paid === true) depositText = "訂金已付。待付學費 " + moneyGbp(deposit.balanceDue) + "。總學費沒有因為已付而變少。";
    if (deposit && deposit.paid === false) depositText = "訂金未付。待付學費仍是 " + moneyGbp(deposit.balanceDue) + "，訂金沒有另外再加一次。";
    var loanText = "";
    if (plan.review.student_claim.may_show_gap && plan.calc.monthlyPayment !== null) {
      loanText = "<p class=\"muted\">假設年利率 " + (plan.calc.annualRate * 100).toFixed(2) + "%、" + plan.calc.termMonths +
        " 期，估月付 " + moneyTwd(plan.calc.monthlyPayment) +
        (plan.calc.burdenPercent === null ? "" : "，負擔比 " + plan.calc.burdenPercent + "%") + "。不保證核貸。</p>";
    } else if (plan.calc.reference && plan.calc.reference.gap !== null) {
      loanText = "<p class=\"muted\">若只拿已知名目暫估，缺口約 " + moneyTwd(plan.calc.reference.gap) +
        "，貸款約 " + moneyTwd(plan.calc.reference.loan) + "。這不是確定值。</p>";
    }
    $("a-fees").innerHTML = "<p>" + esc(programme.program_name) + " · 入學 " + esc(programme.intake) + " · " + esc(programme.city) + "</p>" +
      "<p class=\"muted\">" + depositText + "</p>" + feeTable(plan.review.screened_lines) + loanText;
    var open = [];
    plan.review.blockers.forEach(function (item) { open.push("<li>" + esc(item) + "</li>"); });
    (programme.funding_notes || []).forEach(function (item) {
      open.push("<li><span class=\"tag pending\">" + esc(item.status) + "</span> " + esc(item.text) +
        (item.source && item.source.url ? "<div class=\"src\">" + link(item.source.url, item.source.label) + "</div>" : "") + "</li>");
    });
    open.push("<li>" + esc(plan.review.release_reason) + "</li>");
    $("a-open").innerHTML = "<ul class=\"list\">" + open.join("") + "</ul>";
    if (!sessionLog.length) {
      $("a-history").innerHTML = "<p class=\"muted\">改一個假設之後，這裡會留下前一版。</p>";
    } else {
      $("a-history").innerHTML = "<table><thead><tr><th>版</th><th>學程</th><th>已知小計</th><th>確定總額</th></tr></thead><tbody>" +
        sessionLog.map(function (row, index) {
          return "<tr><td>" + (index + 1) + "</td><td>" + esc(row.school) + "</td><td class=\"num\">" + moneyTwd(row.known) +
            "</td><td class=\"num\">" + (row.final === null ? "尚未確定" : moneyTwd(row.final)) + "</td></tr>";
        }).join("") + "</tbody></table>";
    }
  }

  function renderB(plan) {
    var selected = plan.programme.id;
    $("b-cards").innerHTML = B.listProgrammes().map(function (programme) {
      var on = programme.id === selected;
      return '<button type="button" class="card program' + (on ? " selected" : "") + '" data-programme="' + esc(programme.id) + '">' +
        '<span class="tag sourced">有來源</span>' + (on ? '<span class="tag sourced">目前選定</span>' : "") +
        "<b>" + esc(programme.school_zh) + " · " + esc(programme.program_zh) + "</b>" +
        "<div>" + esc(programme.award_year) + " 學費 " + moneyGbp(programme.tuition.amount) + " · 訂金 " + moneyGbp(programme.deposit.amount) + "（已含在學費）</div>" +
        '<p class="src">學費：' + link(programme.tuition.source.url, programme.tuition.source.label) + "</p>" +
        '<p class="src">訂金：' + link(programme.deposit.source.url, programme.deposit.source.label) + "</p>" +
        '<p class="fine">校保：<span class="tag pending">待確認</span> 沒有金額。</p></button>';
    }).join("");
    document.querySelectorAll("[data-programme]").forEach(function (button) {
      button.addEventListener("click", function () {
        $("programme").value = button.getAttribute("data-programme");
        applyProgramme();
      });
    });
    var scholarship = plan.scholarship;
    var lines = (scholarship.candidates || []).map(function (item) {
      return "<li><b>" + esc(item.name_zh || item.name) + "</b> " + moneyGbp(item.amount_gbp) +
        " · " + (item.status === "已核定" ? '<span class="tag sourced">已核定，已反映在淨學費</span>' : '<span class="tag pending">未核定，不計入</span>') +
        "<div class=\"src\">" + esc(item.funding_type === "school_discount" ? "校方減免，不是現金撥款。" : "不是校方減免。") +
        " " + esc(item.stack_note || "") + "</div>" +
        '<div class="src">' + link(item.source.url, item.source.label) + "</div></li>";
    }).join("");
    if (!lines) {
      lines = "<li><span class=\"tag pending\">待確認</span> 愛丁堡這輪沒有已核對的獎學金金額，所以不填 0，也不假設你已經拿到。</li>";
    }
    $("b-scholarship").innerHTML = "<h3>獎學金</h3><p class=\"muted\">公告學費 " + moneyGbp(scholarship.gross_tuition_gbp) +
      "。這次試算用的淨學費 " + moneyGbp(scholarship.net_tuition_gbp) + "。現金獎學金欄是 " +
      (plan.calc.funds.scholarship === null ? "尚未填" : moneyTwd(plan.calc.funds.scholarship)) + "。</p><ul class=\"list\">" + lines + "</ul>";
    $("b-notes").innerHTML = "<h3>不要做成自動決定的事</h3><ul class=\"list\"><li>訂金退費、延期、CAS 期限：格拉斯哥公開退費文字目前見到 2026/27，2027/28 是否沿用待確認。</li>" +
      "<li>" + esc(plan.programme.course_length_note) + "</li>" +
      "<li>舊稱 Data Science 不覆蓋現在的 Data Science &amp; Artificial Intelligence 快照。</li></ul>";
  }

  function renderC(plan) {
    var programme = plan.programme;
    var ihs = plan.calc.lines.filter(function (line) { return line.id.indexOf(":ihs") > 0; })[0];
    var visa = plan.calc.lines.filter(function (line) { return line.id.indexOf(":visa-fee") > 0; })[0];
    var tuitionShown = plan.scholarship.applied
      ? "公告 " + moneyGbp(programme.tuition.amount) + "，核定後淨額 " + moneyGbp(plan.scholarship.net_tuition_gbp)
      : moneyGbp(programme.tuition.amount);
    $("c-official").innerHTML =
      "<p><b>學費</b> " + tuitionShown + " <span class=\"tag sourced\">有來源</span><br><span class=\"src\">" +
      link(programme.tuition.source.url, programme.tuition.source.label) + " · " + esc(programme.tuition.source.note) + "</span></p>" +
      "<p><b>訂金</b> " + moneyGbp(programme.deposit.amount) + " <span class=\"tag included\">已含在學費</span><br><span class=\"src\">" +
      link(programme.deposit.source.url, programme.deposit.source.label) + "</span></p>" +
      "<p><b>校保</b> <span class=\"tag pending\">待確認</span> 金額空白<br><span class=\"src\">" +
      link(programme.insurance.source.url, programme.insurance.source.label) + "</span></p>";
    $("c-length-src").innerHTML = (programme.course_length_assumption || fieldNumber("course-months") !== programme.course_length_months
      ? '<span class="tag assumption">假設</span> '
      : '<span class="tag sourced">有來源</span> ') + esc(programme.course_length_note) +
      ' 簽證長度見 <a href="https://www.gov.uk/guidance/immigration-rules/immigration-rules-appendix-student" target="_blank" rel="noopener">ST 25.3</a>。';
    $("ihs-readout").innerHTML = (ihs && ihs.amount !== null ? moneyGbp(ihs.amount) : "尚未確定") +
      (ihs && ihs.assumption ? ' <span class="tag assumption">假設</span>' : ' <span class="tag sourced">有來源</span>') +
      '<div class="src">' + (ihs ? link(ihs.sourceUrl, "GOV.UK IHS") : "") +
      (visa ? " · 簽證費 " + moneyGbp(visa.amount) + " " + link(visa.sourceUrl, "GOV.UK Student visa") : "") + "</div>";
    $("c-banner").className = bannerClass(plan.review);
    $("c-banner").textContent = bannerText(plan);
    $("c-kpis").innerHTML = kpis(plan);
    $("c-fees").innerHTML = feeTable(plan.review.screened_lines);
    $("c-json").textContent = JSON.stringify(plan.scenario, null, 2);
  }

  function channelCard(item) {
    var cls = item.school_acceptance === "不接受" ? "reject" : item.school_acceptance === "核准" ? "ok" : "wait";
    var tag = item.school_acceptance === "不接受" ? "reject" : item.school_acceptance === "核准" ? "sourced" : "pending";
    return '<article class="channel ' + cls + '"><span class="tag ' + tag + '">' + esc(item.school_acceptance) + "</span>" +
      "<b>" + esc(item.name) + "</b>" +
      "<div class=\"fine\">報價：" + esc(item.quote_status) + " · 固定費、比例費、匯率加碼都是空白</div>" +
      (item.prerequisites.length ? "<div class=\"fine\">前提：" + esc(item.prerequisites.join("；")) + "</div>" : "") +
      "<p class=\"src\">" + esc(item.note) + "</p>" +
      '<p class="src">' + link(item.source.url, item.source.label) + " · 查閱 " + esc(item.source.retrieved) + "</p></article>";
  }

  function renderD(plan) {
    var pay = plan.payments;
    $("d-banner").className = "banner";
    $("d-banner").textContent = pay.summary + "。沒有最低成本冠軍。";
    var amount = pay.compared_amount;
    $("d-amount").innerHTML = "<p><b>拿來比較的學費餘額：</b> " + moneyGbp(amount.balance_due) + "</p>" +
      "<p><b>這次的訂金應付：</b> " + moneyGbp(amount.deposit_due) + "</p>" +
      "<p class=\"muted\">" + pay.warnings.map(esc).join(" ") + " " + esc(pay.insurance_check.note) + "</p>";
    $("d-channels").innerHTML =
      "<div><h3>訂金管道</h3>" + pay.channels.deposit.map(channelCard).join("") + "</div>" +
      "<div><h3>學費管道</h3>" + pay.channels.tuition.map(channelCard).join("") + "</div>";
    $("d-reference").innerHTML = "<h3>參考費率，不參加排名</h3>" + pay.reference_tariffs.map(function (tariff) {
      return "<p><b>" + esc(tariff.name) + "</b> <span class=\"tag pending\">不排名</span><br>" +
        esc(tariff.pct_display) + "，最低 " + moneyTwd(tariff.min_fee_twd) + "，最高 " + moneyTwd(tariff.max_fee_twd) +
        "，電報 " + moneyTwd(tariff.cable_fee_twd) + "<br>" + esc(tariff.daily_limit_display) + "。 " + esc(tariff.payee_setup) + "。</p>" +
        "<p class=\"src\">" + esc(tariff.note) + "</p>" +
        '<p class="src">' + link(tariff.source.url, tariff.source.label) + " · " + link(tariff.agreement.url, tariff.agreement.label) + "</p>";
    }).join("");
  }

  function renderE(plan) {
    $("e-banner").className = bannerClass(plan.review);
    $("e-banner").textContent = bannerText(plan);
    var findings = plan.review.blockers.map(function (item) { return "<li>" + esc(item) + "</li>"; }).join("");
    $("e-findings").innerHTML = "<ul class=\"list\">" + (findings || "<li>這次沒有擋下的資料問題。</li>") + "</ul>" +
      "<p class=\"muted\">" + esc(plan.review.release_reason) + "</p>";
    $("e-constants").innerHTML = "<table><thead><tr><th>項目</th><th class=\"nowrap\">狀態</th><th class=\"nowrap\">值</th><th>來源</th></tr></thead><tbody>" +
      plan.review.constants.map(function (constant) {
        var shown = constant.display || "空白";
        if (constant.value !== null && constant.value !== undefined) {
          if (constant.unit === "GBP" || constant.unit === "GBP／年") shown = moneyGbp(constant.value);
          else if (constant.unit === "TWD") shown = moneyTwd(constant.value);
          else if (constant.unit === "%") shown = constant.value + "%";
          else if (constant.unit === "比例" || constant.unit === "年利率") shown = (constant.value * 100) + "%";
          else shown = String(constant.value) + (constant.unit ? " " + constant.unit : "");
        }
        var rowClass = constant.status === "不採用" ? "rejected" : "";
        return "<tr class=\"" + rowClass + "\"><td>" + esc(constant.label) +
          (constant.note ? '<div class="src">' + esc(constant.note) + "</div>" : "") +
          "</td><td class=\"nowrap\">" + esc(constant.status) + "</td><td class=\"num\">" + esc(shown) + "</td><td>" +
          link(constant.url, "來源") + '<div class="src">' + esc(constant.record) + " · " + esc(constant.retrieved) + "</div></td></tr>";
      }).join("") + "</tbody></table>";
  }

  function remember(plan) {
    var key = plan.publication.signature;
    if (key === lastKey) return;
    lastKey = key;
    sessionLog.push({
      school: plan.programme.school_zh,
      known: plan.calc.knownSubtotal,
      final: plan.review.student_claim.may_show_final_total ? plan.review.student_claim.final_total_twd : null,
    });
    if (sessionLog.length > 6) sessionLog.shift();
  }

  function render(record) {
    var bundle = compute();
    if (!bundle.plan.ok) {
      ["a-banner", "c-banner", "d-banner", "e-banner"].forEach(function (id) {
        $(id).className = "banner bad";
        $(id).textContent = bundle.plan.error;
      });
      return;
    }
    if (record) remember(bundle.plan);
    renderA(bundle.plan);
    renderB(bundle.plan);
    renderC(bundle.plan);
    renderD(bundle.plan);
    renderE(bundle.plan);
  }

  function applyProgramme() {
    var programme = B.getProgramme($("programme").value);
    $("course-months").value = programme.course_length_months;
    if (programme.id !== "uog-dsai-2027") {
      $("award-gls").checked = false;
      $("award-gls").disabled = true;
    } else {
      $("award-gls").disabled = false;
    }
    render(true);
  }

  document.querySelectorAll(".nav-btn").forEach(function (button) {
    button.addEventListener("click", function () { showPage(button.getAttribute("data-page")); });
  });
  ["programme", "deposit-status", "award-gls", "uk-account", "course-months", "living-m", "living-months", "twd", "fx", "reserve", "savings", "family", "scholarship-cash", "income", "rate", "term", "grace"].forEach(function (id) {
    $(id).addEventListener("input", function () {
      if (id !== "programme") render(false);
    });
    $(id).addEventListener("change", function () {
      if (id === "programme") applyProgramme();
      else render(true);
    });
  });
  $("use-55").addEventListener("click", function () { $("twd").value = "55000"; render(true); });
  $("use-60").addEventListener("click", function () { $("twd").value = "60000"; render(true); });
  $("calc-form").addEventListener("submit", function (event) { event.preventDefault(); });

  var hash = (location.hash || "#a").replace("#", "");
  if (pages.indexOf(hash) === -1) hash = "a";
  applyProgramme();
  showPage(hash);
})();
