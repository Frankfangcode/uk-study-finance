#!/usr/bin/env node
/**
 * AI Agent 層驗收：模型層、五個 agent、協調者、數字檢查，以及「AI 助理（試作）」分頁。
 * 全部離線可跑：預設用 rule provider，其他用測試自己寫的假模型；不需要任何金鑰或 claude 指令。
 */
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var childProcess = require("child_process");
var Base = require("../agents/base.js");
var Model = require("../agents/model.js");
var Coordinator = require("../agents/coordinator.js");
var Profile = require("../agents/profile-agent.js");
var Cost = require("../agents/cost-agent.js");
var G = require("../modules/guided/flow.js");
var B = require("../modules/b/programmes.js");
var E = require("../modules/e/review.js");
var loadApp = require("./fake-dom.js").loadApp;

var ROOT = path.join(__dirname, "..");
var NOT_FINAL = "尚未確定";
var MISSING_COMMAND = "claude-指令不存在-測試用";

var passed = 0;
var queue = [];
function check(name, fn) { queue.push({ name: name, fn: fn }); }

function has(text, part) { return String(text).indexOf(part) !== -1; }
function byModule(result, letter) { return result.agents.filter(function (a) { return a.module === letter; })[0]; }

/** 個人資料填好、選了格拉斯哥，但校方強制保險沒有處理（維持待確認）。 */
function pendingCase() {
  var state = G.createState();
  Object.assign(state.profile, { intakeYear: "2027", savings: "600000", family: "900000", awardedTwd: "200000", fxRate: "41", monthlyCap: "15000" });
  state.selected = ["glasgow"];
  return state;
}

/** 假模型：rewrite(template, request) 決定回什麼。只在測試裡用，不連線。 */
function fakeModel(rewrite) {
  var calls = [];
  function generateSync(req) {
    calls.push(req);
    return rewrite(req.template, req);
  }
  return {
    provider: "fake",
    label: "測試用假模型",
    calls: calls,
    generateSync: generateSync,
    generate: function (req) { return Promise.resolve().then(function () { return generateSync(req); }); },
  };
}

function onlyFor(title, change) {
  return function (template, req) { return has(req.prompt, title) ? change(template) : template; };
}

var C_TITLE = "成本、缺口與情境模擬（C）";

// ---------- 模型層 ----------

check("rule provider：不呼叫模型，原樣回傳模板，結果固定", function () {
  var model = Model.createModel("rule");
  assert.strictEqual(model.provider, "rule");
  assert.strictEqual(model.generateSync({ system: "s", prompt: "p", template: "固定模板" }), "固定模板");
  assert.throws(function () { model.generateSync({ system: "s", prompt: "p" }); }, /模板是空的/);
  var first = Coordinator.runSync(Coordinator.demoCase());
  var second = Coordinator.runSync(Coordinator.demoCase());
  assert.strictEqual(first.provider, "rule");
  assert.strictEqual(first.reply, second.reply);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(first)), JSON.parse(JSON.stringify(second)));
  return Model.generate({ system: "s", prompt: "p", template: "固定模板" }, { provider: "rule" }).then(function (text) {
    assert.strictEqual(text, "固定模板");
  });
});

check("模型層：三種 provider 都列出，不認得的 provider 直接報錯", function () {
  assert.deepStrictEqual(Model.PROVIDERS, ["rule", "claude-cli", "anthropic-api"]);
  assert.throws(function () { Model.createModel("gpt"); }, /不認得的 provider/);
});

check("claude-cli：找不到指令時 check、generateSync、generate 都回明確錯誤", function () {
  var model = Model.createModel({ provider: "claude-cli", command: MISSING_COMMAND });
  assert.throws(function () { model.check(); }, /找不到 `claude-指令不存在-測試用` 指令/);
  assert.throws(function () { model.generateSync({ system: "s", prompt: "p" }); }, /找不到/);
  return model.generate({ system: "s", prompt: "p" }).then(
    function () { assert.fail("找不到指令時不應該成功"); },
    function (err) { assert.ok(/找不到/.test(err.message), err.message); }
  );
});

