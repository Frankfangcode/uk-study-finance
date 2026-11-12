# 留學財務長 AI：英國碩士費用試算

給台灣學生看的靜態網站模擬。它把英國碩士的學費、訂金、獎學金、總成本、資金缺口、貸款試算和付款限制放在同一頁比較。

它只提供可追溯的比較，不保證核貸，也不代替學生決定。有來源的數字旁邊有網址；小組還沒拍板的標成「假設」；查不到的標成「待確認」，不會被當成 0。

目前範圍只有英國。正式 Demo 還沒放行。

## 怎麼打開

不需要安裝套件，也不需要建置。

- 用瀏覽器直接打開倉庫根目錄的 `index.html`
- 或在倉庫根目錄執行 `python3 -m http.server`，再開 `http://localhost:8000`
- GitHub Pages 從 `main` 的根目錄提供這個網站，根目錄有 `.nojekyll`

## 怎麼跑測試

需要 Node.js。沒有額外依賴。

```bash
node test-c-module.js
node tests/test-acceptance.js
```

`node tests/run.js` 會連著跑上面兩份。推上去之後，GitHub Actions（`.github/workflows/test.yml`）也會跑它們。

## 模組地圖

| 模組 | 頁面 | 程式 | 做什麼 |
| --- | --- | --- | --- |
| A 彙整 | 彙整 | `modules/a/aggregate.js` | 發布整案快照，把 B／C／D／E 收成學生看的一頁 |
| B 選校 | 選校與獎學金 | `modules/b/programmes.js` | 英國學程、學費、訂金、獎學金 |
| C 資金 | 成本與貸款 | `modules/c/engine.js` | 總成本、缺口、貸款、月付、負擔比 |
| D 付款 | 付款比較 | `modules/d/payments.js` | 訂金與學費管道是否可行；沒有報價就不排名 |
| E 審查 | 審查 | `modules/e/review.js` | 來源、假設、待確認；擋下未知當 0 |
| 共用 | — | `shared/contract.js` | 費用身分與必填欄 |

根目錄的 `engine.js` 只是把舊測試轉到 `modules/c/engine.js`。`test-c-module.js` 仍從這裡讀計算引擎。

頁面腳本的載入順序是：`shared/contract.js`、C、B、D、E、A、`js/app.js`。

## 資料怎麼交接

一筆費用至少要有 `fee_id`、學校、學程、入學季、幣別、`amount`、`inclusion_flag`、`included_in_fee_id`、`source_ref`。`inclusion_flag` 用「已含／另計／待確認／無此費用」。

- 已含：金額不算進總成本，而且要指向同一份快照裡的另計項目
- 另計：有非負金額和來源，才加進總成本
- 待確認：`amount` 必須是 `null`
- 無此費用：要有寫得清楚的零費證據，不然不能填 0

A 發布 `plan_snapshot` 之後，C 只讀那一版。較新的費用若還沒發布，不會混進目前的總額。缺了 `amount` 欄的更新會被拒收，不會把缺欄補成 `null`。

C 回給 A 的情境把總成本、缺口、貸款額、月付分開。`complete` 不是 true 時，確定總額、確定缺口、貸款額都是 `null`。已知小計可以顯示，但頁面上會寫明它不是確定總額。

校方減免若已經反映在淨學費，不會再從資金扣一次。未核定的獎學金不會先減學費。

D 比較學費時用 C 的 `balance_due`。訂金付了沒有如果未知，餘額是 `null`，不會假設已付或未付。

## CONTRIBUTING

用 pull request 改。不要把試算表原文或同學的內部討論直接放進倉庫。新的數字寫進對應模組，並在旁邊留下公開來源網址。

跑過上面的測試再送。若測試沒過，先不要把未知填成 0 來讓總額變好看。

| 誰 | 角色 | 請改這裡 | 對外介面 |
| --- | --- | --- | --- |
| Andy／陳致安 | A 統籌與整合 | `modules/a/aggregate.js` | `submitFee`、`publish`、`buildStudentPlan` |
| Hunter／曾尉庭 | B 選校與獎學金 | `modules/b/programmes.js` | `getProgramme`、`resolveFunding` |
| Frank／方澤享 | C 的程式入口，同時負責 D | `modules/c/engine.js`、`modules/d/payments.js` | `calculatePlan`、`compare` |
| Irene | C 的驗收預期 | `test-c-module.js`、`tests/test-acceptance.js` | 補預期，不改確定公式的口徑 |
| Wenz／何則文 | E 合規與協調 | `modules/e/review.js` | `review`、`screenLines`、`CONSTANTS` |

姓名對過協作表的協調頁（E-20261109-coord-a4d1）：Andy／陳致安、Hunter／曾尉庭、Frank／方澤享、Wenz／何則文。那一列沒有 Irene 的中文姓名；整理規格時寫過陳愛愛。倉庫先用 Irene，請本人確認後再補中文名。C 的實作入口依 2026-11-12 的範圍決定，改由 Frank／方澤享負責。

加一所學校：在 B 的學程清單加一筆，學費、訂金、校保都要有來源。校保若還沒查到，`amount` 維持 `null`。然後在 D 依 `school_id` 分開寫訂金管道和學費管道。

加一個付款管道：學校是否接受、前提、來源網址要分開寫。手續費沒有公開報價就留 `null`，不要為了排出最便宜而填一個費率。臺銀個人網銀的費率只代表那個渠道，不能當成學校已經收得到的報價。

加一個常數：放進 E 的 `CONSTANTS`。採用的值要有 `https://` 來源；待確認的 `value` 是 `null`。

這輪先不要做的邊角：IHS 校方預算表和 GOV.UK 的差額怎麼對帳、圖書館罰款、Flywire 頁面日期、退款基數要不要含訂金。除非它們擋住主流程。

更短的規則說明在 `docs/spec.md`。
