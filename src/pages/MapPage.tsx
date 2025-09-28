// src/pages/MapPage.tsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import maplibregl, { LngLatLike } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import {
  subscribeToMarkers,
  deleteMarker,
  updateMarker,
  createReport,
  addTask,
  FirestoreMarker
} from '../services/dataSync';
import { useAuth } from '../contexts/AuthContext';
import { Task, TaskStatus, MarkerType } from '../lib/db';

type RichMarker = FirestoreMarker;
type NewTaskData = Omit<Task, 'id' | 'updatedAt' | 'linkedMarkerId'>;
type NewItemForm = { lat: number; lng: number; type: MarkerType; description: string; };

const zhToEn: Record<string, MarkerType> = { '幫忙': 'block', '物資存放位置': 'supply', '危險區域': 'danger', '集合點': 'meeting' };
const enToZh: Record<MarkerType, string> = { block: '幫忙', supply: '物資存放位置', danger: '危險區域', meeting: '集合點' };
const zhColor: Record<string, string> = { '幫忙': '#0ea5e9', '物資存放位置': '#10b981', '危險區域': '#ef4444', '集合點': '#f59e0b' };

type BBox = { minLng: number; minLat: number; maxLng: number; maxLat: number };
type PlaceOption = { id?: string; label: string; city?: string; district?: string; bbox: BBox; center: [number, number]; zoom?: number; };
type MarkerEntry = { data: RichMarker; obj: maplibregl.Marker };

const LAST_PLACE_KEY = 'help_hub:lastPlace';
const CUSTOM_PLACES_KEY = 'help_hub:customPlaces';