check("claude-cli 失敗時協調者不假裝成功：標記 model_failed，說明退回規則模板", function () {
  var model = Model.createModel({ provider: "claude-cli", command: MISSING_COMMAND });
  var rule = Coordinator.runSync(Coordinator.demoCase());
  return Coordinator.run(Coordinator.demoCase(), { model: model }).then(function (result) {
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.model_failed, true);
    assert.strictEqual(result.model_errors.length, 5);
    assert.ok(has(result.reply, "模型呼叫失敗"));
    result.agents.forEach(function (agent, i) {
      assert.ok(/找不到/.test(agent.model_error));
      assert.strictEqual(agent.summary, rule.agents[i].summary);
      assert.ok(has(agent.summary_source, "退回模板"));
    });
  });
});

check("anthropic-api：沒有 ANTHROPIC_API_KEY 時回錯誤，不送出任何請求", function () {
  var sent = 0;
  var model = Model.createModel({ provider: "anthropic-api", env: {}, fetch: function () { sent += 1; return Promise.reject(new Error("不該被呼叫")); } });
  assert.throws(function () { model.check(); }, /ANTHROPIC_API_KEY/);
  var saved = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  var fromEnv = Model.createModel("anthropic-api");
  var threw = null;
  try { fromEnv.check(); } catch (err) { threw = err; }
  if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
  assert.ok(threw && /ANTHROPIC_API_KEY/.test(threw.message));
  return model.generate({ system: "s", prompt: "p" }).then(
    function () { assert.fail("沒有金鑰時不應該成功"); },
    function (err) {
      assert.ok(/ANTHROPIC_API_KEY/.test(err.message), err.message);
      assert.strictEqual(sent, 0);
    }
  );
});

check("程式碼、測試、文件裡沒有任何金鑰字串", function () {
  var files = fs.readdirSync(path.join(ROOT, "agents")).map(function (name) { return "agents/" + name; })
    .concat(["tests/agents.js", "README.md", "docs/spec.md", "index.html"]);
  var keyLike = new RegExp("sk" + "-ant|sk-[A-Za-z0-9_-]{16,}|x-api-key\"?\\s*[:=]\\s*\"[^\"]");
  files.forEach(function (file) {
    var text = fs.readFileSync(path.join(ROOT, file), "utf8");
    assert.ok(!keyLike.test(text), file + " 裡有像金鑰的字串");
  });
  assert.ok(has(fs.readFileSync(path.join(ROOT, "agents/model.js"), "utf8"), "env[API_KEY_ENV]"), "金鑰只從環境變數讀");
});

// ---------- 協調者與五個 agent ----------

check("協調者依序呼叫 A→B→C→D→E，再交給 E 審核後才放行 C", function () {
  var model = fakeModel(function (template) { return template; });
  var result = Coordinator.runSync(Coordinator.demoCase(), { model: model });
  assert.deepStrictEqual(result.order, ["A", "B", "C", "D", "E"]);
  var compute = result.trace.filter(function (t) { return t.phase === "計算"; }).map(function (t) { return t.module; });
  var write = result.trace.filter(function (t) { return t.phase === "說明"; }).map(function (t) { return t.module; });
  assert.deepStrictEqual(compute, ["A", "B", "C", "D", "E"]);
  assert.deepStrictEqual(write, ["A", "B", "C", "D", "E"]);
  var modules = result.trace.map(function (t) { return t.module; });
  assert.deepStrictEqual(modules.slice(0, 6), ["A", "B", "C", "D", "E", "C"]);
  assert.strictEqual(result.trace[5].phase, "E 審核後放行");
  assert.deepStrictEqual(result.agents.map(function (a) { return a.module; }), ["A", "B", "C", "D", "E"]);
  // 模型實際收到的請求也是同一個順序，而且每次都帶系統規則。
  assert.strictEqual(model.calls.length, 5);
  ["個人資料與快照（A）", "選校與獎學金（B）", C_TITLE, "付款管道與金融工具（D）", "合規審查（E）"].forEach(function (title, i) {
    assert.ok(has(model.calls[i].prompt, title), "第 " + (i + 1) + " 次呼叫應該是 " + title);
    assert.strictEqual(model.calls[i].system, Base.SYSTEM_PROMPT);
  });
});

