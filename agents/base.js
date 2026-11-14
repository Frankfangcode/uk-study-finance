/**
 * Agent 共用骨架：格式化、數字檢查、以及「模組算數字、模型只寫說明」的固定流程。
 *
 * 每個 agent 的結果長這樣：
 *   { agent, data, summary, pending, ... }
 *   - data     模組原始輸出，agent 不改數字。
 *   - summary  說明文字。先由模型層產生，再過 verifySummary；不通過就丟掉，改用規則模板。
 *   - pending  待確認清單。
 *
 * verifySummary 擋三件事：
 *   1. summary 裡的金額、百分比、日期、網址，都必須能在 data（或待確認清單）裡找到。
 *   2. 待確認的項目只能寫「待確認」，後面不能接數字，也不能寫成免費或無此費用。
 *   3. agent 指定的必要字句（例如 E 沒通過時的「尚未確定」）不能被拿掉。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.AgentBase = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var PENDING = "待確認";
  var NOT_FINAL = "尚未確定";
  var SYSTEM_PROMPT = [
    "你是「留學財務長 AI」裡負責整理說明文字的助手，讀者是準備去英國讀碩士的台灣學生。",
    "規則：",
    "一、只能改寫文字，不能計算、換算、四捨五入或估計任何數字。草稿裡的每個數字都由程式模組算好，請原樣照抄（含千分位與幣別符號），不要改成「萬」或「約」。",
    "二、不可以新增草稿沒有的金額、百分比、日期或網址。",
    "三、標成「待確認」的項目只能寫「待確認」，不可以猜金額，也不可以寫成免費、零或無此費用。",
    "四、草稿寫「尚未確定」的地方必須保留「尚未確定」四個字，不可以改寫成確定的總額。",
    "五、「假設」「學生自報，非本站查證」「示範」「虛構」這些標記要保留。",
    "六、用繁體中文，只輸出說明本身，不要加開場白、結語或 Markdown 標題。",
  ].join("\n");

  function clone(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function isNum(value) {
    return typeof value === "number" && isFinite(value);
  }

  function group(text) {
    var parts = String(text).split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return parts.join(".");
  }

  /** 台幣一律取整到元；null 不會變成 0，回傳待確認。 */
  function twd(n) {
    if (!isNum(n)) return PENDING;
    var rounded = Math.round(n);
    return (rounded < 0 ? "−" : "") + "NT$" + group(Math.abs(rounded));
  }

  function gbp(n) {
    if (!isNum(n)) return PENDING;
    var rounded = Math.round(n * 100) / 100;
    return (rounded < 0 ? "−" : "") + "£" + group(Math.abs(rounded));
  }

  function num(n) {
    if (!isNum(n)) return PENDING;
    return String(Math.round(n * 1e6) / 1e6);
  }

  function pct(n) {
    return isNum(n) ? num(n) + "%" : PENDING;
  }

  // ---------- 數字檢查 ----------

  function normalise(text) {
    return String(text == null ? "" : text)
      .replace(/[０-９]/g, function (ch) { return String.fromCharCode(ch.charCodeAt(0) - 0xfee0); })
      .replace(/％/g, "%")
      .replace(/[，]/g, "，")
      .replace(/−/g, "-");
  }

  var URL_RE = /https?:\/\/[^\s）)」』，。；、<>"']+/g;
  var DATE_RE = /\d{4}-\d{2}-\d{2}|\d{4}-\d{2}(?!\d)/g;
  var NUMBER_RE = /(NT\$|NTD|TWD|GBP|£|\$)?\s?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?\s?(%|元|英鎊|鎊|台幣|臺幣|新臺幣|萬|億|千)?/g;

  function numbersIn(text) {
    var out = [];
    var cleaned = normalise(text).replace(URL_RE, " ").replace(DATE_RE, " ");
    var m;
    NUMBER_RE.lastIndex = 0;
    while ((m = NUMBER_RE.exec(cleaned))) {
      var digits = m[2].replace(/,/g, "") + (m[3] || "");
      var value = Number(digits);
      if (!isFinite(value)) continue;
      var plainYear = !m[1] && !m[4] && !m[3] && /^\d{4}$/.test(m[2]) && value >= 1900 && value <= 2100;
      out.push({
        raw: m[0].trim(),
        value: value,
        decimals: m[3] ? m[3].length - 1 : 0,
        percent: m[4] === "%",
        scaled: m[4] === "萬" || m[4] === "億" || m[4] === "千",
        // 帶幣別、百分比、千分位，或大於等於一千（年份除外）的，都當成金額或比例，從嚴比對。
        strict: !!m[1] || !!m[4] || m[2].indexOf(",") !== -1 || (value >= 1000 && !plainYear),
      });
    }
    return out;
  }

  /** 走過整份 data，收集可以引用的數字與文字。網址裡的數字不算。 */
  function collectFacts(data) {
    var numbers = [];
    var textNumbers = [];
    var strings = [];
    (function walk(node) {
      if (node === null || node === undefined) return;
      if (typeof node === "number") {
        if (isFinite(node)) numbers.push(Math.abs(node));
        return;
      }
      if (typeof node === "string") {
        strings.push(normalise(node));
        numbersIn(node).forEach(function (token) { textNumbers.push(token.value); });
        return;
      }
      if (typeof node !== "object") return;
      if (Array.isArray(node)) { node.forEach(walk); return; }
      Object.keys(node).forEach(function (key) { walk(node[key]); });
    })(data);
    return { numbers: numbers, textNumbers: textNumbers, strings: strings };
  }

  function roundTo(value, decimals) {
    var f = Math.pow(10, decimals);
    return Math.round(value * f) / f;
  }

  function matches(token, candidates, asRatio) {
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      if (Math.abs(roundTo(c, token.decimals) - token.value) < 1e-9) return true;
      // 模組用比例存的（例如預備金 0.05），說明文字會寫成百分比。
      if (asRatio && c > 0 && c < 1 && Math.abs(roundTo(c * 100, token.decimals) - token.value) < 1e-9) return true;
    }
    return false;
  }

  function inStrings(needle, strings) {
    for (var i = 0; i < strings.length; i++) if (strings[i].indexOf(needle) !== -1) return true;
    return false;
  }

  var FREE_WORDS = ["免費", "無此費用", "不用付", "不需要付", "不收費"];

  /**
   * 檢查一段說明。opts.facts 是可以引用的資料（通常是 { data, pending }），
   * opts.pending 是待確認清單，opts.mustInclude 是必要字句。
   */
  function verifySummary(text, opts) {
    opts = opts || {};
    var problems = [];
    var raw = typeof text === "string" ? text.trim() : "";
    if (!raw) return { ok: false, problems: ["說明是空的。"] };
    var summary = normalise(raw);
    var facts = collectFacts(opts.facts);

    (summary.match(URL_RE) || []).forEach(function (url) {
      if (!inStrings(url, facts.strings)) problems.push("網址「" + url + "」不在模組資料裡。");
    });
    (summary.replace(URL_RE, " ").match(DATE_RE) || []).forEach(function (date) {
      if (!inStrings(date, facts.strings)) problems.push("日期「" + date + "」不在模組資料裡。");
    });

    numbersIn(summary).forEach(function (token) {
      if (token.scaled) {
        problems.push("「" + token.raw + "」換算過單位，無法和模組資料逐字對上。");
        return;
      }
      var ok = token.strict
        ? matches(token, facts.numbers, token.percent)
        : matches(token, facts.numbers, false) || matches(token, facts.textNumbers, false);
      if (!ok) problems.push("數字「" + token.raw + "」不在模組資料裡。");
    });

    (opts.pending || []).forEach(function (item) {
      var guard = item && item.guard;
      if (!guard) return;
      guard = normalise(guard);
      var from = 0;
      var at;
      while ((at = summary.indexOf(guard, from)) !== -1) {
        from = at + guard.length;
        var rest = summary.slice(at);
        var clause = rest.slice(0, rest.search(/[，。；\n]|$/));
        var before = Math.max(summary.lastIndexOf("。", at), summary.lastIndexOf("\n", at), summary.lastIndexOf("；", at)) + 1;
        var after = summary.slice(at).search(/[。；\n]|$/) + at;
        var sentence = summary.slice(before, after);
        if (sentence.indexOf(PENDING) === -1) problems.push("「" + item.guard + "」是待確認，說明裡卻沒有寫待確認。");
        if (/\d/.test(clause)) problems.push("「" + item.guard + "」是待確認，後面不能接數字。");
        FREE_WORDS.forEach(function (word) {
          if (clause.indexOf(word) !== -1) problems.push("「" + item.guard + "」是待確認，不能寫成「" + word + "」。");
        });
      }
    });

    (opts.mustInclude || []).forEach(function (phrase) {
      if (summary.indexOf(normalise(phrase)) === -1) problems.push("少了必要的字句「" + phrase + "」。");
    });

    return { ok: problems.length === 0, problems: problems };
  }

  // ---------- agent 骨架 ----------

  function buildPrompt(prep) {
    var pendingText = prep.pending.length
      ? prep.pending.map(function (item) { return "- " + item.label; }).join("\n")
      : "（無）";
    return [
      "以下是「" + prep.title + "」的說明草稿，數字全部由程式模組算好。",
      "請把草稿改寫成學生容易讀的繁體中文說明，可以調整語序、合併或拆句，但要遵守系統規則：數字照抄、不新增數字、待確認只寫待確認、保留「尚未確定」與各種標記。",
      "",
      "待確認清單：",
      pendingText,
      "",
      "草稿：",
      prep.template,
    ].join("\n");
  }

  function verifyFor(prep, text) {
    return verifySummary(text, {
      facts: { data: prep.facts, pending: prep.pending },
      pending: prep.pending,
      mustInclude: prep.mustInclude,
    });
  }

  function finish(prep, model, text, error) {
    var result = {
      agent: prep.agent,
      module: prep.module,
      title: prep.title,
      data: prep.data,
      summary: prep.template,
      pending: prep.pending,
      sources: prep.sources,
      provider: (model && model.provider) || "rule",
      summary_source: "rule",
      summary_rejected: false,
    };
    if (error) {
      // 模型呼叫失敗：不假裝成功，把錯誤留在結果上，說明退回規則模板。
      result.model_error = String((error && error.message) || error);
      result.summary_source = "rule（模型呼叫失敗，退回模板）";
      return result;
    }
    if (text === null) return result;
    var check = verifyFor(prep, text);
    if (!check.ok) {
      result.summary_rejected = true;
      result.rejected_reasons = check.problems;
      result.summary_source = "rule（模型說明未通過檢查，退回模板）";
      return result;
    }
    result.summary = String(text).trim();
    result.summary_source = result.provider;
    return result;
  }

  function request(prep) {
    return { system: SYSTEM_PROMPT, prompt: buildPrompt(prep), template: prep.template };
  }

  /**
   * spec: { id, module, title, compute(ctx) }。
   * compute 回傳 { data, pending, sources, template, facts?, mustInclude? }。
   *   facts 沒給就用 data；給了就只拿 facts 比對數字（用來把 E 還沒放行的確定值排除在外）。
   */
  function makeAgent(spec) {
    function prepare(ctx, computeFn) {
      var out = (computeFn || spec.compute)(ctx || {});
      return {
        agent: spec.id,
        module: spec.module,
        title: spec.title,
        data: out.data,
        pending: out.pending || [],
        sources: out.sources || [],
        template: out.template,
        facts: out.facts === undefined ? out.data : out.facts,
        mustInclude: out.mustInclude || [],
      };
    }

    function completeSync(prep, opts) {
      opts = opts || {};
      var model = opts.model;
      if (opts.templateOnly || !model) return finish(prep, model, null, null);
      var text;
      try {
        if (typeof model.generateSync !== "function") throw new Error("這個模型層沒有同步介面，請改用 run()。");
        text = model.generateSync(request(prep));
      } catch (err) {
        return finish(prep, model, null, err);
      }
      return finish(prep, model, text, null);
    }

    function complete(prep, opts) {
      opts = opts || {};
      var model = opts.model;
      if (opts.templateOnly || !model) return Promise.resolve(finish(prep, model, null, null));
      return Promise.resolve()
        .then(function () { return model.generate(request(prep)); })
        .then(
          function (text) { return finish(prep, model, text, null); },
          function (err) { return finish(prep, model, null, err); }
        );
    }

    return {
      id: spec.id,
      module: spec.module,
      title: spec.title,
      prepare: prepare,
      complete: complete,
      completeSync: completeSync,
      run: function (ctx, opts) { return complete(prepare(ctx), opts); },
      runSync: function (ctx, opts) { return completeSync(prepare(ctx), opts); },
    };
  }

  return {
    PENDING: PENDING,
    NOT_FINAL: NOT_FINAL,
    SYSTEM_PROMPT: SYSTEM_PROMPT,
    clone: clone,
    isNum: isNum,
    twd: twd,
    gbp: gbp,
    num: num,
    pct: pct,
    numbersIn: numbersIn,
    collectFacts: collectFacts,
    verifySummary: verifySummary,
    verifyFor: verifyFor,
    buildPrompt: buildPrompt,
    makeAgent: makeAgent,
  };
});
