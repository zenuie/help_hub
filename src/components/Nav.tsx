// src/components/Nav.tsx
import React from 'react';
import { NavLink } from 'react-router-dom';
import './Nav.css'; // 引入我們設計的 CSS 樣式

export default function Nav() {
  return (
    <nav className="app-nav">
      <div className="nav-title">
        Help Hub
      </div>
      <div className="nav-links">
        {/*
          使用 NavLink 元件，它能自動判斷是否為啟用狀態。
          - `end` 屬性確保只有在路徑完全匹配 "/" 時，"地圖" 連結才會被標記為 active。
          - ({ isActive }) => ... 是一個函式，可以根據啟用狀態動態添加 className。
        */}
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            isActive ? 'nav-link active' : 'nav-link'
          }
        >
          地圖
        </NavLink>
        <NavLink
          to="/tasks"
          className={({ isActive }) =>
            isActive ? 'nav-link active' : 'nav-link'
          }
        >
          任務板
        </NavLink>
      </div>
    </nav>
  );
}