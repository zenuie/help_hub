# Help Hub

一個以地圖為核心的社群協作工具，支援即時標註與任務追蹤。使用 MapLibre 顯示地圖、Firebase Firestore 進行資料同步、Firebase Auth 進行使用者登入。專案同時提供 GitHub Actions 建置流程，透過 Repository Secrets 安全注入環境變數。

## 功能概述
- 地圖標註：在地圖點擊新增「幫忙／物資存放／危險區域／集合點」等類別的標註。
- 任務連動：新增標註時自動建立對應任務（批次寫入，彼此互相連結）。
- 即時同步：標註與任務透過 Firestore 即時更新，所有使用者同步看到最新狀態。
- 地區篩選：支援搜尋與常用地區管理，快速聚焦特定區域。
- 離線支援：Firestore 啟用 IndexedDB 持久化（支援多數瀏覽器）。

## 技術棧
- 前端：React + TypeScript
- 地圖：MapLibre GL
- 後端（BaaS）：Firebase（Firestore、Auth）
- 部署：GitHub Pages（示例），可改用 Vercel/Cloudflare
- CI/CD：GitHub Actions（以 Repository Secrets 生成 .env）

## 專案結構（精簡）
```
src/
  App.tsx                # 路由與版面
  index.tsx              # 入口
  components/Nav.tsx     # 導覽列
  pages/
    MapPage.tsx          # 地圖頁（新增標註／地區篩選／列表顯示）
    Tasks.tsx            # 任務板（即時訂閱／狀態更新／刪除）
  contexts/AuthContext.tsx  # Google 登入／登出／使用者狀態
  services/dataSync.ts   # Firestore 存取與批次操作（subscribe/add/update/delete/createReport）
  lib/
    db.ts                # UI 層共用型別（Task/Marker）
    firebase.ts          # Firebase 初始化與持久化、匯出 collections
    useLocalStore.ts     # 本地儲存 hook
```

## 本機開發
1. 安裝相依套件
   ```
   npm ci
   ```
2. 建立環境變數檔（Create React App）
   在專案根目錄建立 `.env`，內容格式如下：
   ```
   REACT_APP_FIREBASE_API_KEY=你的API_KEY
   REACT_APP_FIREBASE_AUTH_DOMAIN=你的AUTH_DOMAIN
   REACT_APP_FIREBASE_PROJECT_ID=你的PROJECT_ID
   REACT_APP_FIREBASE_STORAGE_BUCKET=你的STORAGE_BUCKET
   REACT_APP_FIREBASE_MESSAGING_SENDER_ID=你的SENDER_ID
   REACT_APP_FIREBASE_APP_ID=你的APP_ID
   REACT_APP_FIREBASE_MEASUREMENT_ID=你的MEASUREMENT_ID  # 若有使用 Analytics
   ```
3. 啟動開發伺服器
   ```
   npm start
   ```

## 部署與 CI（GitHub Actions + GitHub Pages）
1. 設定 Repository Secrets（GitHub → Settings → Secrets and variables → Actions → New repository secret）
   逐筆新增：
   - FIREBASE_API_KEY → 你的 API Key
   - FIREBASE_AUTH_DOMAIN → 你的 Auth Domain
   - FIREBASE_PROJECT_ID → 你的 Project ID
   - FIREBASE_STORAGE_BUCKET → 你的 Storage Bucket
   - FIREBASE_MESSAGING_SENDER_ID → 你的 Sender ID
   - FIREBASE_APP_ID → 你的 App ID
   - FIREBASE_MEASUREMENT_ID → 你的 Measurement ID（若使用）

2. 在 `.github/workflows/deploy.yml` 加入建置與部署流程（重點在 .env 生成步驟）
   ```
   name: Build and Deploy

   on:
     push:
       branches:
         - main
     workflow_dispatch:

   jobs:
     build-and-deploy:
       runs-on: ubuntu-latest
       steps:
         - name: Checkout
           uses: actions/checkout@v4

         - name: Setup Node
           uses: actions/setup-node@v4
           with:
             node-version: '18'
             cache: 'npm'

         - name: Install deps
           run: npm ci

         - name: Create .env file
           run: |
             cat > .env << 'EOF'
             REACT_APP_FIREBASE_API_KEY=${{ secrets.FIREBASE_API_KEY }}
             REACT_APP_FIREBASE_AUTH_DOMAIN=${{ secrets.FIREBASE_AUTH_DOMAIN }}
             REACT_APP_FIREBASE_PROJECT_ID=${{ secrets.FIREBASE_PROJECT_ID }}
             REACT_APP_FIREBASE_STORAGE_BUCKET=${{ secrets.FIREBASE_STORAGE_BUCKET }}
             REACT_APP_FIREBASE_MESSAGING_SENDER_ID=${{ secrets.FIREBASE_MESSAGING_SENDER_ID }}
             REACT_APP_FIREBASE_APP_ID=${{ secrets.FIREBASE_APP_ID }}
             REACT_APP_FIREBASE_MEASUREMENT_ID=${{ secrets.FIREBASE_MEASUREMENT_ID }}
             EOF

         - name: Build
           run: npm run build

         - name: Deploy to GitHub Pages
           uses: peaceiris/actions-gh-pages@v3
           with:
             github_token: ${{ secrets.GITHUB_TOKEN }}
             publish_dir: ./build
   ```

3. 注意事項
   - `.env` 不要提交到版本庫（請確認 `.gitignore` 有忽略）。
   - 前端環境變數會被打包到瀏覽器端，屬於公開資訊；安全性請以 Firestore Security Rules 落實。
   - 目前使用 HashRouter，部署到 GitHub Pages 不需額外 404 fallback。若改 BrowserRouter，需處理 404.html 導向。
   - `App.tsx` 有註冊 `sw.js`。若要保留，請在 `public` 目錄提供最小 Service Worker：
     ```
     // public/sw.js
     self.addEventListener('install', () => self.skipWaiting());
     self.addEventListener('activate', () => self.clients.claim());
     self.addEventListener('fetch', () => {});
     ```

## 開發細節
- Firestore 資料模型
  - markers：{ id, type, lat, lng, city, district, fullAddress, creatorId, linkedTaskId, updatedAt(Timestamp) }
  - tasks：{ id, title, status, lat?, lng?, locationText?, description?, creatorId?, creatorName?, linkedMarkerId?, updatedAt(Timestamp) }
- 即時訂閱
  - `subscribeToMarkers` / `subscribeToTasks` 以 `onSnapshot` 監聽資料。
  - 排序以 `updatedAt.toMillis()` 於 UI 層處理。
- 批次建立回報
  - `createReport(markerData, taskData)` 使用 `writeBatch` 同時建立 Marker 與 Task，互相寫入對方的 ID。
- 經緯度與顯示
  - Map 預設中心台北；載入資料後會自動 flyTo 最新標註，亦可使用地區篩選快速聚焦。
  - 標註樣式依中文類別顏色顯示，並顯示地址或座標提示。

## 待辦與建議
- 強化 Firestore Security Rules：限制未登入使用者的寫入；僅允許作者更新／刪除自己的資料。
- 逆地理查詢節流與重試：Nominatim API 有速率限制，建議增加節流或快取。
- PWA 完整化：完善 Service Worker 快取策略與離線頁面。
- 任務看板：未來可擴充拖拉、指派、留言等功能。

## 授權
MIT License