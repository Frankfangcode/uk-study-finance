/**
 * 給驗收測試用的最小假 DOM。讀真的 index.html 取得欄位與預設值，
 * 再用 vm 跑真的 app.js，不需要瀏覽器或額外套件。
 */
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var ROOT = path.join(__dirname, "..");

function attr(tag, name) {
  var m = new RegExp("\\b" + name + '="([^"]*)"').exec(tag);
  return m ? m[1] : null;
}

function makeElement(id) {
  var listeners = {};
  return {
    id: id,
    value: "",
    checked: false,
    innerHTML: "",
    classList: { toggle: function () {}, add: function () {}, remove: function () {} },
    setAttribute: function () {},
    getAttribute: function () { return null; },
    addEventListener: function (type, fn) {
      (listeners[type] = listeners[type] || []).push(fn);
    },
    fire: function (type) {
      (listeners[type] || []).forEach(function (fn) {
        fn({ preventDefault: function () {}, target: this });
      });
    },
  };
}

function parseElements(html) {
  var elements = {};
  var re = /<(input|select|section|div|form)\b[^>]*\bid="([^"]+)"[^>]*>/g;
  var m;
  while ((m = re.exec(html))) {
    var el = makeElement(m[2]);
    if (m[1] === "input") {
      el.value = attr(m[0], "value") || "";
      el.checked = /\schecked\b/.test(m[0]);
    }
    if (m[1] === "select") {
      var body = html.slice(re.lastIndex, html.indexOf("</select>", re.lastIndex));
      var options = body.match(/<option\b[^>]*>/g) || [];
      var chosen = options.filter(function (tag) { return /\sselected\b/.test(tag); })[0] || options[0];
      el.value = chosen ? attr(chosen, "value") : "";
    }
    elements[m[2]] = el;
  }
  return elements;
}

function loadApp() {
  var html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  var elements = parseElements(html);
  var docListeners = {};
  var document = {
    getElementById: function (id) {
      if (!elements[id]) throw new Error("index.html 沒有 #" + id);
      return elements[id];
    },
    querySelectorAll: function () { return []; },
    addEventListener: function (type, fn) {
      (docListeners[type] = docListeners[type] || []).push(fn);
    },
  };
  var sandbox = {
    document: document,
    location: { hash: "#c" },
    history: { replaceState: function () {} },
    scrollTo: function () {},
    addEventListener: function () {},
    AModule: require("../modules/a/aggregate.js"),
    BModule: require("../modules/b/programmes.js"),
    CModule: require("../modules/c/engine.js"),
    DModule: require("../modules/d/payments.js"),
    DProducts: require("../modules/d/products.js"),
    EModule: require("../modules/e/review.js"),
    SharedConstants: require("../shared/constants.js"),
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  // 跟 index.html 一樣的順序：先引導流程，再 app.js。
  vm.runInContext(fs.readFileSync(path.join(ROOT, "modules/guided/flow.js"), "utf8"), sandbox, { filename: "modules/guided/flow.js" });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "app.js"), "utf8"), sandbox, { filename: "app.js" });

  return {
    /**
     * 對 document 送一個委派事件（引導流程的欄位是動態畫出來的，沒有固定 id）。
     * attrs 是被操作元素的屬性，props 是 value／checked。
     */
    dispatch: function (type, attrs, props) {
      attrs = attrs || {};
      var target = Object.assign({ value: "", checked: false }, props || {});
      target.getAttribute = function (name) {
        return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
      };
      target.closest = function (selector) {
        var m = /^\[([\w-]+)\]$/.exec(selector);
        return m && Object.prototype.hasOwnProperty.call(attrs, m[1]) ? target : null;
      };
      (docListeners[type] || []).forEach(function (fn) {
        fn({ type: type, target: target, preventDefault: function () {} });
      });
    },
    /** 改一個欄位並觸發 change，跟使用者操作一樣會重畫。 */
    set: function (id, value) {
      var el = document.getElementById(id);
      if (typeof value === "boolean") el.checked = value;
      else el.value = String(value);
      el.fire("change");
    },
    /** 真的 input.value 一律是字串，這裡照樣回字串。 */
    value: function (id) { return String(document.getElementById(id).value); },
    html: function (id) { return document.getElementById(id).innerHTML; },
  };
}

module.exports = { loadApp: loadApp };
