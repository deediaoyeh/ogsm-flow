# OGSM Flow — 極簡個人專案管理系統

專為個人打造的護眼深色極純網頁版 OGSM 專案管理系統，零後端依賴、內建瀏覽器 IndexedDB 資料庫，並深度配合 Google Drive 檔案連結管理。

## 快速開啟方式

1. **最簡單方式**：直接雙擊資料夾內的 `index.html`，以瀏覽器（Chrome / Safari / Edge）開啟即可使用。
2. **推薦穩定方式（macOS）**：雙擊 `start.command`（或在終端機執行 `python3 -m http.server 8765`），透過 `http://localhost:8765` 開啟，確保瀏覽器 IndexedDB 資料庫穩定保存不因檔案路徑變動而重置。

## 核心功能

- **嚴格 Google 帳號驗證 ＋ Google Drive 自動雲端同步**：結合 Google Cloud OAuth 測試白名單、權杖與 Email SHA-256 雙重驗證、60 分鐘閒置自動上鎖與登出清除暫存；資料自動同步至您 Google Drive 的專屬隱藏空間（`appDataFolder`），手機與電腦無縫同步。
- **OGSM 藍圖**：一頁檢視 `O（目的）→ G（量化目標）→ S（策略）→ M（行動與衡量項目）`，支援多專案切換與即時進度計算。
- **甘特圖（日／週視圖）**：預設日視圖與週視圖自由切換，標示今日線與進度條，每一列右側皆提供 **Google Drive 檔案快速開啟色點**。
- **To-Do 清單**：同時支援「關聯到 OGSM 行動 M 的子待辦」與「不綁定專案的獨立臨時待辦」。
- **工作日誌（HTML 編輯器）**：僅顯示有紀錄的日期（不必每天強迫填寫），內建護眼深色視覺化／HTML 原始碼雙模式編輯器，可選擇關聯行動 M。
- **檢核工具**：
  - **任務檢核清單（Checklist）**：為每個 M 建立驗收條件並集中勾選追蹤。
  - **週／月定期覆盤表**：自動擷取當下 OGSM 達成率快照，記錄亮點、卡關原因與下期行動。
- **資料庫 & Google Drive 檔案庫**：查看 IndexedDB 各資料表筆數、集中篩選所有 Drive 連結，並支援 **一鍵雲端同步與匯出／匯入 JSON 備份**。

## 資料夾結構

```text
Project/
├── index.html         # 主頁面（含 PWA 與手機底部導覽）
├── style.css          # 護眼深色極簡設計系統與手機響應式樣式
├── manifest.json      # PWA 加入主畫面設定
├── icon.svg           # App 圖示
├── db.js              # IndexedDB 資料庫、Drive 類型偵測、JSON 備份與範例資料
├── store.js           # 狀態管理與 OGSM 進度計算
├── drawer.js          # 右側行動詳情抽屜與各類編輯彈窗
├── view-ogsm.js       # OGSM 藍圖視圖
├── view-gantt.js      # 日／週甘特圖視圖
├── view-todo.js       # To-Do 清單視圖
├── view-audit.js      # 檢核工具（Checklist + 定期覆盤）
├── view-database.js   # 資料庫與 Google Drive 檔案庫
├── app.js             # 主程式入口與視圖切換
├── start.command      # macOS 快捷啟動腳本
└── README.md          # 使用說明
```
