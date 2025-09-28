// src/components/KMLImporterWithUpload.tsx
import React from 'react';
import maplibregl, { Map } from 'maplibre-gl';
import { kml as kmlToGeoJSON } from 'togeojson';
import { createReport } from '../services/dataSync';
import { TaskStatus, MarkerType } from '../lib/db';


const enToZh: Record<MarkerType, string> = {
  block: '幫忙/障礙',
  supply: '物資站',
  danger: '危險區域',
  meeting: '集合/避難',
  water: '供水站',
  medical: '醫療站',
  traffic: '交通資訊',
  info: '一般資訊',
};

/**
 * **升級版：智慧分類函式**
 * 根據 KML Feature 的屬性（名稱、描述、樣式）來猜測其 MarkerType。
 * 新增了對「供水」、「醫療」、「交通」等關鍵字的識別。
 */
function guessMarkerTypeFromFeature(feature: any): MarkerType {
  const props = feature?.properties || {};
  const name = String(props.name || '').toLowerCase();
  const description = String(props.description || '').toLowerCase();
  const combinedText = `${name} ${description}`;

  // 規則順序很重要，優先匹配更具體的類別
  if (combinedText.includes('醫療') || combinedText.includes('medical')) {
    return 'medical';
  }
  if (combinedText.includes('加水') || combinedText.includes('供水') || combinedText.includes('water')) {
    return 'water';
  }
  if (combinedText.includes('物資') || combinedText.includes('supply') || combinedText.includes('補給') || combinedText.includes('resource')) {
    return 'supply';
  }
  if (combinedText.includes('交通') || combinedText.includes('塞車') || combinedText.includes('禁止進入') || combinedText.includes('traffic')) {
    return 'traffic';
  }
  if (combinedText.includes('危險') || combinedText.includes('danger') || combinedText.includes('溢流')) {
    return 'danger';
  }
  if (combinedText.includes('集合') || combinedText.includes('避難') || combinedText.includes('住宿') || combinedText.includes('shelter') || combinedText.includes('meeting') || combinedText.includes('休息站')) {
    return 'meeting';
  }
  if (combinedText.includes('志工') || combinedText.includes('人力') || combinedText.includes('幫忙') || combinedText.includes('求助') || combinedText.includes('障礙') || combinedText.includes('廢棄物') || combinedText.includes('block') || combinedText.includes('help')) {
    return 'block';
  }

  // 如果都沒匹配到，回傳 'info' 作為一個通用的預設值
  return 'info';
}


async function reverseGeocodeAdmin(lat: number, lng: number): Promise<{ city?: string; district?: string; fullAddress?: string } | undefined> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'zh-TW' } });
    if (!res.ok) return undefined;
    const data = await res.json();
    const a = data?.address || {};
    const city = a.city || a.county || a.state;
    const district = a.city_district || a.district || a.suburb || a.town || a.village;
    const addressParts = [city, district, a.neighbourhood, a.road, a.house_number].filter(Boolean);
    const fullAddress = addressParts.join('') || undefined;
    return { city, district, fullAddress };
  } catch {
    return undefined;
  }
}

interface KMLImporterWithUploadProps {
  mapRef: React.RefObject<Map | null>;
  throttleMs?: number;
  buttonStyle?: React.CSSProperties;
  inputStyle?: React.CSSProperties;
  dedupeByCoordEpsilon?: number;
}

