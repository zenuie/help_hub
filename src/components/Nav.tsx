// src/components/Nav.tsx
import React from 'react'
import { Link, useLocation } from 'react-router-dom'

export default function Nav() {
  const location = useLocation()
  const pathname = (location as any).pathname
  return (
    <nav style={{ display:'flex', gap:12, padding:12, borderBottom:'1px solid #ddd' }}>
      <Link to="/" style={{ fontWeight: pathname==='/' ? 'bold' : 'normal' }}>任務板</Link>
      <Link to="/need" style={{ fontWeight: pathname==='/need' ? 'bold' : 'normal' }}>需求表單</Link>
      <Link to="/map" style={{ fontWeight: pathname==='/map' ? 'bold' : 'normal' }}>地圖</Link>
    </nav>
  )
}
