#!/usr/bin/env node
/**
 * 一次跑既有 C 測試與驗收測試。
 */
var path = require("path");
require(path.join(__dirname, "..", "test-c-module.js"));
require(path.join(__dirname, "test-acceptance.js"));
if (process.exitCode) {
  console.error("\nTest suite failed.");
  process.exit(process.exitCode);
}
console.log("\nTest suite passed.");
