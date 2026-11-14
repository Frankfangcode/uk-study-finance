/**
 * 「AI 助理（試作）」分頁。只用 rule provider，在瀏覽器裡同步跑協調者，不呼叫任何外部 API。
 * 這個檔只管畫面：數字來自各模組，說明文字來自規則模板。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./coordinator.js"), require("../modules/guided/flow.js"), null);
  } else {
    root.AgentUI = factory(root.AgentCoordinator, root.GuidedFlow, root);
    if (root.document && root.document.getElementById) root.AgentUI.controller = root.AgentUI.mount(root.document);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (Coordinator, G, root) {
  "use strict";

  var PROVIDER = "rule";
  var NOTICE = "目前為規則模板，不是即時 AI；數字全部來自模組計算。";

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function paragraphs(text) {
    return String(text || "").split("\n").map(function (line) { return "<p>" + esc(line) + "</p>"; }).join("");
  }

  function sourceItem(source) {
    var label = esc(source.label);
    var body = source.url
      ? '<a href="' + esc(source.url) + '" target="_blank" rel="noopener">' + label + "</a>"
      : label;
    return "<li>" + body + ' <span class="tag">' + esc(source.kind || "") + "</span>" +
      (source.checkedAt ? ' <span class="fine">查閱 ' + esc(source.checkedAt) + "</span>" : "") + "</li>";
  }

  function agentCard(result) {
    var pending = result.pending.length
      ? "<ul>" + result.pending.map(function (item) {
          return "<li>" + esc(item.label) + ' <span class="tag pending">待確認</span></li>';
        }).join("") + "</ul>"
      : '<p class="fine">這個 agent 沒有待確認項目。</p>';
    var sources = result.sources.length
      ? '<details><summary>來源與標記（' + result.sources.length + " 筆）</summary><ul>" + result.sources.map(sourceItem).join("") + "</ul></details>"
      : "";
    var rejected = result.summary_rejected
      ? '<div class="banner bad">模型說明沒有通過數字檢查，已丟棄並改用規則模板。</div>'
      : "";
    return '<article class="card ai-card" data-ai-agent="' + esc(result.agent) + '">' +
      "<h3>" + esc(result.title) + ' <span class="tag">' + esc(result.module) + " 模組</span>" +
      ' <span class="tag assumption">說明：規則模板</span></h3>' + rejected +
      '<div class="ai-summary">' + paragraphs(result.summary) + "</div>" +
      "<h4>待確認</h4>" + pending + sources +
      '<details><summary>模組原始輸出（data）</summary><pre class="ai-data">' + esc(JSON.stringify(result.data, null, 2)) + "</pre></details>" +
      "</article>";
  }

  function resultHtml(result) {
    var demo = result.demo
      ? '<div class="g-demo" role="note"><b>示範用虛構個案</b>　個人資料、資金與校方強制保險的來源都是虛構的，不是真實個案。</div>'
      : "";
    var review = result.review.length
      ? "<ul>" + result.review.map(function (item) {
          return "<li>" + esc(item.school) + '：<span class="tag ' + (item.released ? "ok" : "pending") + '">' + esc(item.verdict) + "</span> " +
            (item.released ? "確定值見成本卡片。" : "總成本、缺口、貸款額與月付尚未確定。") + "</li>";
        }).join("") + "</ul>"
      : "<p>沒有可以審查的方案，總成本、缺口、貸款額與月付尚未確定。</p>";
    var order = result.trace.map(function (t) { return esc(t.module) + "（" + esc(t.phase) + "）"; }).join(" → ");
    return demo +
      '<article class="card"><h3>協調者</h3>' +
      '<p class="fine">呼叫順序：' + order + "</p>" +
      "<h4>E 審核結論</h4>" + review +
      '<p class="fine">' + esc(result.audit.ok ? "每段說明裡的數字都能在對應模組的輸出找到。" : "有說明沒通過最後檢查，請不要引用。") +
      " " + esc(Coordinator.DISCLAIMER) + "</p></article>" +
      result.agents.map(agentCard).join("");
  }

  function renderHtml(view) {
    var guidedReady = !!(view.guidedState && view.guidedState.selected && view.guidedState.selected.length);
    var html =
      '<div class="banner ai-notice" role="note">' + esc(NOTICE) + "</div>" +
      '<p class="fine">五個 agent 各負責一個模組（A 個人資料與快照、B 選校、C 成本、D 付款與金融工具、E 合規），由協調者依序呼叫，再交給 E 審核。這一頁不會連到任何外部服務。</p>' +
      '<div class="row-actions">' +
      '<button class="btn" type="button" data-ai-action="run-demo">用「示範用虛構個案」執行</button>' +
      '<button class="btn secondary" type="button" data-ai-action="run-guided">用我在引導流程填的資料執行</button>' +
      (view.result ? '<button class="btn secondary" type="button" data-ai-action="clear">清除結果</button>' : "") +
      "</div>" +
      (guidedReady ? "" : '<p class="fine">引導流程還沒有選學程時，用自己的資料執行只會列出還缺什麼。</p>');
    if (view.error) html += '<div class="banner bad">' + esc(view.error) + "</div>";
    if (view.result) html += resultHtml(view.result);
    return html;
  }

  function mount(document) {
    var rootEl = document.getElementById("ai-root");
    var view = { result: null, error: "", guidedState: null };

    function guidedState() {
      var flow = (root && root.GuidedFlow) || G;
      return flow && flow.controller ? flow.controller.state : null;
    }

    function render() {
      view.guidedState = guidedState();
      rootEl.innerHTML = renderHtml(view);
    }

    function run(state) {
      view.error = "";
      try {
        view.result = Coordinator.runSync(state, { provider: PROVIDER });
      } catch (err) {
        view.result = null;
        view.error = "協調者執行失敗：" + (err && err.message ? err.message : err);
      }
    }

    document.addEventListener("click", function (event) {
      var btn = event.target && event.target.closest ? event.target.closest("[data-ai-action]") : null;
      if (!btn) return;
      var action = btn.getAttribute("data-ai-action");
      if (action === "run-demo") run(Coordinator.demoCase());
      else if (action === "run-guided") run(guidedState() || G.createState());
      else if (action === "clear") { view.result = null; view.error = ""; }
      else return;
      render();
    });

    render();
    return { view: view, render: render };
  }

  return { PROVIDER: PROVIDER, NOTICE: NOTICE, renderHtml: renderHtml, mount: mount };
});
