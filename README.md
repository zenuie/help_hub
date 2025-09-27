
---

# Help Hub 救災協作平台

[![GitHub Actions CI/CD](https://github.com/zenuie/help_hub/actions/workflows/deploy.yml/badge.svg)](https://github.com/zenuie/help_hub/actions/workflows/deploy.yml)

Help Hub 是一個輕量級、離線優先的救災協作地圖應用程式。它旨在幫助使用者在網路連線不穩定的災區，透過地圖標註回報需求、危險區域或資源位置，並將這些資訊轉換為可追蹤的任務，方便救災團隊或志工進行協調。

**線上預覽 (Live Demo):** [https://zenuie.github.io/help_hub/](https://zenuie.github.io/help_hub/)

## 核心功能

*   **地圖標註**：使用者可以直接在地圖上點擊，快速新增四種類型的標註：
    *   **幫忙** (`#0ea5e9`): 需要人力支援或有障礙物。
    *   **物資存放位置** (`#10b981`): 可用的物資或補給點。
    *   **危險區域** (`#ef4444`): 需要避開的危險地點。
    *   **集合點** (`#f59e0b`): 人員集合或報到的地點。
*   **標註轉任務**：地圖上的任何標註都可以一鍵轉換為待辦任務，並自動帶入地點資訊，方便後續追蹤與分配。
*   **任務板 (Task Board)**：一個獨立的任務管理介面，用於查看、更新所有已建立任務的狀態（待辦、進行中、已完成、暫緩）。
*   **需求回報表單**：提供一個結構化的表單，讓使用者詳細回報需求（如醫療、食物、避難所），提交後會同步建立地圖標註和任務。
*   **離線優先 (Offline First)**：所有標註、任務和草稿都儲存在瀏覽器的 IndexedDB 中。即使在沒有網路的環境下，使用者依然可以新增標註、管理任務，待網路恢復後再進行同步（同步功能為未來擴充方向）。
*   **地點搜尋與篩選**：可以透過關鍵字搜尋台灣的鄉鎮市區，快速定位地圖，並將搜尋過的地區儲存為常用地點，方便快速切換。

## 技術棧

*   **前端框架**: [React](https://reactjs.org/) (使用 Create React App 搭配 TypeScript)
*   **地圖引擎**: [MapLibre GL JS](https://maplibre.org/)
*   **地圖圖資**: [OpenStreetMap](https://www.openstreetmap.org/)
*   **地理編碼服務**: [Nominatim](https://nominatim.openstreetmap.org/) (用於將座標轉換為地址)
*   **本地端資料庫**: [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) (透過 [Dexie.js](https://dexie.org/) 封裝，簡化操作)
*   **CI/CD**: [GitHub Actions](https://github.com/features/actions) (自動化建置與部署到 GitHub Pages)

## 專案結構

```
src
├── lib
│   └── db.ts          # Dexie.js 資料庫設定與型別定義
├── pages
│   ├── MapPage.tsx    # 地圖頁面：核心的地圖、標註、篩選功能
│   ├── Tasks.tsx      # 任務板頁面：顯示與管理任務列表
│   └── NeedForm.tsx   # 需求回報頁面：回報需求的表單
└── ...
```

## 如何在本地端運行

請確認您的電腦已安裝 [Node.js](https://nodejs.org/) (建議 v18 或以上版本) 和 npm。

1.  **複製專案庫**
    ```bash
    git clone https://github.com/zenuie/help_hub.git
    cd help_hub
    ```

2.  **安裝依賴套件**
    ```bash
    npm install
    ```
    (若您偏好使用 `npm ci` 進行更嚴格的安裝，也可以使用)

3.  **啟動本地開發伺服器**
    ```bash
    npm start
    ```

4.  **開啟瀏覽器**
    在瀏覽器中開啟 `http://localhost:3000` 即可看到應用程式。

## 部署

此專案已設定好使用 GitHub Actions 自動部署到 GitHub Pages。當有新的 commit 推送到 `main` 分支時，會自動觸發以下流程：

1.  執行 `npm run build` 建置專案的靜態檔案。
2.  使用 `peaceiris/actions-gh-pages` action 將 `build` 資料夾的內容推送到 `gh-pages` 分支。
3.  GitHub Pages 會自動將 `gh-pages` 分支的內容發佈到公開網站。

## 未來可改進方向

- [ ] **即時同步**：透過 WebSocket 或 WebRTC 讓多個使用者之間的地圖標註與任務狀態可以即時同步。
- [ ] **使用者認證**：加入使用者登入系統，以便追蹤是誰建立的標註與任務。
- [ ] **PWA 功能強化**：加入 Service Worker，提供更完整的離線體驗與推播通知。
- [ ] **任務指派**：在任務板中加入指派任務給特定使用者或團隊的功能。
- [ ] **篩選與排序**：提供更多維度的篩選與排序功能（例如：依據嚴重性、任務狀態、標註類型）。

## 授權

本專案採用 [MIT License](LICENSE)。