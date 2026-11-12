/**
 * 相容入口。C 模組本體在 modules/c/engine.js。
 * 既有測試 `node test-c-module.js` 仍從這裡載入。
 */
module.exports = require("./modules/c/engine.js");