check("每個 agent 回傳 { agent, data, summary, pending }，data 是模組原始輸出", function () {
  var result = Coordinator.runSync(Coordinator.demoCase());
  result.agents.forEach(function (agent) {
    assert.ok(agent.agent && typeof agent.agent === "string");
    assert.ok(agent.data && typeof agent.data === "object");
    assert.ok(typeof agent.summary === "string" && agent.summary.length > 0);
    assert.ok(Array.isArray(agent.pending));
    assert.strictEqual(agent.summary_rejected, false);
  });
  assert.deepStrictEqual(byModule(result, "B").data.programmes.glasgow, B.buildOutput("glasgow"));
  var cost = byModule(result, "C").data.plans.edinburgh;
  assert.deepStrictEqual(byModule(result, "E").data.reviews.edinburgh, E.review({ lines: cost.plan.lines, scenario: cost.scenario }));
  assert.strictEqual(byModule(result, "A").data.snapshots.glasgow.snapshot.snapshot_id, cost.plan && byModule(result, "C").data.plans.glasgow.snapshot_id);
});

check("示範個案：agent 的數字和引導流程（既有模組）算的完全一樣", function () {
  var result = Coordinator.runSync(Coordinator.demoCase());
  var state = G.demoState();
  ["glasgow", "edinburgh"].forEach(function (key) {
    var expected = G.evaluate(state, key);
    var got = byModule(result, "C").data.plans[key];
    assert.strictEqual(got.released, true);
    assert.strictEqual(got.plan.finalTotal, expected.plan.finalTotal);
    assert.strictEqual(got.plan.confirmedGap, expected.plan.confirmedGap);
    assert.strictEqual(got.plan.loanAmount, expected.plan.loanAmount);
    assert.strictEqual(got.plan.monthlyPayment, expected.plan.monthlyPayment);
    assert.deepStrictEqual(got.sim.scenarios, expected.sim.scenarios);
    assert.strictEqual(byModule(result, "E").data.reviews[key].verdict, expected.review.verdict);
    assert.ok(has(byModule(result, "C").summary, Base.twd(expected.plan.finalTotal)));
  });
  assert.strictEqual(result.demo, true);
  assert.ok(has(result.reply, "示範用虛構個案"));
});

check("pending 不被當 0：校保待確認時金額是 null，總成本等一律「尚未確定」", function () {
  var result = Coordinator.runSync(pendingCase());
  var cost = byModule(result, "C");
  var entry = cost.data.plans.glasgow;
  var line = entry.plan.lines.filter(function (l) { return l.id === "school-insurance"; })[0];
  assert.strictEqual(line.amount, null);
  assert.strictEqual(line.contributeTwd, null);
  assert.strictEqual(entry.released, false);
  assert.strictEqual(entry.plan.finalTotal, null);
  assert.strictEqual(entry.scenario.final_total_twd, null);
  entry.sim.scenarios.forEach(function (item) {
    assert.strictEqual(item.finalTotal, null);
    assert.strictEqual(item.monthlyPayment, null);
  });
  assert.ok(cost.pending.some(function (item) { return item.id === "glasgow-school-insurance"; }));
  assert.ok(has(cost.summary, "格拉斯哥大學的校方強制保險：待確認"));
  assert.ok(has(cost.summary, NOT_FINAL));
  assert.ok(!has(cost.summary, "總成本 NT$"), "沒放行時不能寫出總成本金額");
  assert.ok(!has(cost.summary, "月付 NT$"));
  assert.ok(!/校方強制保險[^，。]*(£0|NT\$0)/.test(cost.summary), "待確認不能寫成 0");
  assert.strictEqual(byModule(result, "E").data.reviews.glasgow.verdict, "退修");
  assert.ok(has(byModule(result, "E").summary, NOT_FINAL));
  assert.deepStrictEqual(result.review, [{ key: "glasgow", school: "格拉斯哥大學", verdict: "退修", released: false }]);
  assert.ok(has(result.reply, "格拉斯哥大學：退修。總成本、缺口、貸款額與月付" + NOT_FINAL));
});

