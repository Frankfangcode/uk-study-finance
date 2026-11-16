#!/usr/bin/env node
/**
 * Node 示範指令：用示範用虛構個案跑完整的 A→B→C→D→E 流程，印出繁體中文報告。
 *
 *   node agents/run.js --provider rule --demo
 *   node agents/run.js --provider claude-cli --demo
 *   node agents/run.js --provider anthropic-api --demo   （金鑰從環境變數 ANTHROPIC_API_KEY 讀）
 *
 * 模型不可用（找不到 claude 指令、沒有金鑰）時直接報錯並以非 0 結束，不會假裝成功。
 */
var Model = require("./model.js");
var Coordinator = require("./coordinator.js");

var USAGE = [
  "用法：node agents/run.js --provider rule|claude-cli|anthropic-api --demo",
  "  --provider  說明文字由誰整理。預設 rule（規則模板，不呼叫任何模型）。",
  "  --demo      使用示範用虛構個案（目前只支援這個個案）。",
  "  --json      改印完整結果的 JSON（含每個 agent 的 data）。",
].join("\n");

function parseArgs(argv) {
  var out = { provider: "rule", demo: false, json: false, help: false, unknown: [] };
  for (var i = 0; i < argv.length; i++) {
    var arg = argv[i];
    if (arg === "--demo") out.demo = true;
    else if (arg === "--json") out.json = true;
    else if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--provider") { out.provider = argv[i + 1]; i += 1; }
    else if (arg.indexOf("--provider=") === 0) out.provider = arg.slice("--provider=".length);
    else out.unknown.push(arg);
  }
  return out;
}

function report(result) {
  var lines = [result.reply, "", "—— 執行紀錄 ——"];
  lines.push("呼叫順序：" + result.trace.map(function (t) { return t.module + "（" + t.phase + "）"; }).join(" → "));
  result.agents.forEach(function (agent) {
    lines.push(
      agent.module + "｜" + agent.title + "：說明來源 " + agent.summary_source +
      "；summary_rejected=" + agent.summary_rejected + "；待確認 " + agent.pending.length + " 項；來源 " + agent.sources.length + " 筆"
    );
    (agent.rejected_reasons || []).forEach(function (reason) { lines.push("    退回原因：" + reason); });
    if (agent.model_error) lines.push("    模型錯誤：" + agent.model_error);
  });
  return lines.join("\n");
}

function main(argv) {
  var args = parseArgs(argv);
  if (args.help) { console.log(USAGE); return Promise.resolve(0); }
  if (args.unknown.length) { console.error("不認得的參數：" + args.unknown.join(" ") + "\n" + USAGE); return Promise.resolve(1); }
  if (!args.demo) { console.error("目前只支援示範用虛構個案，請加上 --demo。\n" + USAGE); return Promise.resolve(1); }

  var model;
  try {
    model = Model.createModel(args.provider);
    model.check();
  } catch (err) {
    console.error("模型層無法使用：" + (err && err.message ? err.message : err));
    return Promise.resolve(1);
  }

  return Coordinator.run(Coordinator.demoCase(), { model: model }).then(function (result) {
    console.log(args.json ? JSON.stringify(result, null, 2) : report(result));
    if (result.model_failed) {
      console.error("\n模型呼叫失敗，上面的說明是規則模板，不是 " + model.label + " 的輸出。");
      return 1;
    }
    return result.ok ? 0 : 1;
  });
}

if (require.main === module) {
  main(process.argv.slice(2)).then(
    function (code) { process.exitCode = code; },
    function (err) { console.error("執行失敗：" + (err && err.stack ? err.stack : err)); process.exitCode = 1; }
  );
}

module.exports = { main: main, parseArgs: parseArgs, report: report, USAGE: USAGE };
