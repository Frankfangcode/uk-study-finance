/**
 * B agent｜選校與獎學金。
 * 呼叫 BModule.buildOutput 與 BModule.awardState，說明學費、訂金、獎學金與 B 這邊還沒查到的項目。
 * 這裡講的是本站公開資料；學生自報的校保來源由 A 的快照與 C 的費用列處理。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./base.js"), require("../modules/b/programmes.js"));
  } else {
    root.ProgrammeAgent = factory(root.AgentBase, root.BModule);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (Base, B) {
  "use strict";

  var gbp = Base.gbp;

  function pushSource(sources, label, source) {
    if (!source || !source.url) return;
    sources.push({ label: label, url: source.url, checkedAt: source.consulted || null, kind: "有來源" });
  }

  function compute(ctx) {
    var state = (ctx && ctx.state) || {};
    var selected = (state.selected || []).slice();
    var data = { selected: selected, programmes: {}, awards: {} };
    var pending = [];
    var sources = [];
    var text = [];

    if (!selected.length) {
      pending.push({ id: "selected", label: "還沒有選學程" });
      text.push("還沒有選學程。本站目前收錄的英國碩士示例：" + B.list().map(function (p) { return p.school_name_zh; }).join("、") + "。");
    }

    selected.forEach(function (key) {
      var programme = B.buildOutput(key);
      if (!programme) {
        data.programmes[key] = null;
        pending.push({ id: key, label: "學程「" + key + "」尚未收錄" });
        text.push("學程「" + key + "」尚未收錄，沒有資料可以說明。");
        return;
      }
      var awardedIds = Object.keys((state.awards && state.awards[key]) || {}).filter(function (id) { return state.awards[key][id]; });
      var awards = B.awardState(programme, awardedIds);
      data.programmes[key] = programme;
      data.awards[key] = awards;
      var school = programme.school_name_zh || key;

      var head = school + "｜" + programme.program_name + "（" + programme.program_name_zh + "）";
      if (programme.intake) head += "，" + programme.intake + " 入學";
      text.push(head + "。");

      var tuition = programme.tuition || {};
      var deposit = programme.deposit || {};
      if (Base.isNum(tuition.amount)) {
        var fee = "公告學費 " + gbp(tuition.amount) + (tuition.year ? "（" + tuition.year + " 學年）" : "");
        if (Base.isNum(deposit.amount)) fee += "，訂金 " + gbp(deposit.amount) + " 是學費的預付，已含在學費裡，不另外加一次";
        text.push(fee + "。");
        pushSource(sources, school + " 學費", tuition.source);
        pushSource(sources, school + " 訂金", deposit.source);
      } else {
        var tuitionGuard = school + "的學費";
        pending.push({ id: key + "-tuition", label: school + "｜學費", guard: tuitionGuard });
        text.push(tuitionGuard + "：待確認，這個學程還不能試算。");
      }

      if (awards.length) {
        awards.forEach(function (item) {
          text.push(
            "獎學金 " + item.name + "：" + gbp(item.amount_gbp) + "（" + item.type + "），" +
            (item.awarded ? "已核定，計入資金一次。" : "尚未核定，不計入資金。")
          );
          pushSource(sources, school + " " + item.name, item.source);
        });
      } else if (programme.scholarship_note) {
        text.push(programme.scholarship_note);
      }

      var insurance = programme.insurance || {};
      if (insurance.inclusion_flag === "待確認" || insurance.amount === null || insurance.amount === undefined) {
        var insuranceGuard = school + "的校方強制保險";
        pending.push({
          id: key + "-school-insurance",
          label: school + "｜校方強制保險（本站公開資料沒有金額；學生可在引導流程附來源自報）",
          guard: insuranceGuard,
        });
        text.push(insuranceGuard + "：待確認（本站查到的公開頁面沒有金額，不當成零）。");
      }
      var sponsor = programme.sponsor_rule;
      if (sponsor && sponsor.status === "待確認") {
        var sponsorGuard = school + "的贊助未付規則";
        pending.push({ id: key + "-sponsor-rule", label: school + "｜贊助者未付款時的規則", guard: sponsorGuard });
        text.push(sponsorGuard + "：待確認。");
      }
    });

    return { data: data, pending: pending, sources: sources, template: text.join("\n") };
  }

  return Base.makeAgent({ id: "programme", module: "B", title: "選校與獎學金（B）", compute: compute });
});