check("E 還沒審查時，C agent 自己也不放行確定值", function () {
  var state = Coordinator.demoCase();
  var a = Profile.prepare({ state: state });
  var before = Cost.runSync({ state: state, a: a.data });
  assert.strictEqual(before.data.plans.glasgow.released, false);
  assert.ok(has(before.summary, NOT_FINAL));
  assert.ok(!has(before.summary, "總成本 NT$"));
  before.data.plans.glasgow.sim.scenarios.forEach(function (item) { assert.strictEqual(item.finalTotal, null); });
});

check("個人資料沒填好：不發布快照，空白不當 0，後面全部尚未確定", function () {
  var state = G.createState();
  state.selected = ["glasgow"];
  var result = Coordinator.runSync(state);
  var a = byModule(result, "A");
  assert.strictEqual(a.data.profile_ok, false);
  assert.strictEqual(a.data.profile.savings, null);
  assert.deepStrictEqual(a.data.snapshots, {});
  assert.ok(a.pending.length >= 4);
  assert.ok(has(byModule(result, "C").summary, NOT_FINAL));
  assert.ok(has(byModule(result, "E").summary, NOT_FINAL));
  assert.ok(!/NT\$\d/.test(byModule(result, "C").summary));
});

check("每個 agent 的規則模板都通過自己的數字檢查（示範、待確認、空白三種個案）", function () {
  [Coordinator.demoCase(), pendingCase(), G.createState()].forEach(function (state) {
    var result = Coordinator.runSync(state);
    assert.strictEqual(result.audit.ok, true, JSON.stringify(result.audit.checks));
    assert.strictEqual(result.audit.checks.length, 5);
    assert.strictEqual(result.summary_rejected, false);
    assert.strictEqual(result.ok, true);
  });
});

// ---------- 防止模型編造數字 ----------

check("summary 出現 data 沒有的金額：丟棄、退回模板、標 summary_rejected", function () {
  var rule = Coordinator.runSync(Coordinator.demoCase());
  var model = fakeModel(onlyFor(C_TITLE, function (t) { return t + "\n另外，換成分期付款還可以再省 NT$123,456。"; }));
  var result = Coordinator.runSync(Coordinator.demoCase(), { model: model });
  var cost = byModule(result, "C");
  assert.strictEqual(cost.summary_rejected, true);
  assert.strictEqual(cost.summary, byModule(rule, "C").summary);
  assert.ok(!has(cost.summary, "123,456"));
  assert.ok(cost.rejected_reasons.some(function (r) { return has(r, "123,456"); }));
  assert.strictEqual(result.summary_rejected, true);
  assert.ok(has(result.reply, "沒有通過數字檢查"));
  assert.ok(!has(result.reply, "123,456"));
  // 其他 agent 沒有亂寫，說明照用模型的輸出。
  assert.strictEqual(byModule(result, "B").summary_rejected, false);
  assert.strictEqual(byModule(result, "B").summary_source, "fake");
});

check("summary 出現 data 沒有的百分比、換算過的「萬」、沒看過的日期或網址：都拒絕", function () {
  var bad = [
    "貸款利率其實只有 2.1%。",
    "總成本大約 240 萬。",
    "學費要在 2027-03-15 前繳清。",
    "詳情見 https://example.com/fees 。",
    "學費 £34,816。",
  ];
  bad.forEach(function (sentence) {
    var model = fakeModel(onlyFor(C_TITLE, function (t) { return t + "\n" + sentence; }));
    var cost = byModule(Coordinator.runSync(Coordinator.demoCase(), { model: model }), "C");
    assert.strictEqual(cost.summary_rejected, true, sentence);
    assert.ok(!has(cost.summary, sentence));
  });
});

