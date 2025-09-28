// src/App.tsx

import React from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import Nav from './components/Nav';
import Tasks from './pages/Tasks';
import MapPage from './pages/MapPage';
import './App.css';

function App() {
  // Service Worker 的初始化
  React.useEffect(() => {
    if ('serviceWorker' in navigator) {
      // 註冊 Service Worker (未來可用於 PWA 功能)
      navigator.serviceWorker.register('/sw.js').catch(err => {
        console.error('Service Worker registration failed:', err);
      });
    }

    // 2. 移除對舊同步函式的呼叫
    // setupForegroundSync();

  }, []);

  return (
    <AuthProvider>
      <HashRouter>
        <Nav />
        <main>
          <Routes>
            <Route path="/" element={<MapPage />} />
            <Route path="/tasks" element={<Tasks />} />
          </Routes>
        </main>
      </HashRouter>
    </AuthProvider>
  );
}

export default App;