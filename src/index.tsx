import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Nav from './components/Nav'
import Tasks from './pages/Tasks'
import NeedForm from './pages/NeedForm'
import MapPage from './pages/MapPage'
import './App.css'
import { setupForegroundSync } from './lib/sync'

function App() {
  React.useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
    }
    setupForegroundSync()
  }, [])
  return (
    <BrowserRouter>
      <Nav />
      <Routes>
        <Route path="/" element={<Tasks />} />
        <Route path="/need" element={<NeedForm />} />
        <Route path="/map" element={<MapPage />} />
      </Routes>
    </BrowserRouter>
  )
}
createRoot(document.getElementById('root')!).render(<App />)
