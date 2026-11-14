/**
 * D agent｜付款管道與金融工具比較。
 * 呼叫 DModule.outstanding／compare（學校收不收、有沒有報價）與 DProducts.compare（信用卡、外幣帳戶、保險類型）。
 * 沒有報價就不排名；缺費率的估計是 null，說明裡只寫待確認，不當成零。僅供比較，非金融建議。
 *
 * 金融工具試算的金額：C 有確定的學費待付餘額就用它；訂金付款狀態未知時，改用 B 的公告學費當對照金額，
 * 並在說明裡寫明。筆數固定用一筆（假設一次付清）。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./base.js"), require("../modules/d/payments.js"), require("../modules/d/products.js"));
  } else {
    root.FinanceAgent = factory(root.AgentBase, root.DModule, root.DProducts);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (Base, D, P) {
  "use strict";

  var twd = Base.twd;
  var gbp = Base.gbp;
  var PURPOSES = [{ id: "deposit", name: "訂金" }, { id: "tuition", name: "學費" }];

  function names(channels, test) {
    return channels.filter(test).map(function (ch) { return ch.name; });
  }

  function compute(ctx) {
    ctx = ctx || {};
    var plans = (ctx.c && ctx.c.plans) || {};
    var programmes = (ctx.b && ctx.b.programmes) || {};
    var selected = (ctx.b && ctx.b.selected) || Object.keys(plans);
    var data = { payments: {}, products: {} };
    var pending = [];
    var sources = [];
    var seen = {};
    var text = [];

    function addSource(label, url) {
      if (!url || seen[url]) return;
      seen[url] = true;
      sources.push({ label: label, url: url, kind: "有來源" });
    }

    if (!selected.length) {
      text.push("還沒有選學程，沒有付款管道可以比較。");
      return { data: data, pending: [{ id: "selected", label: "還沒有選學程" }], sources: [], template: text.join("\n") };
    }

    var spreadPending = false;
    selected.forEach(function (key) {
      var programme = programmes[key];
      if (!programme) return;
      var school = programme.school_name_zh || key;
      var schoolId = programme.school_id;
      var scenario = plans[key] && plans[key].scenario;
      data.payments[key] = {};

      PURPOSES.forEach(function (purpose) {
        var due = D.outstanding(scenario, purpose.id);
        var cmp = D.compare({ school_id: schoolId, fee_purpose: purpose.id, amount_due: due.amount, currency: due.currency });
        data.payments[key][purpose.id] = { outstanding: due, compare: cmp };
        cmp.channels.forEach(function (ch) { addSource(school + " " + purpose.name + "管道：" + ch.name, ch.source_url); });

        var line;
        if (Base.isNum(due.amount)) {
          line = school + "｜" + purpose.name + "：待付 " + gbp(due.amount) + "。";
        } else {
          var dueGuard = school + "的" + purpose.name + "待付金額";
          pending.push({ id: key + "-" + purpose.id + "-due", label: school + "｜" + purpose.name + "待付金額（訂金付款狀態未知）", guard: dueGuard });
          line = dueGuard + "：待確認（訂金付款狀態未知，不假設已付或未付）。";
        }
        if (!cmp.ok || !cmp.channels.length) {
          line += "這所學校的" + purpose.name + "付款方式尚未收錄，不排名。";
          text.push(line);
          return;
        }
        var approved = names(cmp.channels, function (ch) { return ch.school_acceptance === "核准"; });
        var refused = names(cmp.channels, function (ch) { return ch.school_acceptance === "不接受"; });
        var unknown = names(cmp.channels, function (ch) { return ch.school_acceptance !== "核准" && ch.school_acceptance !== "不接受"; });
        if (approved.length) line += "校方核准的管道：" + approved.join("、") + "。";
        if (refused.length) line += "校方不接受：" + refused.join("、") + "。";
        if (unknown.length) line += "校方是否接受還不清楚：" + unknown.join("、") + "。";
        if (cmp.ranking) {
          line += cmp.message;
        } else {
          var feeGuard = school + purpose.name + "管道的實際費率";
          pending.push({ id: key + "-" + purpose.id + "-quote", label: school + "｜" + purpose.name + "管道對台灣付款人的實際費率（沒有報價）", guard: feeGuard });
          line += feeGuard + "：待確認，沒有報價就不排名，也不選最便宜。";
        }
        text.push(line);
      });

      // 金融工具同條件試算。金額與匯率都來自前面的模組，不另外編數字。
      var tuitionDue = data.payments[key].tuition.outstanding.amount;
      var announced = programme.tuition && programme.tuition.amount;
      var amount = Base.isNum(tuitionDue) ? tuitionDue : Base.isNum(announced) ? announced : null;
      var basis = Base.isNum(tuitionDue) ? "學費待付餘額" : "公告學費（待付餘額未知，只當對照金額）";
      var fxRate = scenario && Base.isNum(scenario.fx_rate) ? scenario.fx_rate : null;
      var compared = P.compare({ amountGbp: amount, fxRate: fxRate, count: 1 });
      data.products[key] = { amount_basis: basis, compare: compared };
      if (!compared.input.ok) {
        pending.push({ id: key + "-products", label: school + "｜金融工具試算（缺金額或匯率）" });
        text.push(school + "的金融工具試算沒有執行：缺金額或匯率，不補預設值。");
        return;
      }
      var cards = compared.cards.map(function (card) {
        if (Base.isNum(card.feeTwd)) return card.label + " " + Base.pct(card.feePct) + "、" + twd(card.feeTwd);
        return card.label + " 待確認";
      });
      var accounts = compared.fxAccounts.map(function (account) {
        if (account.pending.indexOf("換匯點差") !== -1) spreadPending = true;
        if (Base.isNum(account.feeTwd)) return account.label + " " + twd(account.feeTwd);
        return account.label + " 待確認";
      });
      text.push(
        school + "金融工具對照（" + compared.disclaimer + compared.note + "）以" + basis + " " + gbp(amount) + " 一筆付清、匯率假設 " +
        Base.num(fxRate) + " 試算。信用卡國外交易手續費——" + cards.join("；") + "。外幣匯出的手續費加郵電費——" + accounts.join("；") + "。"
      );
    });

    if (spreadPending) {
      pending.push({ id: "fx-spread", label: "各家外幣帳戶的換匯點差（沒有公開成固定比例）", guard: "換匯點差" });
      text.push("換匯點差：待確認，各家都沒有公開成固定比例，所以上面的金額都不含匯差。");
    }
    var insurance = P.insurance();
    data.insurance = insurance;
    text.push("保險只做類型對照：" + insurance.totalNote + "不排名，也不推薦產品。");

    P.cards().forEach(function (card) { (card.sourceUrls || []).forEach(function (url) { addSource("信用卡：" + card.issuer + " " + card.name, url); }); });
    P.fxAccounts().forEach(function (account) { (account.sourceUrls || []).forEach(function (url) { addSource("外幣帳戶：" + account.provider + " " + account.name, url); }); });

    return { data: data, pending: pending, sources: sources, template: text.join("\n") };
  }

  return Base.makeAgent({ id: "finance", module: "D", title: "付款管道與金融工具（D）", compute: compute });
});
