// src/pages/MapPage.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { db, type Marker as BaseMarker, type MarkerType, type Task } from '../lib/db'

// 為了支援任務聯動，擴充 Marker 和 Task 型別
type TaskLinkedRichMarker = BaseMarker & { linkedTaskId?: string }
type RichMarker = TaskLinkedRichMarker // 地圖資料現在使用這個擴充型別

// 修正 LocationTask：包含所有需要的欄位 (Task 基礎 + 地理資訊 + 描述)
// 描述欄位被加入，以確保與 NeedForm.tsx 傳入的任務結構兼容。
type LocationTask = Task & {
  lat: number;
  lng: number;
  locationText: string;
  description: string; // 修正 TS2322 錯誤的關鍵
}

// 中文 ↔ 英文 類型映射（資料層存英文，UI 顯示中文）
const zhToEn: Record<string, MarkerType> = {
  '幫忙': 'block',
  '物資存放位置': 'supply',
  '危險區域': 'danger',
  '集合點': 'meeting'
}
const enToZh: Record<MarkerType, string> = {
  block: '幫忙',
  supply: '物資存放位置',
  danger: '危險區域',
  meeting: '集合點'
}
// 顏色一致（標籤＝標註顏色）
const zhColor: Record<string, string> = {
  '幫忙': '#0ea5e9',
  '物資存放位置': '#10b981',
  '危險區域': '#ef4444',
  '集合點': '#f59e0b'
}

type BBox = { minLng: number; minLat: number; maxLng: number; maxLat: number }
type PlaceOption = {
  id?: string
  label: string
  city?: string
  district?: string
  bbox: BBox
  center: [number, number]
  zoom?: number
}
type MarkerEntry = { data: RichMarker; obj: maplibregl.Marker }
// placeCache 儲存結構更新
const placeCache = new Map<string, { city?: string; district?: string; place?: string; fullAddress?: string }>()

const LAST_PLACE_KEY = 'help_hub:lastPlace'
const CUSTOM_PLACES_KEY = 'help_hub:customPlaces'

