# Vercel 靜態前端修正實測

1. 修正推送前，`https://toefl-reading-new.vercel.app/` 實際顯示已編譯的 `server/index.ts` 原始碼，而非前端頁面。
2. 推送 `vercel.json` 與 `.vercelignore` 後，Vercel 回應的首頁為 Vite `<!doctype html>` 文件，且標題為 `TOEFL WORD LAB｜Complete the Words`。
3. 以快取識別參數開啟正式網址後，實際顯示完整解鎖介面；輸入 `DEMO2026` 後，頁首與頁尾均顯示 `DEMO · 02 PASSAGES`／`2 PASSAGES`，確認公開 Vercel 部署可正常載入前端與體驗題庫。
4. 在正式網站的體驗模式使用 `CHANGE CODE` 返回解鎖頁，輸入 `TOEFL521` 後，頁首顯示 `FULL · 84 PASSAGES`、題組顯示 `1/84`、頁尾顯示 `84 PASSAGES`，確認完整題庫模式也已在 Vercel 正式部署上正常運作。
