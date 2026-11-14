/**
 * 可替換的模型層。統一介面：generate({ system, prompt, template }) → Promise<文字>。
 *
 * 模型只負責把草稿改寫成說明文字，不算任何數字；改寫結果還要過 AgentBase.verifySummary。
 *
 * provider：
 *   "rule"          不呼叫任何模型，直接回傳規則模板（request.template）。網站與測試預設用這個，
 *                   可離線、結果固定。
 *   "claude-cli"    只在 Node 執行。用 child_process 呼叫本機的 `claude -p`（使用者自己登入的
 *                   Claude Code）。找不到指令就丟出明確錯誤。個人訂閱只能自己用，不能拿來替別人服務。
 *   "anthropic-api" 只在 Node 執行。金鑰只從環境變數 ANTHROPIC_API_KEY 讀，沒有就丟出錯誤。
 *                   公開部署請用這個，並自備金鑰。
 *
 * 瀏覽器裡只有 "rule" 可用；另外兩個在瀏覽器一律丟錯，網站不會對外連線。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(true);
  else root.AgentModel = factory(false);
})(typeof globalThis !== "undefined" ? globalThis : this, function (hasRequire) {
  "use strict";

  var PROVIDERS = ["rule", "claude-cli", "anthropic-api"];
  var LABELS = {
    rule: "規則模板（不是即時 AI）",
    "claude-cli": "本機 Claude Code（claude -p）",
    "anthropic-api": "Anthropic API",
  };
  var API_KEY_ENV = "ANTHROPIC_API_KEY";
  var API_MODEL_ENV = "ANTHROPIC_MODEL";
  var API_URL = "https://api.anthropic.com/v1/messages";
  var API_VERSION = "2023-06-01";
  var DEFAULT_API_MODEL = "claude-opus-5-5";
  var DEFAULT_TIMEOUT_MS = 180000;

  var isNode = hasRequire && typeof process !== "undefined" && !!(process.versions && process.versions.node);

  function nodeOnly(provider) {
    if (!isNode) throw new Error("「" + provider + "」只能在 Node 執行。網站只用規則模板，不呼叫任何外部服務。");
  }

  function checkRequest(req) {
    if (!req || typeof req.prompt !== "string" || !req.prompt.trim()) throw new Error("模型層需要 prompt。");
    return { system: typeof req.system === "string" ? req.system : "", prompt: req.prompt, template: req.template };
  }

  function cleanOutput(text, provider) {
    var out = String(text == null ? "" : text).trim();
    if (!out) throw new Error(LABELS[provider] + "沒有回傳任何文字。");
    return out;
  }

  // ---------- rule ----------

  function ruleProvider() {
    function generateSync(req) {
      if (!req || typeof req.template !== "string" || !req.template.trim()) {
        throw new Error("規則模板是空的：rule provider 需要 agent 提供 template。");
      }
      return req.template;
    }
    return {
      provider: "rule",
      label: LABELS.rule,
      check: function () { return { ok: true }; },
      generateSync: generateSync,
      generate: function (req) {
        try { return Promise.resolve(generateSync(req)); } catch (err) { return Promise.reject(err); }
      },
    };
  }

  // ---------- claude-cli ----------

  function cliMissing(command) {
    return new Error(
      "找不到 `" + command + "` 指令。claude-cli 需要本機已安裝並登入 Claude Code；" +
      "請先確認在終端機能執行 `claude -p`，或改用 --provider rule。"
    );
  }

  function cliFailure(command, detail) {
    return new Error("`" + command + " -p` 執行失敗：" + (String(detail || "").trim().slice(0, 400) || "沒有錯誤訊息") + "。請確認 Claude Code 已登入。");
  }

  function claudeCliProvider(opts) {
    nodeOnly("claude-cli");
    var childProcess = require("child_process");
    var command = opts.command || "claude";
    var timeout = opts.timeoutMs || DEFAULT_TIMEOUT_MS;

    function args(req) {
      var list = ["-p", "--output-format", "text"];
      if (req.system) list.push("--system-prompt", req.system);
      return list;
    }

    function check() {
      var probe = childProcess.spawnSync(command, ["--version"], { encoding: "utf8", timeout: 20000 });
      if (probe.error) {
        if (probe.error.code === "ENOENT") throw cliMissing(command);
        throw cliFailure(command, probe.error.message);
      }
      if (probe.status !== 0) throw cliFailure(command, probe.stderr || probe.stdout);
      return { ok: true, version: String(probe.stdout || "").trim() };
    }

    function generateSync(request) {
      var req = checkRequest(request);
      var done = childProcess.spawnSync(command, args(req), {
        input: req.prompt,
        encoding: "utf8",
        timeout: timeout,
        maxBuffer: 8 * 1024 * 1024,
      });
      if (done.error) {
        if (done.error.code === "ENOENT") throw cliMissing(command);
        throw cliFailure(command, done.error.message);
      }
      if (done.status !== 0) throw cliFailure(command, done.stderr || done.stdout || "結束代碼 " + done.status);
      return cleanOutput(done.stdout, "claude-cli");
    }

    function generate(request) {
      return new Promise(function (resolve, reject) {
        var req;
        try { req = checkRequest(request); } catch (err) { reject(err); return; }
        var child;
        try {
          child = childProcess.spawn(command, args(req), { stdio: ["pipe", "pipe", "pipe"] });
        } catch (err) {
          reject(err && err.code === "ENOENT" ? cliMissing(command) : cliFailure(command, err && err.message));
          return;
        }
        var stdout = "";
        var stderr = "";
        var settled = false;
        function settle(fn, value) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          fn(value);
        }
        var timer = setTimeout(function () {
          child.kill();
          settle(reject, cliFailure(command, "超過 " + Math.round(timeout / 1000) + " 秒沒有回應"));
        }, timeout);
        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", function (chunk) { stdout += chunk; });
        child.stderr.on("data", function (chunk) { stderr += chunk; });
        child.stdin.on("error", function () {});
        child.on("error", function (err) {
          settle(reject, err && err.code === "ENOENT" ? cliMissing(command) : cliFailure(command, err && err.message));
        });
        child.on("close", function (code) {
          if (code !== 0) { settle(reject, cliFailure(command, stderr || stdout || "結束代碼 " + code)); return; }
          try { settle(resolve, cleanOutput(stdout, "claude-cli")); } catch (err) { settle(reject, err); }
        });
        child.stdin.end(req.prompt);
      });
    }

    return { provider: "claude-cli", label: LABELS["claude-cli"], check: check, generateSync: generateSync, generate: generate };
  }

  // ---------- anthropic-api ----------

  function anthropicApiProvider(opts) {
    nodeOnly("anthropic-api");
    var env = opts.env || process.env;
    var fetchImpl = opts.fetch || (typeof fetch === "function" ? fetch : null);
    var modelId = opts.model || env[API_MODEL_ENV] || DEFAULT_API_MODEL;
    var maxTokens = opts.maxTokens || 2000;

    function key() {
      var value = env[API_KEY_ENV];
      if (typeof value !== "string" || !value.trim()) {
        throw new Error("沒有設定環境變數 " + API_KEY_ENV + "。anthropic-api 需要你自備金鑰；金鑰不要寫進程式或文件。");
      }
      return value.trim();
    }

    function check() {
      key();
      if (!fetchImpl) throw new Error("這個 Node 版本沒有內建 fetch，anthropic-api 需要 Node 18 以上。");
      return { ok: true, model: modelId };
    }

    function generate(request) {
      return Promise.resolve().then(function () {
        var req = checkRequest(request);
        check();
        var body = { model: modelId, max_tokens: maxTokens, messages: [{ role: "user", content: req.prompt }] };
        if (req.system) body.system = req.system;
        return fetchImpl(API_URL, {
          method: "POST",
          headers: { "content-type": "application/json", "x-api-key": key(), "anthropic-version": API_VERSION },
          body: JSON.stringify(body),
        });
      }).then(function (res) {
        return res.text().then(function (raw) {
          var json = null;
          try { json = JSON.parse(raw); } catch (err) { json = null; }
          if (!res.ok) {
            var message = (json && json.error && json.error.message) || raw.slice(0, 300);
            throw new Error("Anthropic API 回應 " + res.status + "：" + message);
          }
          var text = ((json && json.content) || [])
            .filter(function (block) { return block && block.type === "text"; })
            .map(function (block) { return block.text; })
            .join("");
          return cleanOutput(text, "anthropic-api");
        });
      });
    }

    return {
      provider: "anthropic-api",
      label: LABELS["anthropic-api"],
      model: modelId,
      check: check,
      generate: generate,
      generateSync: function () { throw new Error("anthropic-api 沒有同步介面，請用 generate()。"); },
    };
  }

  /** createModel("rule") 或 createModel({ provider: "claude-cli", command, timeoutMs })。 */
  function createModel(options) {
    var opts = typeof options === "string" ? { provider: options } : options || {};
    var provider = opts.provider || "rule";
    if (provider === "rule") return ruleProvider();
    if (provider === "claude-cli") return claudeCliProvider(opts);
    if (provider === "anthropic-api") return anthropicApiProvider(opts);
    throw new Error("不認得的 provider「" + provider + "」。可用的是：" + PROVIDERS.join("、") + "。");
  }

  /** 最短的用法：generate({ system, prompt, template }, { provider }) → Promise<文字>。 */
  function generate(request, options) {
    try { return createModel(options).generate(request); } catch (err) { return Promise.reject(err); }
  }

  return {
    PROVIDERS: PROVIDERS,
    LABELS: LABELS,
    API_KEY_ENV: API_KEY_ENV,
    createModel: createModel,
    generate: generate,
  };
});