check("誠實的改寫（只動文字、數字照抄）會被採用，不會被誤擋", function () {
  var model = fakeModel(function (template) {
    return "以下整理給你參考。\n" + template.split("\n").reverse().join("\n");
  });
  var result = Coordinator.runSync(Coordinator.demoCase(), { model: model });
  result.agents.forEach(function (agent) {
    assert.strictEqual(agent.summary_rejected, false, agent.module + "：" + JSON.stringify(agent.rejected_reasons));
    assert.strictEqual(agent.summary_source, "fake");
    assert.ok(has(agent.summary, "以下整理給你參考。"));
  });
  assert.strictEqual(result.ok, true);
});

check("pending 的項目只能寫「待確認」：寫成金額、0 或免費都拒絕", function () {
  var rule = byModule(Coordinator.runSync(pendingCase()), "C");
  var target = "格拉斯哥大學的校方強制保險：待確認，金額未知";
  assert.ok(has(rule.summary, target));
  ["格拉斯哥大學的校方強制保險 £0", "格拉斯哥大學的校方強制保險大約 £300", "格拉斯哥大學的校方強制保險免費", "格拉斯哥大學的校方強制保險不用另外付"].forEach(function (replacement) {
    var model = fakeModel(onlyFor(C_TITLE, function (t) { return t.replace(target, replacement); }));
    var cost = byModule(Coordinator.runSync(pendingCase(), { model: model }), "C");
    assert.strictEqual(cost.summary_rejected, true, replacement);
    assert.strictEqual(cost.summary, rule.summary);
  });
});

check("E 沒通過時，模型把「尚未確定」改寫成確定總額會被拒絕", function () {
  var rule = byModule(Coordinator.runSync(pendingCase()), "C");
  var known = Base.twd(rule.data.plans.glasgow.plan.knownSubtotal);
  assert.ok(has(rule.summary, known), "已知小計本來就在說明裡");
  var model = fakeModel(onlyFor(C_TITLE, function (t) {
    return t.split(NOT_FINAL).join("已經算好") + "\n總成本就是 " + known + "。";
  }));
  var cost = byModule(Coordinator.runSync(pendingCase(), { model: model }), "C");
  assert.strictEqual(cost.summary_rejected, true);
  assert.ok(cost.rejected_reasons.some(function (r) { return has(r, NOT_FINAL); }));
  assert.ok(has(cost.summary, NOT_FINAL));
  // 沒放行時，C 算出的確定值不在可引用的數字裡：示範個案若 E 沒審，寫出總成本金額一樣被擋。
  var state = Coordinator.demoCase();
  var a = Profile.prepare({ state: state });
  var prep = Cost.prepare({ state: state, a: a.data });
  var total = Base.twd(prep.data.plans.glasgow.plan.loanAmount);
  assert.strictEqual(Base.verifyFor(prep, prep.template).ok, true);
  assert.strictEqual(Base.verifyFor(prep, prep.template + "\n建議貸款額 " + total + "。").ok, false);
});

check("verifySummary：空字串拒絕；比例存的假設可以寫成百分比；年份與小整數不誤擋", function () {
  var facts = { reserveRate: 0.05, tuition: 34815, intake: "2027-09", months: 12 };
  assert.strictEqual(Base.verifySummary("", { facts: facts }).ok, false);
  assert.strictEqual(Base.verifySummary("預備金 5%，學費 £34,815，2027-09 入學，課程 12 個月。", { facts: facts }).ok, true);
  assert.strictEqual(Base.verifySummary("預備金 6%。", { facts: facts }).ok, false);
  assert.strictEqual(Base.verifySummary("學費 ３４，８１６ 英鎊。", { facts: facts }).ok, false);
  assert.strictEqual(Base.twd(null), "待確認");
  assert.strictEqual(Base.gbp(undefined), "待確認");
});

