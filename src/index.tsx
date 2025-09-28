// src/index.tsx

import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App'; // 從 App.tsx 匯入主元件
import './index.css';   // 保留全域樣式

// 找到 root DOM 節點
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  // 將 App 元件渲染進去
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}