export default function KMLImporterWithUpload({
  mapRef,
  throttleMs = 250,
  buttonStyle,
  inputStyle,
  dedupeByCoordEpsilon = 0.00001
}: KMLImporterWithUploadProps) {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [isImporting, setIsImporting] = React.useState(false);

  async function handleImportKMLFile(file: File) {
    setIsImporting(true);
    try {
      const map = mapRef.current;
      if (!map) {
        alert('地圖尚未初始化');
        return;
      }

      const text = await file.text();
      const xml = new DOMParser().parseFromString(text, 'text/xml');
      const geojson = kmlToGeoJSON(xml);

      removeExistingKmlSourceAndLayers(map, 'kml-geojson');
      map.addSource('kml-geojson', { type: 'geojson', data: geojson });

      map.addLayer({
        id: 'kml-points',
        type: 'circle',
        source: 'kml-geojson',
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': 6,
          'circle-color': '#0ea5e9',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff'
        }
      } as any);

      map.addLayer({
        id: 'kml-lines',
        type: 'line',
        source: 'kml-geojson',
        filter: ['==', ['geometry-type'], 'LineString'],
        paint: { 'line-width': 3, 'line-color': '#ef4444' }
      } as any);

      map.addLayer({
        id: 'kml-polygons',
        type: 'fill',
        source: 'kml-geojson',
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: { 'fill-color': '#10b981', 'fill-opacity': 0.3 }
      } as any);

      const bbox = getGeoJSONBounds(geojson);
      if (bbox) map.fitBounds(bbox, { padding: 16 });

      const points = (geojson?.features || []).filter((f: any) => f?.geometry?.type === 'Point');
      if (points.length === 0) {
        alert('KML 內未找到點位特徵，已僅顯示線/面圖層');
        return;
      }

      const uniquePoints = dedupeByEpsilon(points, dedupeByCoordEpsilon);

      let success = 0;
      let failed = 0;

      for (let i = 0; i < uniquePoints.length; i++) {
        const f = uniquePoints[i];
        try {
          const [lng, lat] = f.geometry.coordinates;
          if (!isFinite(lng) || !isFinite(lat)) {
            failed++;
            continue;
          }
          const name = safeStr(f.properties?.name);
          const description = safeStr(f.properties?.description);

          // 使用升級後的智慧分類函式
          const guessedType = guessMarkerTypeFromFeature(f);

          if (i > 0 && throttleMs > 0) {
            await delay(throttleMs);
          }

          const admin = await reverseGeocodeAdmin(lat, lng);

          const markerData = {
            type: guessedType,
            lat,
            lng,
            city: admin?.city || '',
            district: admin?.district || '',
            fullAddress: admin?.fullAddress || name || '',
            creatorId: null
          };

          const title = name || `${enToZh[guessedType]}：${admin?.district || '未知區域'}`;
          const taskData = {
            title,
            status: 'todo' as TaskStatus,
            lat,
            lng,
            locationText: admin?.fullAddress || name || `座標: ${formatCoord(lat, lng)}`,
            description: description || `來自 KML 匯入的點位。`,
            creatorId: null,
            creatorName: 'KML 匯入'
          };

          await createReport(markerData, taskData);
          success++;
        } catch (e) {
          console.error('匯入單筆失敗', e);
          failed++;
        }
      }

      alert(`KML 匯入完成：成功 ${success} 筆；失敗 ${failed} 筆。資料已同步到清單與地圖。`);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (e) {
      console.error('KML 轉換或匯入失敗', e);
      alert('KML 匯入失敗，請確認檔案格式或重試');
    } finally {
      setIsImporting(false);
    }
  }

  function removeExistingKmlSourceAndLayers(map: Map, sourceId: string) {
    const existingSource = map.getSource(sourceId);
    if (!existingSource) return;
    ['kml-points', 'kml-lines', 'kml-polygons'].forEach(layerId => {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
    });
    map.removeSource(sourceId);
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleImportKMLFile(file);
  }

  return (
    <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".kml"
        onChange={onFileChange}
        style={{ display: 'none', ...inputStyle }}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={isImporting}
        style={{
          padding: '8px 12px',
          border: '1px solid #ddd',
          borderRadius: 8,
          background: isImporting ? '#f3f4f6' : '#fff',
          cursor: isImporting ? 'default' : 'pointer',
          ...buttonStyle
        }}
      >
        {isImporting ? '匯入中…' : '匯入 KML 並寫入'}
      </button>
    </div>
  );
}

// --------- 工具函式 (保持不變) ---------
function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getGeoJSONBounds(fc: any): maplibregl.LngLatBoundsLike | null {
  try {
    const coords: [number, number][] = [];
    const collect = (geom: any) => {
      const type = geom?.type;
      const c = geom?.coordinates;
      if (!type || !c) return;
      if (type === 'Point') {
        coords.push([c[0], c[1]]);
      } else if (type === 'LineString') {
        c.forEach((p: any) => coords.push([p[0], p[1]]));
      } else if (type === 'Polygon') {
        c.flat().forEach((p: any) => coords.push([p[0], p[1]]));
      } else if (type === 'MultiPoint') {
        c.forEach((p: any) => coords.push([p[0], p[1]]));
      } else if (type === 'MultiLineString') {
        c.flat().forEach((p: any) => coords.push([p[0], p[1]]));
      } else if (type === 'MultiPolygon') {
        c.flat(2).forEach((p: any) => coords.push([p[0], p[1]]));
      } else if (type === 'GeometryCollection') {
        geom.geometries?.forEach(collect);
      }
    };
    fc.features?.forEach((f: any) => collect(f.geometry));
    if (coords.length === 0) return null;
    let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
    coords.forEach(([lng, lat]) => {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    });
    return [[minLng, minLat], [maxLng, maxLat]] as maplibregl.LngLatBoundsLike;
  } catch {
    return null;
  }
}

function dedupeByEpsilon(points: any[], eps: number): any[] {
  const seen: [number, number][] = [];
  const out: any[] = [];
  for (const f of points) {
    const [lng, lat] = f.geometry.coordinates;
    if (!isFinite(lng) || !isFinite(lat)) continue;
    if (seen.some(([L, A]) => Math.abs(L - lng) <= eps && Math.abs(A - lat) <= eps)) {
      continue;
    }
    seen.push([lng, lat]);
    out.push(f);
  }
  return out;
}

function safeStr(v: any): string | undefined {
  const s = typeof v === 'string' ? v.trim() : '';
  return s || undefined;
}

function formatCoord(lat: number, lng: number) {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}