export default function MapPage() {
  const { user } = useAuth();

  const [allMarkers, setAllMarkers] = useState<RichMarker[]>([]);
  const [isDataLoading, setIsDataLoading] = useState(true);

  const [vh, setVh] = useState<number>(window.innerHeight);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const markerIndexRef = useRef<Map<string, MarkerEntry>>(new Map());
  const [filterOpen, setFilterOpen] = useState<boolean>(false);
  const [selectedPlace, setSelectedPlace] = useState<PlaceOption | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [searchResults, setSearchResults] = useState<PlaceOption[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [newItemForm, setNewItemForm] = useState<Partial<NewItemForm>>({});

  const [customPlaces, setCustomPlaces] = useState<PlaceOption[]>([]);

  useEffect(() => {
    try {
      const v = localStorage.getItem(CUSTOM_PLACES_KEY);
      const parsed = v ? JSON.parse(v) as PlaceOption[] : [];
      if (!parsed.some(p => p.label.includes('花蓮縣 光復鄉'))) {
        parsed.unshift({
          id: 'preset-hualien-guangfu', label: '花蓮縣 光復鄉', city: '花蓮縣', district: '光復鄉',
          bbox: { minLng: 121.36, minLat: 23.63, maxLng: 121.47, maxLat: 23.75 },
          center: [121.44, 23.70], zoom: 12
        });
      }
      setCustomPlaces(parsed);
    } catch { }
  }, []);

  useEffect(() => {
    localStorage.setItem(CUSTOM_PLACES_KEY, JSON.stringify(customPlaces))
  }, [customPlaces]);

  useEffect(() => {
    const update = () => setVh(window.innerHeight);
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  // 訂閱標註資料（即時）
  useEffect(() => {
    setIsDataLoading(true);
    const unsubscribe = subscribeToMarkers((markersFromDb) => {
      setAllMarkers(markersFromDb);
      setIsDataLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 初始化地圖，並在 load 後標記 mapReady
  useEffect(() => {
    const map = new maplibregl.Map({
      container: 'map',
      style: {
        version: 8,
        sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap' } },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }]
      },
      center: [121.5654, 25.0330],
      zoom: 11
    });
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    mapRef.current = map;

    const last = getLastPlace();
    if (last) {
      setSelectedPlace(last);
      applyPlace(last, map);
    }

    // 點擊地圖開啟新增表單
    const clickHandler = (e: maplibregl.MapMouseEvent) => {
      const { lat, lng } = e.lngLat;
      setNewItemForm({ lat, lng, type: 'block', description: '' });
      setIsModalOpen(true);
    };
    map.on('click', clickHandler);

    // 等地圖載入完成
    map.on('load', () => {
      setMapReady(true);
      // 若沒有選擇地區但已有資料，飛到第一筆資料
      setTimeout(() => {
        if (!selectedPlace && allMarkers.length > 0) {
          const m = allMarkers[0];
          map.flyTo({ center: [m.lng, m.lat] as LngLatLike, zoom: 13 });
        }
      }, 0);
    });

    return () => {
      map.off('click', clickHandler);
      map.remove();
      setMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createMarkerOnMap = useCallback((m: RichMarker) => {
    const map = mapRef.current;
    if (!map || !m.id) return;

    const el = document.createElement('div');
    const zhLabel = enToZh[m.type];
    Object.assign(el.style, {
      width: '22px',
      height: '22px',
      borderRadius: '50%',
      border: '2px solid #fff',
      boxShadow: '0 1px 6px rgba(0,0,0,0.3)',
      background: zhColor[zhLabel] || '#6b7280',
      cursor: 'pointer',
      zIndex: '10'
    });
    el.title = `${m.fullAddress || formatAdmin(m.city, m.district)} ／ ${zhLabel}（${formatCoord(m.lat, m.lng)}）`;

    const markerObj = new maplibregl.Marker({ element: el })
      .setLngLat([m.lng, m.lat] as LngLatLike)
      .addTo(map);

    markerIndexRef.current.set(m.id, { data: m, obj: markerObj });
  }, []);

  const shouldShow = useCallback((m: RichMarker) => {
    const bbox = selectedPlace?.bbox;
    const city = selectedPlace?.city ? normalize(selectedPlace.city) : undefined;
    const district = selectedPlace?.district ? normalize(selectedPlace.district) : undefined;

    // 經緯度必須是有限數字
    const validCoord = Number.isFinite(m.lat) && Number.isFinite(m.lng);
    if (!validCoord) return false;

    const inBox = !bbox || (m.lng >= bbox.minLng && m.lng <= bbox.maxLng && m.lat >= bbox.minLat && m.lat <= bbox.maxLat);
    if (!city && !district) return inBox;

    const matchAdmin = (!city || normalize(m.city) === city) && (!district || normalize(m.district) === district);
    return inBox && matchAdmin;
  }, [selectedPlace]);

  // 同步 UI（建立/更新/移除標註；並控制顯示/隱藏）
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;

    const markerIndex = markerIndexRef.current;
    const dataIds = new Set(allMarkers.map(m => m.id));

    // 新增或更新
    allMarkers.forEach(markerData => {
      if (!markerIndex.has(markerData.id)) {
        createMarkerOnMap(markerData);
      } else {
        const entry = markerIndex.get(markerData.id)!;
        entry.data = markerData;
      }
    });

    // 移除資料中已不存在的標註
    markerIndex.forEach((entry, id) => {
      if (!dataIds.has(id)) {
        entry.obj.remove();
        markerIndex.delete(id);
      }
    });

    // 控制顯示與隱藏
    markerIndex.forEach(entry => {
      const show = shouldShow(entry.data);
      entry.obj.getElement().style.display = show ? '' : 'none';
    });

    // 若尚未選地區，且有資料，且鏡頭仍在預設中心，試著聚焦到最新資料
    if (!selectedPlace && allMarkers.length > 0) {
      const latest = [...allMarkers].sort((a, b) => b.updatedAt.toMillis() - a.updatedAt.toMillis())[0];
      mapRef.current.flyTo({ center: [latest.lng, latest.lat] as LngLatLike, zoom: 13 });
    }
  }, [allMarkers, shouldShow, createMarkerOnMap, mapReady, selectedPlace]);

  async function handleFormSubmit() {
    const form = newItemForm;
    if (!form.lat || !form.lng || !form.type || !form.description?.trim()) {
      alert('請填寫完整資訊！');
      return;
    }

    const geoInfo = await reverseGeocodeAdmin(form.lat, form.lng);
    const locationText = geoInfo?.fullAddress || `座標: ${form.lat.toFixed(5)}, ${form.lng.toFixed(5)}`;
    const title = `${enToZh[form.type]}: ${geoInfo?.district || '未知區域'}`;

    const markerData = {
      type: form.type,
      lat: form.lat, lng: form.lng,
      city: geoInfo?.city || '', district: geoInfo?.district || '', fullAddress: geoInfo?.fullAddress || '',
      creatorId: user?.uid || null,
    };

    const taskData: NewTaskData = {
      title, status: 'todo' as TaskStatus,
      lat: form.lat, lng: form.lng,
      locationText,
      description: form.description,
      creatorId: user?.uid || null,
      creatorName: user?.displayName || '匿名使用者',
    };

    try {
      await createReport(markerData, taskData);
      setIsModalOpen(false);
      setNewItemForm({});
      alert(`回報已提交！資料將會同步顯示。`);
    } catch (error) {
      alert('提交失敗');
      console.error(error);
    }
  }

  async function handleRemoveMarker(id: string) {
    if (window.confirm('確定要刪除這個標註嗎？')) {
      await deleteMarker(id);
    }
  }

  async function handleCreateTaskFromMarker(marker: RichMarker) {
    if (marker.linkedTaskId) {
      alert(`此標註已轉為任務。`);
      return;
    }
    const zhLabel = enToZh[marker.type];
    const fullAddress = marker.fullAddress || formatAdmin(marker.city, marker.district);
    const title = `處理：${zhLabel} @ ${fullAddress}`;
    const taskData = {
      title, status: 'todo' as TaskStatus, lat: marker.lat, lng: marker.lng,
      locationText: fullAddress || formatCoord(marker.lat, marker.lng),
      description: `來自地圖標註：${zhLabel}。`,
    };
    try {
      const taskRef = await addTask({ ...taskData, creatorId: user?.uid || null, creatorName: user?.displayName || '匿名使用者' });
      if (marker.id) {
        await updateMarker(marker.id, { linkedTaskId: taskRef.id });
      }
      alert(`已新增任務：「${title}」。`);
    } catch (error) {
      alert('轉為任務失敗');
      console.error(error);
    }
  }

  const visibleEntries = useMemo(() => {
    return allMarkers
      .filter(shouldShow)
      .sort((a, b) => b.updatedAt.toMillis() - a.updatedAt.toMillis());
  }, [allMarkers, shouldShow]);

  async function searchPlace(query: string) {
    const q = query.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(q)}&countrycodes=tw&addressdetails=1&limit=10`;
      const res = await fetch(url, { headers: { 'Accept-Language': 'zh-TW' } });
      const data = await res.json() as any[];
      setSearchResults(data.map(d => {
        const a = d.address || {}, city = a.city || a.county || a.state, district = a.city_district || a.district || a.suburb;
        return {
          label: [city, district].filter(Boolean).join(' ') || d.display_name,
          city,
          district,
          center: [Number(d.lon), Number(d.lat)],
          zoom: 13,
          bbox: toBBox(d.boundingbox)
        } as PlaceOption;
      }).filter(o => o.city || o.district).slice(0, 8));
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }

  function onPickSearchResult(p: PlaceOption) {
    applyPlace(p);
    saveLastPlace(p);
    if (window.confirm(`要將「${p.label}」加入常用地區嗎？`)) {
      setCustomPlaces(prev => !prev.some(x => normalize(x.label) === normalize(p.label)) ? [{ ...p, id: crypto.randomUUID() }, ...prev] : prev);
    }
  }

  function applyPlace(p: PlaceOption, mapInstance = mapRef.current) {
    setSelectedPlace(p);
    if (!mapInstance) return;
    if (p.zoom && p.center) {
      mapInstance.flyTo({ center: p.center as LngLatLike, zoom: p.zoom });
    } else {
      mapInstance.fitBounds(new maplibregl.LngLatBounds([p.bbox.minLng, p.bbox.minLat], [p.bbox.maxLng, p.bbox.maxLat]), { padding: 16 });
    }
  }

  function clearFilter() {
    setSelectedPlace(null);
    setSearchResults([]);
    setSearchInput('');
    mapRef.current?.flyTo({ center: [121.5654, 25.0330], zoom: 11 });
    saveLastPlace(null);
  }

  function removeCustom(id?: string) {
    if (id) setCustomPlaces(prev => prev.filter(x => x.id !== id));
  }

  function saveLastPlace(p: PlaceOption | null) {
    try {
      p ? localStorage.setItem(LAST_PLACE_KEY, JSON.stringify(p)) : localStorage.removeItem(LAST_PLACE_KEY);
    } catch { }
  }

  function getLastPlace(): PlaceOption | null {
    try {
      const v = localStorage.getItem(LAST_PLACE_KEY);
      return v ? JSON.parse(v) : null;
    } catch {
      return null;
    }
  }

  async function reverseGeocodeAdmin(lat: number, lng: number): Promise<{ city?: string; district?: string; place?: string; fullAddress?: string } | undefined> {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
      const res = await fetch(url, { headers: { 'Accept-Language': 'zh-TW' } });
      if (!res.ok) return undefined;
      const data = await res.json(), a = data?.address || {};
      const city = a.city || a.county || a.state, district = a.city_district || a.district || a.suburb || a.town || a.village;
      const addressParts = [city, district, a.neighbourhood, a.road, a.house_number].filter(Boolean);
      return { city, district, place: [city, district, a.road].filter(Boolean).join(' '), fullAddress: addressParts.join('') || undefined };
    } catch {
      return undefined;
    }
  }

  function toBBox(b: any): BBox {
    const [minLat, maxLat, minLng, maxLng] = b.map(Number);
    return { minLng, minLat, maxLng, maxLat };
  }

  function normalize(s?: string) {
    return (s || '').trim();
  }

  function formatAdmin(city?: string, district?: string) {
    return `${city || ''}${district ? ' ' + district : ''}`.trim() || '未知地區';
  }

  function formatCoord(lat: number, lng: number) {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }

  const filterToggleStyle: React.CSSProperties = { padding: '10px 12px', border: '1px solid #ddd', borderRadius: 8, background: '#f9fafb', cursor: 'pointer', width: '100%' };
  const filterPanelStyle: React.CSSProperties = { padding: 8, border: '1px solid #eee', borderRadius: 8, marginTop: 8 };
  const searchInputStyle: React.CSSProperties = { flex: 1, padding: '10px', border: '1px solid #ddd', borderRadius: 8, fontSize: 16 };
  const searchBtnStyle: React.CSSProperties = { padding: '10px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 16, background: '#fff', cursor: 'pointer' };
  const bigListBtnStyle: React.CSSProperties = {
    width: '100%',
    textAlign: 'left' as const,
    padding: '12px',
    border: '1px solid #e5e7eb',
    borderRadius: 8,
    background: '#fff',
    cursor: 'pointer'
  };
  const modalOverlayStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  };
  const modalContentStyle: React.CSSProperties = {
    background: 'white',
    padding: '20px',
    borderRadius: '8px',
    width: '90%',
    maxWidth: '500px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
  };

  return (
    <div style={{ padding: 8 }}>
      {isModalOpen && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <h2>新增標註點</h2>
            <p style={{ fontSize: 14, color: '#666', marginTop: 0 }}>
              座標: {newItemForm.lat?.toFixed(5)}, {newItemForm.lng?.toFixed(5)}
            </p>
            <label>類別：</label>
            <select
              value={newItemForm.type}
              onChange={e => setNewItemForm(p => ({ ...p, type: e.target.value as MarkerType }))}
              style={{ width: '100%', padding: 8, fontSize: 16 }}
            >
              {Object.entries(enToZh).map(([en, zh]) => <option key={en} value={en}>{zh}</option>)}
            </select>
            <label style={{ marginTop: 12 }}>簡要描述：</label>
            <textarea
              value={newItemForm.description ?? ''}
              onChange={e => setNewItemForm(p => ({ ...p, description: e.target.value }))}
              style={{ width: 'calc(100% - 18px)', minHeight: 80, padding: 8, fontSize: 16 }}
              placeholder="請簡要描述情況，這將成為任務內容..."
            />
            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button
                onClick={() => setIsModalOpen(false)}
                style={{ background: '#eee', border: '1px solid #ccc', padding: '8px 16px', borderRadius: 6, cursor: 'pointer' }}
              >
                取消
              </button>
              <button
                onClick={handleFormSubmit}
                style={{
                  background: '#10b981',
                  color: 'white',
                  border: '1px solid #059669',
                  fontWeight: 'bold',
                  padding: '8px 16px',
                  borderRadius: 6,
                  cursor: 'pointer'
                }}
              >
                提交
              </button>
            </div>
          </div>
        </div>
      )}

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
                placeholder="輸入鄉鎮市區，如：光復鄉"
                style={searchInputStyle}
              />
              <button onClick={() => searchPlace(searchInput)} disabled={isSearching} style={searchBtnStyle}>
                {isSearching ? '搜尋中…' : '搜尋'}
              </button>
            </div>

            {searchResults.length > 0 && (
              <ul style={{ marginTop: 8, display: 'grid', gap: 8, maxHeight: 240, overflow: 'auto', padding: 0, listStyle: 'none' }}>
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
                <ul style={{ display: 'grid', gap: 8, padding: 0, listStyle: 'none' }}>
                  {customPlaces.map(p => (
                    <li key={p.id || p.label}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={() => {
                            applyPlace(p);
                            saveLastPlace(p);
                          }}
                          style={bigListBtnStyle}
                        >
                          {p.label}
                        </button>
                        <button onClick={() => removeCustom(p.id)} style={{ ...bigListBtnStyle, width: 'auto', flexShrink: 0 }}>
                          刪除
                        </button>
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

      <div
        id="map"
        // 為排除高度問題，保底固定高度；仍保留原邏輯但下限 400
        style={{ height: `${Math.max(400, vh - 400)}px`, border: '1px solid #ccc', borderRadius: 12, marginTop: 8, position: 'relative' }}
      />

      <div style={{ marginTop: 8 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>標註列表 ({selectedPlace ? `篩選：${selectedPlace.label}` : '未篩選'})</div>
        {isDataLoading ? (
          <p>正在載入標註資料...</p>
        ) : (
          <ul style={{ display: 'grid', gap: 8, padding: 0, listStyle: 'none' }}>
            {visibleEntries.map((data) => {
              const zhLabel = enToZh[data.type];
              const isLinked = !!data.linkedTaskId;
              return (
                <li key={data.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button
                    onClick={() => handleRemoveMarker(data.id)}
                    title="刪除此標註"
                    style={{ padding: '8px 10px', border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer' }}
                  >
                    ❌
                  </button>
                  <div style={{ padding: '8px 10px', border: '1px solid #ddd', borderRadius: 8, flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>
                      <span
                        style={{
                          display: 'inline-block',
                          width: 10,
                          height: 10,
                          borderRadius: 999,
                          background: zhColor[zhLabel],
                          marginRight: 8,
                          verticalAlign: 'middle'
                        }}
                      />
                      {zhLabel}
                      {isLinked && <span style={{ marginLeft: 8, fontSize: 12, color: '#10b981' }}>(已轉任務)</span>}
                    </div>
                    <div style={{ color: '#6b7280', fontSize: 13, marginTop: 4 }}>
                      {data.fullAddress ? `地址：${data.fullAddress}` : `${formatAdmin(data.city, data.district)}／座標：${formatCoord(data.lat, data.lng)}`}
                    </div>
                  </div>
                  <button
                    onClick={() => handleCreateTaskFromMarker(data)}
                    disabled={isLinked}
                    title={isLinked ? `已轉為任務` : "以此標註為地點建立任務"}
                    style={{
                      padding: '8px 10px',
                      border: `1px solid ${isLinked ? '#10b981' : '#ddd'}`,
                      borderRadius: 8,
                      background: isLinked ? '#dcfce7' : '#f3f4f6',
                      color: isLinked ? '#10b981' : '#111',
                      cursor: isLinked ? 'default' : 'pointer',
                      width: '90px'
                    }}
                  >
                    {isLinked ? '✅ 已轉' : '📝 轉任務'}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
