// src/App.tsx

import React from 'react';
import {HashRouter, Route, Routes} from 'react-router-dom';
import {AuthProvider} from './contexts/AuthContext';
import Nav from './components/Nav';
import Tasks from './pages/Tasks';
import MapPage from './pages/MapPage';
import './App.css';

function App() {
    // Service Worker 的初始化
// src/App.tsx（只貼出 useEffect 片段）
    React.useEffect(() => {
        if ('serviceWorker' in navigator) {
            // 在 GitHub Pages 下，PUBLIC_URL 會是 /<repo-name>
            const swUrl = `${process.env.PUBLIC_URL}/sw.js`;
            navigator.serviceWorker.register(swUrl).catch(err => {
                console.error('Service Worker registration failed:', err);
            });
        }
    }, []);


    return (
        <AuthProvider>
            <HashRouter>
                <Nav/>
                <main>
                    <Routes>
                        <Route path="/" element={<MapPage/>}/>
                        <Route path="/tasks" element={<Tasks/>}/>
                    </Routes>
                </main>
            </HashRouter>
        </AuthProvider>
    );
}

export default App;