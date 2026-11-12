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

然後打開 `http://localhost:8080/#a`。五個分頁是 `#a`、`#b`、`#c`、`#d`、`#e`。

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

`test-c-module.js` 是原本的 C 模組測試。`tests/acceptance.js` 對規格裡的驗收數字，以及 B／D／E 的交接。GitHub Actions（`.github/workflows/test.yml`）在 push 和 pull request 時跑這兩支。

## 模組地圖

| 模組 | 頁面 | 程式 | 做什麼 |
| --- | --- | --- | --- |
| A 彙整 | `#a` | `modules/a/aggregate.js`、`shared/contract.js` | 發布整案快照、學生彙整頁。只讀 C 同一個 `snapshot_id` |
| B 選校與獎學金 | `#b` | `modules/b/programmes.js` | 格拉斯哥、愛丁堡示例：學費、訂金、獎學金 |
| C 成本與貸款 | `#c` | `modules/c/engine.js` | 總成本、缺口、貸款、月付。根目錄 `engine.js` 只是相容入口 |
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
