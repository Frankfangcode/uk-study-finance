# 留學財務長 AI：英國碩士試算

給台灣學生估英國碩士要花多少、錢從哪來、學校收不收某種付款方式。這一版是可以打開的網站模擬，只做比較，不保證錄取、簽證或核貸。

範圍先只做英國（2026-11-12 的拍板）。正式 Demo 還沒放行。

線上位置：<https://frankfangcode.github.io/uk-study-finance/>

## 怎麼打開

不用安裝、不用建置。GitHub Pages 從倉庫根目錄提供靜態檔，`index.html` 留在根目錄，並有 `.nojekyll`。

本機直接用瀏覽器打開 `index.html`，或在倉庫根目錄起一個靜態伺服器：

```bash
python3 -m http.server 8080
```

然後打開 `http://localhost:8080/`。預設開在「引導流程」`#g`，原本五個模組分頁是 `#a`、`#b`、`#c`、`#d`、`#e`。

## 引導流程（預設頁）

給學生一步一步走完：個人資料 → 選校與待確認項目 → 成本計算 → 合規檢查。程式在 `modules/guided/flow.js`，只管步驟、欄位驗證和畫面；數字全部來自既有的 `A.buildStudentPlan`（內含 `C.calculatePlan`）、`C.simulateScenarios`、`E.review`、`A.summarize`。

- 可以一次選多個學程，各自計算、各自審查。
- 兩校的校方強制保險目前都是待確認。第 2 步的「待確認項目」讓學生自己選：(a) 已向校方確認無此費用、(b) 已確認金額、(c) 仍待確認。(a)、(b) 一定要填來源（網址或說明，例如校方回信），沒填就擋下、維持待確認。待確認不會被預設成 0。
- 學生填的來源在結果和 E 審查裡一律標「學生自報，非本站查證」。E 的 `review` 會多回 `self_reported` 清單。
- E 不是 PASS 時，總成本、缺口、貸款、月付一律顯示「尚未確定」，並列出還缺什麼、怎麼補。
- 「一鍵填入示範用虛構個案」會填入虛構的個人資料與「示範：虛構來源」，每一步都有紅色虛線框標示是虛構示範，可以一鍵清除。
- 資料只留在瀏覽器記憶體，重新整理就清空。

## 怎麼跑測試

需要 Node.js。沒有額外套件。

```bash
node test-c-module.js
node tests/acceptance.js
```

或：

```bash
npm test
```

`test-c-module.js` 是原本的 C 模組測試。`tests/acceptance.js` 對規格裡的驗收數字，以及 B／D／E 的交接。`tests/scenarios.js` 對 C 的情境模擬（匯率 ±、已核定獎學金落空、最壞情況）。`tests/guided-flow.js` 對引導流程（待確認怎麼擋、學生自報怎麼標、示範個案、步驟切換）。後兩個由 `tests/acceptance.js` 最後載入，所以跑驗收就會一併跑到；也可以單獨跑 `node tests/scenarios.js`、`node tests/guided-flow.js`。GitHub Actions（`.github/workflows/test.yml`）在 push 和 pull request 時跑 `test-c-module.js` 和 `tests/acceptance.js`，情境與引導流程測試跟著後者執行。

## 情境模擬（C 頁）

C 頁右邊的「情境模擬」表回答一個問題：英鎊兌台幣變動 10%，或已核定的獎學金落空時，還款壓力怎麼變。這是演練，不是預測。

- 入口是 `CModule.simulateScenarios(plan, { fxShockPct, awardedScholarships, reviewVerdict })`，吃 `calculatePlan` 的輸出，不改原方案。
- 情境：基準、英鎊 +N%、英鎊 −N%、已核定獎學金落空、最壞情況（英鎊 +N% 且落空）。N 預設 10，可在 C 頁調整；留空或 0 不會被當成 10。
- 只有已核定的獎學金才有落空與最壞情況。未核定的本來就不計入資金。英鎊計價的減免，台幣價值跟著情境匯率重算。
- 必要費用還有待確認，或 E 審查不是 PASS 時，每個情境的總成本、缺口、貸款、月付都是 null，畫面只列已知小計與可用資金的變化，並標「尚未確定」。

