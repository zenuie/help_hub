import React from 'react'
import { db, type Need, type Task, type Marker as BaseMarker } from '../lib/db'

// 擴充 Need 型別以支援地理資訊
type LocationNeed = Need & { lat?: number; lng?: number; }

// 擴充 LocationTask：包含所有需要的欄位 (Task 基礎 + 地理資訊 + 描述)
// 描述欄位被明確加入，以修復 TS2322: Property 'description' does not exist on type 'LocationTask'
type LocationTask = Task & {
  lat: number;
  lng: number;
  locationText: string;
  description: string;
};

// 擴充 Marker：新增 linkedTaskId
type TaskLinkedMarker = BaseMarker & { linkedTaskId: string }

export default function NeedForm() {
  // 將 drafts 和 form 的狀態型別改為擴充後的 LocationNeed
  const [drafts, setDrafts] = React.useState<LocationNeed[]>([])
  const [form, setForm] = React.useState<Partial<LocationNeed>>({})
  React.useEffect(() => { (async()=> setDrafts(await db.needsDrafts.toArray() as LocationNeed[]))() }, [])

  function set<K extends keyof LocationNeed>(k: K, v: LocationNeed[K]) {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  // 輔助函數：格式化地點顯示
  function formatLocation(lat?: number, lng?: number, locationText?: string): string {
    if (locationText) return locationText
    if (lat && lng) return `座標: ${lat.toFixed(5)}, ${lng.toFixed(5)}`
    return '未指定地點'
  }

  async function saveDraft() {
    const need: LocationNeed = {
      id: crypto.randomUUID(),
      category: (form.category as any) ?? 'food',
      severity: Number(form.severity ?? 1) as 1|2|3,
      locationText: form.locationText ?? '',
      description: form.description ?? '',
      lat: form.lat, // 使用 lat
      lng: form.lng, // 使用 lng
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    await db.needsDrafts.put(need as Need) // 寫入 DB 時斷言回 Need
    setDrafts(await db.needsDrafts.toArray() as LocationNeed[])
    alert('草稿已儲存（可離線）')
  }

  // ----------------------------------------------------
  // 新增：提交需求並建立任務與標註
  // ----------------------------------------------------
  async function submitAsTask() {
    // 1. 驗證必要欄位
    if (!form.locationText || !form.lat || !form.lng || !form.description) {
      alert('請填寫地點文字、座標、描述才能轉為任務！')
      return
    }

    const taskId = crypto.randomUUID()
    const markerId = crypto.randomUUID()
    const now = Date.now()

    // 格式化地點文字（用於任務 title 和 locationText）
    const locationText = formatLocation(form.lat, form.lng, form.locationText)

    // 2. 建立新任務 (Task)
    const newTask: LocationTask = {
      id: taskId,
      title: `新需求: ${form.locationText} (${form.category})`,
      status: 'todo',
      lat: form.lat!, // 非空斷言，因為前面已驗證
      lng: form.lng!, // 非空斷言，因為前面已驗證
      locationText: locationText,
      updatedAt: now,
      // 需求特有資訊加到描述中
      description: `[需求類別: ${form.category}, 嚴重度: ${form.severity}]\n${form.description}`
    }

    // 3. 建立新地圖標註 (Marker)
    // 預設將 Need 轉為 MarkerType='block' (幫忙/阻塞)
    const newMarker: TaskLinkedMarker = {
      id: markerId,
      type: 'block', // 預設為 '幫忙'
      lat: form.lat!,
      lng: form.lng!,
      updatedAt: now,
      linkedTaskId: taskId // 連結到新建立的任務
    }

    try {
      // 4. 寫入資料庫
      await db.tasks.put(newTask as Task) // 寫入任務
      await db.markers.put(newMarker as BaseMarker) // 寫入標註

      // 5. 提示並清理
      setForm({}) // 清空表單

      alert(`需求已提交：任務與地圖標註已建立！\n- 任務 ID: ${taskId.substring(0, 8)}\n- 標註 ID: ${markerId.substring(0, 8)}\n請至「任務板」和「地圖頁」查看。`)
    } catch (error) {
      alert('提交失敗，請檢查網路或嘗試儲存草稿。')
      console.error(error)
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <h2>需求回報</h2>
      <label style={{ display: 'block', margin: '8px 0' }}>類別：
        <select onChange={e=>set('category', e.target.value as any)} value={form.category ?? 'food'}>
          <option value="medical">醫療</option>
          <option value="food">食物</option>
          <option value="shelter">避難</option>
        </select>
      </label>
      <label style={{ display: 'block', margin: '8px 0' }}>嚴重度：
        <select onChange={e=>set('severity', Number(e.target.value) as 1|2|3)} value={form.severity ?? 1}>
          <option value="1">1</option><option value="2">2</option><option value="3">3</option>
        </select>
      </label>

      <label style={{ display: 'block', margin: '8px 0' }}>位置文字（路名/地標）：
        <input
          onChange={e=>set('locationText', e.target.value as any)}
          value={form.locationText ?? ''}
          style={{ width: '100%', padding: 4 }}
        />
      </label>

      <div style={{ display: 'flex', gap: 8, margin: '8px 0' }}>
        <label>緯度 (Lat)：
          <input
            type="number"
            onChange={e=>set('lat', Number(e.target.value))}
            value={form.lat ?? ''}
            style={{ width: 100 }}
          />
        </label>
        <label>經度 (Lng)：
          <input
            type="number"
            onChange={e=>set('lng', Number(e.target.value))}
            value={form.lng ?? ''}
            style={{ width: 100 }}
          />
        </label>
        {/* 新增獲取當前座標的按鈕 */}
        <button
          onClick={() => navigator.geolocation.getCurrentPosition(
            (pos) => { set('lat', pos.coords.latitude); set('lng', pos.coords.longitude); },
            (err) => alert(`無法獲取座標：${err.message}`)
          )}
          style={{ padding: '4px 8px' }}
        >
          獲取當前座標
        </button>
      </div>

      <label style={{ display: 'block', margin: '8px 0' }}>描述：
        <textarea
          onChange={e=>set('description', e.target.value as any)}
          value={form.description ?? ''}
          style={{ width: '100%', minHeight: 80, padding: 4 }}
        />
      </label>

      <div style={{ marginTop: 12, display: 'flex', gap: 12 }}>
        <button onClick={saveDraft} style={{ padding: '10px 16px', border: '1px solid #ddd' }}>
          儲存草稿（離線）
        </button>
        <button
          onClick={submitAsTask}
          style={{ padding: '10px 16px', background: '#dcfce7', border: '1px solid #10b981', fontWeight: 'bold' }}
        >
          ✅ 提交需求並轉為任務
        </button>
      </div>

      <h3 style={{ marginTop: 16 }}>草稿列表</h3>
      <ul>
        {drafts.map(d=>(
          <li key={d.id} style={{ borderBottom: '1px dotted #eee', padding: '4px 0' }}>
            {d.category}／{d.severity} — {formatLocation(d.lat, d.lng, d.locationText) || ''}
          </li>
        ))}
      </ul>
    </div>
  )
}