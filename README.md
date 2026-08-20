# TOEFL WORD LAB — Complete the Words

這是一個可直接部署到 GitHub Pages 的純前端 TOEFL iBT 2026 段落填空練習網站。它使用瀏覽器內的 `sessionStorage` 儲存本次解鎖狀態，並以 `localStorage` 儲存練習進度。

## 練習解鎖

| 輸入碼 | 可用題庫 | 用途 |
|---|---:|---|
| `DEMO2026` | 2 題 | 體驗完整的段落作答、錯題檢討與自由拼寫流程。 |
| `TOEFL521` | 84 題 | 使用目前完整題庫、題組輪替、每日提醒與高錯題間隔複習。 |

> 此版本為純靜態前端。解鎖碼與題庫會包含在瀏覽器下載的前端檔案中，適合體驗與教學使用；如需真正保護付費題庫，應改由 Firebase 或其他後端在登入／付款驗證後提供題目。

## 本機開發

```bash
pnpm install
pnpm dev
```

## GitHub Pages 部署

`.github/workflows/deploy-pages.yml` 會在推送至 `main` 後自動建置並部署 `dist/public`。首次推送後，請確認儲存庫的 **Settings → Pages → Source** 已設定為 **GitHub Actions**。
