// src/App.test.tsx

import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

// 寫一個有意義的測試：檢查應用程式是否成功渲染了導覽列中的「地圖」連結
test('renders navigation link for map', () => {
  // 渲染 App 元件
  render(<App />);
  
  // 尋找畫面上文字為「地圖」的連結元素
  // getByRole('link', { name: /地圖/i }) 是更語意化的查詢方式
  const linkElement = screen.getByRole('link', { name: /地圖/i });
  
  // 斷言：確認該元素存在於文件中
  expect(linkElement).toBeInTheDocument();
});