## 模組地圖

| 模組 | 頁面 | 程式 | 做什麼 |
| --- | --- | --- | --- |
| 引導流程 | `#g` | `modules/guided/flow.js` | 四個步驟的學生流程。不自己算數字，只呼叫 A／B／C／E |
| A 彙整 | `#a` | `modules/a/aggregate.js`、`shared/contract.js` | 發布整案快照、學生彙整頁。只讀 C 同一個 `snapshot_id` |
| B 選校與獎學金 | `#b` | `modules/b/programmes.js` | 格拉斯哥、愛丁堡示例：學費、訂金、獎學金 |
| C 成本與貸款 | `#c` | `modules/c/engine.js` | 總成本、缺口、貸款、月付、情境模擬。根目錄 `engine.js` 只是相容入口 |
| D 支付比較 | `#d` | `modules/d/payments.js` | 訂金與學費管道分開，用 C 的待付餘額。沒報價不排名 |
| E 審查 | `#e` | `modules/e/review.js` | 來源、假設、待確認。未知不能當 0 |
| 共用常數 | — | `shared/constants.js` | 每個已核對數字和網址 |

頁面殼在 `index.html`、`styles.css`、`app.js`。計算和資料不依賴 DOM，瀏覽器和 Node 都能載入。

短的規格摘要在 `docs/spec.md`。

## 數字怎麼標

- 有公開頁的數字，畫面上會附來源網址和查閱日。
- 匯率、預備金、生活費、機票、利率是**假設**，可以改。
- 還沒查到的（校保、平台對台灣的費率）是**待確認**，金額是 null，不會填 0。
- 已知小計不是確定總額。校保還是待確認時，確定總額和確定缺口留空。

## 貢獻

用 pull request 改你負責的資料夾。請維持既有測試通過，並為你新加的規則補一個 Node 斷言。不要把協作表原文或信箱放進倉庫。

姓名以協作表協調頁的聯絡名單為準：Andy／陳致安、Hunter／曾尉庭、Frank／方澤享、Wenz／何則文。C 的搭檔在各分頁署名 Irene｜Atlas；規格摘要裡的中文名是陳愛愛，匯出的分頁沒有再寫一次中文名。

| 誰 | 角色 | 請改這裡 | 介面 |
| --- | --- | --- | --- |
| Andy／陳致安 | A 統籌與整合 | `modules/a/`、`shared/contract.js`、彙整頁 | `buildStudentPlan`、`publish`、`summarize`。費用快照必填欄缺一就拒收 |
| Hunter／曾尉庭 | B 選校與獎學金 | `modules/b/programmes.js` | `buildOutput(programId)`。新學程用新的 `program_id`，不要覆蓋舊快照。訂金標已含並指向學費 |
| Frank／方澤享 | D 支付，並實作 C | `modules/d/payments.js`、`modules/c/engine.js` | D：`compare({ school_id, fee_purpose, amount_due })`。C：`calculatePlan`、`toScenario`。沒有報價就讓 `payer_total` 維持 null |
| Irene｜Atlas（陳愛愛） | C 驗收預期 | `tests/acceptance.js`、`test-c-module.js` | 補輸入和預期。計算入口在 `modules/c/engine.js`，改行為前先跟 Frank 對過，既有 13 項測試要維持通過 |
| Wenz／何則文 | E 合規與協調 | `modules/e/review.js` | `review`、`presentLine`。可以擋學生畫面，不要改別人的紀錄，也不要在這裡宣布正式放行 |

新的英國學程：在 B 加一筆有來源的資料，讓 A 用同一個 `buildStudentPlan` 吃進去。新的付款管道：在 D 加一筆，`school_acceptance` 用核准／不接受／待確認，費率未知就全部 null。

暫停、先不要做的：IHS 與校方預算表的差額、圖書館罰款、Flywire 狀態日期、退款基數怎麼分支。