export default function MapPage() {
  // 行動視口高度
  const [vh, setVh] = useState<number>(window.innerHeight)
  useEffect(() => {
    const update = () => setVh(window.innerHeight)
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [])

  const typeOptionsZh = ['幫忙', '物資存放位置', '危險區域', '集合點'] as const
  const [currentTypeZh, setCurrentTypeZh] = useState<typeof typeOptionsZh[number]>('幫忙')
  const currentTypeZhRef = useRef(currentTypeZh)
  useEffect(() => { currentTypeZhRef.current = currentTypeZh }, [currentTypeZh])

  const mapRef = useRef<maplibregl.Map | null>(null)
  const markerIndexRef = useRef<Map<string, MarkerEntry>>(new Map())

  const [filterOpen, setFilterOpen] = useState<boolean>(false)
  const [selectedPlace, setSelectedPlace] = useState<PlaceOption | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [searchResults, setSearchResults] = useState<PlaceOption[]>([])
  const [isSearching, setIsSearching] = useState(false)

  // 常用地區（localStorage；預設加入花蓮縣光復鄉）
  const [customPlaces, setCustomPlaces] = useState<PlaceOption[]>(() => {
    try {
      const v = localStorage.getItem(CUSTOM_PLACES_KEY)
      const parsed = v ? JSON.parse(v) as PlaceOption[] : []
      const presetId = 'preset-hualien-guangfu'
      const exists = parsed.some(p => p.id === presetId || p.label.includes('花蓮縣 光復鄉'))
      if (!exists) {
        parsed.unshift({
          id: presetId,
          label: '花蓮縣 光復鄉',
          city: '花蓮縣',
          district: '光復鄉',
          bbox: { minLng: 121.36, minLat: 23.63, maxLng: 121.47, maxLat: 23.75 },
          center: [121.44, 23.70],
          zoom: 12
        })
      }
      return parsed
    } catch {
      return [{
        id: 'preset-hualien-guangfu',
        label: '花蓮縣 光復鄉',
        city: '花蓮縣',
        district: '光復鄉',
        bbox: { minLng: 121.36, minLat: 23.63, maxLng: 121.47, maxLat: 23.75 },
        center: [121.44, 23.70],
        zoom: 12
      }]
    }
  })
  useEffect(() => { localStorage.setItem(CUSTOM_PLACES_KEY, JSON.stringify(customPlaces)) }, [customPlaces])

  // 初始化地圖＋自動導航到上次區域
  useEffect(() => {
    const map = new maplibregl.Map({
      container: 'map',
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors'
          }
        },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }]
      },
      center: [121.5654, 25.0330],
      zoom: 11
    })
    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    mapRef.current = map

    // 載入既有標註（增量建立，不重繪）
    ;(async () => {
      // 讀取時斷言為擴充型別 RichMarker (TaskLinkedRichMarker)
      const list = await db.markers.toArray() as RichMarker[]
      list.forEach(m => createMarkerOnMap(m))
      // 自動導航到上次區域（若存在）
      const last = getLastPlace()
      if (last) {
        setSelectedPlace(last)
        applyPlace(last)
      }
    })()

    // 點擊地圖新增（即時）
    const clickHandler = (e: maplibregl.MapMouseEvent) => {
      const { lat, lng } = e.lngLat
      addMarkerFast(currentTypeZhRef.current, lat, lng)
    }
    map.on('click', clickHandler)

    return () => {
      map.off('click', clickHandler)
      for (const entry of markerIndexRef.current.values()) entry.obj.remove()
      markerIndexRef.current.clear()
      map.remove()
    }
  }, [])

  // 立即新增：先畫點與寫 DB，再背景補查地名（placeCache），最後增量更新 title 與可見性
  async function addMarkerFast(typeZh: string, lat: number, lng: number) {
    const typeEn: MarkerType = zhToEn[typeZh] ?? 'block'
    const id = crypto.randomUUID()
    // 初始化時，linkedTaskId 預設為 undefined
    const m: RichMarker = {
      id,
      type: typeEn,
      lat,
      lng,
      updatedAt: Date.now(),
      linkedTaskId: undefined // 新增欄位
    }
    createMarkerOnMap(m)
    await db.markers.put(m as BaseMarker) // 寫入 DB 時斷言回 BaseMarker

    // 背景補地名
    reverseGeocodeAdmin(lat, lng).then(info => {
      if (!info) return
      // 將 fullAddress 儲存到 placeCache
      placeCache.set(id, {
        city: info.city,
        district: info.district,
        place: info.place,
        fullAddress: info.fullAddress // 新增
      })
      const entry = markerIndexRef.current.get(id)
      if (entry) {
        const zhLabel = enToZh[entry.data.type]
        // 標註的 title 顯示詳細地址
        entry.obj.getElement().title =
          `${info.fullAddress || formatAdmin(info.city, info.district)} ／ ${zhLabel}（${formatCoord(lat, lng)}）`
      }
      // 視覺增量更新：可見性
      applyVisibilityByFilterEntry(id)
      // 列表更新：改用狀態標記觸發最小重繪
      bumpListVersion()
    }).catch(()=>{})
  }

  // 建立地圖標註（單筆）
  function createMarkerOnMap(m: RichMarker) {
    const map = mapRef.current
    if (!map) return
    const el = document.createElement('div')
    const zhLabel = enToZh[m.type]
    el.style.width = '22px'
    el.style.height = '22px'
    el.style.borderRadius = '50%'
    el.style.border = '2px solid #fff'
    el.style.boxShadow = '0 1px 6px rgba(0,0,0,0.3)'
    el.style.background = zhColor[zhLabel] || '#6b7280'
    const cached = placeCache.get(m.id!)
    // 使用 fullAddress 提升 title 資訊量
    el.title = `${cached?.fullAddress || formatAdmin(cached?.city, cached?.district)} ／ ${zhLabel}（${formatCoord(m.lat, m.lng)}）`

    const markerObj = new maplibregl.Marker({ element: el }).setLngLat([m.lng, m.lat]).addTo(map)
    markerIndexRef.current.set(m.id!, { data: m, obj: markerObj })
    applyVisibilityByFilterEntry(m.id!)
  }

  async function removeMarker(id: string) {
    const entry = markerIndexRef.current.get(id)
    if (entry) {
      entry.obj.remove()
      markerIndexRef.current.delete(id)
    }
    placeCache.delete(id)
    await db.markers.delete(id)
    bumpListVersion()
  }

  // 將標註轉換為任務 (包含重複檢查與標註更新)
  async function createTaskFromMarker(marker: RichMarker) {
    // 1. 檢查是否已轉過任務
    if (marker.linkedTaskId) {
      // 嘗試讀取任務確認是否存在
      const existingTask = await db.tasks.get(marker.linkedTaskId)
      if (existingTask) {
        alert(`此標註已轉為任務：「${existingTask.title}」（ID: ${marker.linkedTaskId}）。請勿重複建立。`)
      } else {
        // 任務可能已被刪除，彈出提示並詢問是否重新建立
        const confirm = window.confirm(`此標註曾轉為任務 (ID: ${marker.linkedTaskId})，但任務已不存在。要重新建立新任務嗎？`)
        if (!confirm) return
        marker.linkedTaskId = undefined // 清除舊連結
      }
      if (existingTask) return // 如果任務存在，則中止
    }

    const cached = placeCache.get(marker.id!)
    const zhLabel = enToZh[marker.type]
    // 使用 fullAddress 作為任務地點的詳細文字 (已包含所有行政區、路名、號碼)
    const fullAddress = cached?.fullAddress || formatAdmin(cached?.city, cached?.district)
    const coordText = formatCoord(marker.lat, marker.lng)

    const title = `處理：${zhLabel} @ ${fullAddress}`
    const locationText = fullAddress || coordText // 優先使用詳細地址

    const newTaskId = crypto.randomUUID()

    // 2. 建立新任務 (LocationTask)
    const newTask: LocationTask = {
      id: newTaskId,
      title: title,
      status: 'todo', // 預設為待辦
      lat: marker.lat,
      lng: marker.lng,
      locationText: locationText, // 儲存完整地址
      updatedAt: Date.now(),
      description: `來自地圖標註：${zhLabel}。` // 必須包含 description
    }

    await db.tasks.put(newTask as Task)

    // 3. 更新標註 (Marker) 的 linkedTaskId
    const updatedMarker: RichMarker = { ...marker, linkedTaskId: newTaskId, updatedAt: Date.now() }

    // 更新本地 Map 中的資料
    const entry = markerIndexRef.current.get(marker.id!)
    if (entry) {
        entry.data = updatedMarker
    }

    // 寫回 db.markers (必須寫回才能離線保存連結狀態)
    await db.markers.put(updatedMarker as BaseMarker)

    // 觸發列表重繪，以更新「轉任務」按鈕狀態
    bumpListVersion()

    // 提示使用者
    alert(`已新增任務：「${title}」。請前往「任務板」查看。`)
  }

  // 篩選：只切換顯示/隱藏（避免重建）
  function applyVisibilityByFilter() {
    const bbox = selectedPlace?.bbox
    const city = normalize(selectedPlace?.city)
    const district = normalize(selectedPlace?.district)
    for (const entry of markerIndexRef.current.values()) {
      const cached = placeCache.get(entry.data.id!)
      const show = shouldShow(entry.data, cached, bbox, city, district)
      entry.obj.getElement().style.display = show ? '' : 'none'
    }
    bumpListVersion()
  }
  function applyVisibilityByFilterEntry(id: string) {
    const entry = markerIndexRef.current.get(id)
    if (!entry) return
    const bbox = selectedPlace?.bbox
    const city = normalize(selectedPlace?.city)
    const district = normalize(selectedPlace?.district)
    const cached = placeCache.get(id)
    const show = shouldShow(entry.data, cached, bbox, city, district)
    entry.obj.getElement().style.display = show ? '' : 'none'
  }
  function shouldShow(m: RichMarker, cached?: { city?: string; district?: string }, bbox?: BBox | null, city?: string, district?: string) {
    let inBox = true
    if (bbox) {
      inBox = m.lng >= bbox.minLng && m.lng <= bbox.maxLng && m.lat >= bbox.minLat && m.lat <= bbox.maxLat
    }
    let matchAdmin = true
    if (city || district) {
      matchAdmin =
        (!city || normalize(cached?.city) === city) &&
        (!district || normalize(cached?.district) === district)
    }
    return inBox && matchAdmin
  }

  // 搜尋（結果點選：導航＋詢問加入常用）
  async function searchPlace(query: string) {
    const q = query.trim()
    if (!q) { setSearchResults([]); return }
    try {
      setIsSearching(true)
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(q)}&countrycodes=tw&addressdetails=1&limit=10`
      const res = await fetch(url, { headers: { 'Accept-Language': 'zh-TW' } })
      const data = await res.json() as any[]
      const options: PlaceOption[] = data.map(d => {
        const a = d.address || {}
        const city = a.city || a.county || a.state || a.town || a.village
        const district = a.city_district || a.district || a.suburb || a.town || a.village
        const label = [city, district].filter(Boolean).join(' ')
        const bbox = toBBox(d.boundingbox)
        const center: [number, number] = [Number(d.lon), Number(d.lat)]
        return { label: label || d.display_name, city, district, center, zoom: 13, bbox } as PlaceOption
      }).filter(o => o.city || o.district).slice(0, 8)
      setSearchResults(options)
    } catch {
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }
  function onPickSearchResult(p: PlaceOption) {
    applyPlace(p)
    saveLastPlace(p)
    const shouldAdd = window.confirm(`要將「${p.label}」加入常用地區嗎？`)
    if (shouldAdd) {
      setCustomPlaces(prev => {
        const dup = prev.some(x =>
          normalize(x.label) === normalize(p.label) &&
          Math.abs(x.center[0] - p.center[0]) < 1e-6 &&
          Math.abs(x.center[1] - p.center[1]) < 1e-6
        )
        if (dup) return prev
        return [{ ...p, id: crypto.randomUUID() }, ...prev]
      })
    }
  }

  // 套用地區＋儲存上次區域
  function applyPlace(p: PlaceOption) {
    setSelectedPlace(p)
    const map = mapRef.current
    if (!map) return
    if (p.zoom && p.center) {
      map.flyTo({ center: p.center, zoom: p.zoom })
    } else {
      const bounds = new maplibregl.LngLatBounds([p.bbox.minLng, p.bbox.minLat], [p.bbox.maxLng, p.bbox.maxLat])
      map.fitBounds(bounds, { padding: 16 })
    }
    applyVisibilityByFilter()
  }
  function clearFilter() {
    setSelectedPlace(null)
    setSearchResults([])
    setSearchInput('')
    const map = mapRef.current
    if (map) map.flyTo({ center: [121.5654, 25.0330], zoom: 11 })
    applyVisibilityByFilter()
    saveLastPlace(null)
  }

  function removeCustom(id?: string) {
    if (!id) return
    setCustomPlaces(prev => prev.filter(x => x.id !== id))
  }

  // 存取上次區域（localStorage）
  function saveLastPlace(p: PlaceOption | null) {
    try {
      if (!p) {
        localStorage.removeItem(LAST_PLACE_KEY)
      } else {
        localStorage.setItem(LAST_PLACE_KEY, JSON.stringify(p))
      }
    } catch {}
  }
  function getLastPlace(): PlaceOption | null {
    try {
      const v = localStorage.getItem(LAST_PLACE_KEY)
      return v ? JSON.parse(v) as PlaceOption : null
    } catch {
      return null
    }
  }

  // 背景反地理編碼 (優化：提取並格式化完整地址)
  async function reverseGeocodeAdmin(lat: number, lng: number): Promise<{ city?: string; district?: string; place?: string; fullAddress?: string } | undefined> {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1` // 提高 zoom 獲取更詳細地址
      const res = await fetch(url, { headers: { 'Accept-Language': 'zh-TW' } })
      if (!res.ok) return undefined
      const data = await res.json()
      const a = data?.address || {}

      // 定義優先級，越高級的行政區越靠前
      const city = a.city || a.county || a.state // 縣市 (最高級別)
      const district = a.city_district || a.district || a.suburb || a.town || a.village // 區鄉鎮
      const neighbourhood = a.neighbourhood // 社區/鄰里
      const road = a.road // 路名
      const houseNumber = a.house_number // 號碼

      // 構建完整地址：[縣市] [區鄉鎮] [鄰里/社區] [路名] [號碼]
      const addressParts = [city, district, neighbourhood, road, houseNumber].filter(Boolean)
      const fullAddress = addressParts.join('') === '' ? undefined : addressParts.join('')

      // 構建一般地點描述：[縣市] [區鄉鎮] [路名]
      const place = [city, district, road].filter(Boolean).join(' ')

      return {
        city,
        district,
        place,
        fullAddress // 完整地址 (例: 花蓮縣光復鄉中山路88號)
      }
    } catch {
      return undefined
    }
  }

  // 列表效能優化：以狀態版本觸發最小重繪，列表資料用 memo 計算
  const [listVersion, setListVersion] = useState(0)
  function bumpListVersion() { setListVersion(v => v + 1) }
  const visibleEntries = useMemo(() => {
    // 僅取目前可見的標註（元素 display !== none），避免大量計算
    const arr: MarkerEntry[] = []
    for (const entry of markerIndexRef.current.values()) {
      if (entry.obj.getElement().style.display !== 'none') {
        arr.push(entry)
      }
    }
    // 依更新時間排序，較新的在前
    arr.sort((a, b) => (b.data.updatedAt ?? 0) - (a.data.updatedAt ?? 0))
    return arr
    // 依 listVersion 觸發重算
  }, [listVersion])

  // 工具與樣式
  function toBBox(b: any): BBox {
    const minLat = Number(b[0]), maxLat = Number(b[1]), minLng = Number(b[2]), maxLng = Number(b[3])
    return { minLng, minLat, maxLng, maxLat }
  }
  function normalize(s?: string) { return (s || '').trim() }
  function formatAdmin(city?: string, district?: string) {
    return `${city || ''}${district ? ' ' + district : ''}`.trim() || '未知地區'
  }
  function formatCoord(lat: number, lng: number) {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
  }

  const headerStyle: React.CSSProperties = {
    display: 'flex', gap: 8, padding: 8, alignItems: 'center', overflowX: 'auto', whiteSpace: 'nowrap'
  }
  const segBtnStyle = (active: boolean, zh: string): React.CSSProperties => ({
    padding: '8px 12px',
    borderRadius: 999,
    border: `2px solid ${zhColor[zh]}`,
    background: active ? `${zhColor[zh]}22` : '#fff',
    color: '#111',
    fontSize: 14
  })
  const filterToggleStyle: React.CSSProperties = {
    padding: '10px 12px', border: '1px solid #ddd', borderRadius: 8, background: '#f9fafb'
  }
  const filterPanelStyle: React.CSSProperties = {
    padding: 8, border: '1px solid #eee', borderRadius: 8, marginTop: 8
  }
  const searchInputStyle: React.CSSProperties = {
    flex: 1, padding: '10px', border: '1px solid #ddd', borderRadius: 8, fontSize: 16
  }
  const searchBtnStyle: React.CSSProperties = {
    padding: '10px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 16, background: '#fff'
  }
  const bigListBtnStyle: React.CSSProperties = {
    width: '100%', textAlign: 'left' as const, padding: '12px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff'
  }

  return (
    <div style={{ padding: 8 }}>
      {/* 類型切換（與標註同色） */}
      <div style={headerStyle}>
        {typeOptionsZh.map(t => (
          <button key={t} onClick={() => setCurrentTypeZh(t)} style={segBtnStyle(currentTypeZh === t, t)}>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 999, background: zhColor[t], marginRight: 8, verticalAlign: 'middle' }} />
            {t}
          </button>
        ))}
        <button onClick={() => {
          const c = mapRef.current?.getCenter()
          if (c) addMarkerFast(currentTypeZh, c.lat, c.lng)
        }} style={{ marginLeft: 8, ...segBtnStyle(false, currentTypeZh) }}>
          + 在中心新增
        </button>
      </div>

      {/* 篩選（合併搜尋與常用；可收合） */}
      <div style={{ marginTop: 8 }}>
        <button onClick={() => setFilterOpen(v => !v)} style={filterToggleStyle}>
          {filterOpen ? '收合地區篩選 ▲' : '展開地區篩選 ▼'}
        </button>
        {filterOpen && (
          <div style={filterPanelStyle}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                placeholder="輸入鄉鎮市區或路名，如：光復鄉、信義區、板橋區"
                style={searchInputStyle}
              />
              <button onClick={() => searchPlace(searchInput)} disabled={isSearching} style={searchBtnStyle}>
                {isSearching ? '搜尋中…' : '搜尋'}
              </button>
            </div>
            {searchResults.length > 0 && (
              <ul style={{ marginTop: 8, display: 'grid', gap: 8, maxHeight: 240, overflow: 'auto' }}>
                {searchResults.map((r, idx) => (
                  <li key={idx}>
                    <button onClick={() => onPickSearchResult(r)} style={bigListBtnStyle}>{r.label}</button>
                  </li>
                ))}
              </ul>
            )}

            {customPlaces.length > 0 && (
              <>
                <div style={{ fontWeight: 600, marginTop: 12, marginBottom: 6 }}>常用地區</div>
                <ul style={{ display: 'grid', gap: 8 }}>
                  {customPlaces.map(p => (
                    <li key={p.id || p.label}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => { applyPlace(p); saveLastPlace(p) }} style={bigListBtnStyle}>{p.label}</button>
                        <button onClick={() => removeCustom(p.id)} style={{ ...bigListBtnStyle, width: 100 }}>刪除</button>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <div style={{ marginTop: 8 }}>
              <button onClick={clearFilter} style={searchBtnStyle}>清除篩選</button>
            </div>
          </div>
        )}
      </div>

      {/* 地圖（動態高度） */}
      <div id="map" style={{ height: `${Math.max(320, vh - 400)}px`, border: '1px solid #ccc', borderRadius: 12, marginTop: 8 }} />

      {/* 標註列表（增量、僅可見） */}
      <div style={{ marginTop: 8 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>
          標註列表（{selectedPlace ? `已套用：${selectedPlace.label}` : '未篩選'}；點 ❌ 刪除／📝 轉任務）
        </div>
        <ul style={{ display: 'grid', gap: 8 }}>
          {visibleEntries.map(entry => {
            const cached = placeCache.get(entry.data.id!)
            const zhLabel = enToZh[entry.data.type]
            const isLinked = !!entry.data.linkedTaskId // 檢查是否已連結任務

            // 優先顯示完整地址，若無則顯示行政區+座標
            const adminText = formatAdmin(cached?.city, cached?.district)
            const addressDisplay = cached?.fullAddress
              ? `地址：${cached.fullAddress}`
              : `${adminText}／座標：${formatCoord(entry.data.lat, entry.data.lng)}`

            return (
              <li key={entry.data.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button onClick={() => removeMarker(entry.data.id!)} title="刪除此標註" style={{ padding: '8px 10px', border: '1px solid #ddd', borderRadius: 8 }}>❌</button>
                <div style={{ padding: '8px 10px', border: '1px solid #ddd', borderRadius: 8, flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>
                    <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 999, background: zhColor[zhLabel], marginRight: 8, verticalAlign: 'middle' }} />
                    {zhLabel}
                    {isLinked && <span style={{ marginLeft: 8, fontSize: 12, color: '#10b981' }}>已轉任務 (ID: {entry.data.linkedTaskId?.substring(0, 4)}...)</span>}
                  </div>
                  <div style={{ color: '#6b7280', fontSize: 13, marginTop: 4 }}>
                    {addressDisplay}
                  </div>
                </div>
                {/* 轉任務按鈕：如果已連結，則改變樣式和行為 */}
                <button
                  onClick={() => createTaskFromMarker(entry.data)}
                  title={isLinked ? `已轉為任務 (${entry.data.linkedTaskId})，點擊提醒` : "以此標註為地點建立任務"}
                  style={{
                    padding: '8px 10px',
                    border: isLinked ? '1px solid #10b981' : '1px solid #ddd',
                    borderRadius: 8,
                    background: isLinked ? '#dcfce7' : '#e0f2f1', // light green if linked
                    color: isLinked ? '#10b981' : '#111'
                  }}
                >
                  {isLinked ? '✅ 已轉任務' : '📝 轉任務'}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}