check("每個數字要有來源：C 的每一筆已知費用都有來源、假設或學生自報標記", function () {
  var result = Coordinator.runSync(Coordinator.demoCase());
  var cost = byModule(result, "C");
  Object.keys(cost.data.plans).forEach(function (key) {
    var entry = cost.data.plans[key];
    entry.plan.lines.forEach(function (line) {
      if (line.amount === null) return;
      assert.ok(line.sourceUrl || line.assumption || line.selfReported, entry.school + " " + line.name + " 沒有來源");
    });
  });
  assert.ok(has(cost.summary, "學生自報，非本站查證"));
  assert.ok(has(cost.summary, "（假設）"));
  result.agents.forEach(function (agent) {
    agent.sources.forEach(function (source) {
      assert.ok(source.label && source.kind);
      if (source.kind === "有來源") assert.ok(/^https:\/\//.test(source.url), agent.module + " " + source.label);
    });
  });
  assert.ok(byModule(result, "B").sources.length >= 4);
  // D：沒有報價就不排名；缺費率的工具是待確認，不是 0。
  var finance = byModule(result, "D");
  assert.strictEqual(finance.data.payments.glasgow.tuition.compare.ranking, null);
  assert.strictEqual(finance.data.payments.glasgow.tuition.outstanding.amount, null);
  assert.ok(has(finance.summary, "Wise｜Wise 多幣別帳戶 待確認"));
  assert.ok(has(finance.summary, "換匯點差：待確認"));
});

// ---------- Node 示範指令 ----------

check("node agents/run.js --provider rule --demo 印出繁體中文報告並正常結束", function () {
  var done = childProcess.spawnSync(process.execPath, ["agents/run.js", "--provider", "rule", "--demo"], { cwd: ROOT, encoding: "utf8" });
  assert.strictEqual(done.status, 0, done.stderr);
  assert.ok(has(done.stdout, "AI 助理（試作）回覆"));
  assert.ok(has(done.stdout, "示範用虛構個案"));
  assert.ok(has(done.stdout, "E 審核結論"));
  assert.ok(has(done.stdout, "呼叫順序：A（計算） → B（計算） → C（計算） → D（計算） → E（計算）"));
  var noDemo = childProcess.spawnSync(process.execPath, ["agents/run.js", "--provider", "rule"], { cwd: ROOT, encoding: "utf8" });
  assert.strictEqual(noDemo.status, 1);
  assert.ok(has(noDemo.stderr, "--demo"));
});

check("node agents/run.js 在沒有 claude 指令或金鑰時以錯誤結束，不印出假報告", function () {
  var env = { PATH: path.join(ROOT, "tests", "沒有這個資料夾") };
  var cli = childProcess.spawnSync(process.execPath, ["agents/run.js", "--provider", "claude-cli", "--demo"], { cwd: ROOT, encoding: "utf8", env: env });
  assert.strictEqual(cli.status, 1);
  assert.ok(has(cli.stderr, "找不到 `claude` 指令"), cli.stderr);
  assert.strictEqual(cli.stdout.trim(), "");
  var api = childProcess.spawnSync(process.execPath, ["agents/run.js", "--provider", "anthropic-api", "--demo"], { cwd: ROOT, encoding: "utf8", env: env });
  assert.strictEqual(api.status, 1);
  assert.ok(has(api.stderr, "ANTHROPIC_API_KEY"), api.stderr);
  assert.strictEqual(api.stdout.trim(), "");
});

// ---------- 網站分頁 ----------

check("網站：有「AI 助理（試作）」分頁，載入時就寫明「不是即時 AI」", function () {
  var html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  assert.ok(has(html, 'data-page="ai">AI 助理（試作）</button>'));
  assert.ok(has(html, 'id="page-ai"'));
  assert.ok(has(html, "目前為規則模板，不是即時 AI；數字全部來自模組計算。"));
  ["base", "model", "profile-agent", "programme-agent", "cost-agent", "finance-agent", "compliance-agent", "coordinator", "ui"].forEach(function (name) {
    assert.ok(has(html, '<script src="agents/' + name + '.js"></script>'), "index.html 沒有載入 agents/" + name + ".js");
  });
  assert.ok(html.indexOf("agents/ui.js") < html.indexOf('src="app.js"'));
  var app = loadApp();
  var page = app.html("ai-root");
  assert.ok(has(page, "目前為規則模板，不是即時 AI；數字全部來自模組計算。"));
  assert.ok(has(page, 'data-ai-action="run-demo"'));
  assert.ok(!has(page, "data-ai-agent="), "還沒按執行前不該有結果卡片");
  // 切到這一頁不會出錯，網址也切到 #ai。
  app.dispatch("click", { "data-page": "ai" });
});

check("網站：按下執行後顯示協調者與五張 agent 卡片，數字和 Node 版相同", function () {
  var app = loadApp();
  app.dispatch("click", { "data-ai-action": "run-demo" });
  var page = app.html("ai-root");
  ["profile", "programme", "cost", "finance", "compliance"].forEach(function (id) {
    assert.ok(has(page, 'data-ai-agent="' + id + '"'), "少了 " + id + " 的卡片");
  });
  assert.strictEqual((page.match(/data-ai-agent="/g) || []).length, 5);
  assert.ok(has(page, "不是即時 AI"));
  assert.ok(has(page, "示範用虛構個案"));
  assert.ok(has(page, "說明：規則模板"));
  assert.ok(has(page, "A（計算） → B（計算） → C（計算） → D（計算） → E（計算）"));
  var node = Coordinator.runSync(Coordinator.demoCase());
  assert.ok(has(page, Base.twd(byModule(node, "C").data.plans.glasgow.plan.finalTotal)));
  // 用引導流程目前的資料（還是空的）執行：只列出還缺什麼，不出現任何確定金額。
  app.dispatch("click", { "data-ai-action": "run-guided" });
  var empty = app.html("ai-root");
  assert.ok(has(empty, NOT_FINAL));
  assert.ok(has(empty, "不能留空"));
  assert.ok(!has(empty, "總成本 NT$"));
  app.dispatch("click", { "data-ai-action": "clear" });
  assert.ok(!has(app.html("ai-root"), "data-ai-agent="));
});

check("網站只用 rule provider，不呼叫任何外部 API", function () {
  var app = loadApp();
  var box = app.sandbox;
  assert.strictEqual(box.AgentUI.PROVIDER, "rule");
  assert.strictEqual(typeof box.fetch, "undefined");
  assert.strictEqual(typeof box.XMLHttpRequest, "undefined");
  // 沒有任何連線能力的沙盒裡，整頁照樣跑完。
  app.dispatch("click", { "data-ai-action": "run-demo" });
  assert.strictEqual(box.AgentUI.controller.view.result.provider, "rule");
  assert.strictEqual(box.AgentUI.controller.view.result.ok, true);
  // 另外兩個 provider 在瀏覽器裡一律丟錯。
  assert.throws(function () { box.AgentModel.createModel("claude-cli"); }, /只能在 Node 執行/);
  assert.throws(function () { box.AgentModel.createModel("anthropic-api"); }, /只能在 Node 執行/);
  var ui = fs.readFileSync(path.join(ROOT, "agents/ui.js"), "utf8");
  assert.ok(!/fetch\(|XMLHttpRequest|WebSocket|sendBeacon/.test(ui));
  ["base", "profile-agent", "programme-agent", "cost-agent", "finance-agent", "compliance-agent", "coordinator"].forEach(function (name) {
    var text = fs.readFileSync(path.join(ROOT, "agents/" + name + ".js"), "utf8");
    assert.ok(!/fetch\(|XMLHttpRequest|https?:\/\//.test(text), "agents/" + name + ".js 不該有連線或寫死的網址");
  });
});

// ---------- 執行 ----------

function runAll() {
  var chain = Promise.resolve();
  queue.forEach(function (item) {
    chain = chain.then(function () {
      return Promise.resolve().then(item.fn).then(
        function () {
          passed += 1;
          console.log("PASS  " + item.name);
        },
        function (err) {
          console.error("FAIL  " + item.name);
          console.error("      " + (err && err.stack ? err.stack : err));
          process.exitCode = 1;
        }
      );
    });
  });
  return chain.then(function () {
    if (process.exitCode) console.error("\nAgent tests failed.");
    else console.log("\nAll " + passed + " agent tests passed.");
  });
}

runAll();
