// src/components/Nav.tsx
import React from 'react';
import {NavLink} from 'react-router-dom';
import './Nav.css'; // 引入我們設計的 CSS 樣式

export default function Nav() {
    return (
        <nav className="app-nav">
            <div className="nav-title">
                Help Hub
            </div>
            <div className="nav-links">
                <a
                    href="https://sites.google.com/view/guangfu250923/home?authuser=0"
                    className="nav-link" // 沿用現有的樣式，讓它看起來一致
                    target="_blank"      // 確保在新分頁中開啟，不會離開您的應用程式
                    rel="noopener noreferrer" // 增加安全性
                >
                    主站
                </a>
                <NavLink
                    to="/"
                    end
                    className={({isActive}) =>
                        isActive ? 'nav-link active' : 'nav-link'
                    }
                >
                    地圖
                </NavLink>
                <NavLink
                    to="/tasks"
                    className={({isActive}) =>
                        isActive ? 'nav-link active' : 'nav-link'
                    }
                >
                    任務板
                </NavLink>
            </div>
        </nav>
    );
}