# TOEFL WORD LAB — Complete the Words

這是一個可直接部署到 GitHub Pages 的純前端 TOEFL iBT 2026 段落填空練習網站。它使用瀏覽器內的 `sessionStorage` 儲存本次解鎖狀態，並以 `localStorage` 儲存練習進度。

## 練習解鎖

網站提供兩種由課程提供者發放授權碼的練習範圍：體驗授權可使用 2 組段落填空，完整授權可使用 84 組題庫、題組輪替、每日提醒與高錯題間隔複習。公開介面與本 README 不會列出任何可用授權碼。

> 此版本為純靜態前端。若需要真正保護付費題庫，應改由 Firebase 或其他後端在登入／付款驗證後提供題目，而非將完整題庫包含在瀏覽器下載的檔案中。

## 本機開發

```bash
pnpm install
pnpm dev
```

## GitHub Pages 部署

`.github/workflows/deploy-pages.yml` 會在推送至 `main` 後自動建置並部署 `dist/public`。首次推送後，請確認儲存庫的 **Settings → Pages → Source** 已設定為 **GitHub Actions**。
