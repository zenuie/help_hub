import React from 'react'
import { db, type Task, type TaskStatus } from '../lib/db'

// 為了支援地圖聯動，擴充 Task 型別，確保能包含所有地理和描述資訊
type LocationTask = Task & {
  lat?: number;
  lng?: number;
  locationText?: string;
  description?: string; // 從 NeedForm 轉來的任務會包含描述
}

// 輔助函數：格式化座標
function formatCoord(lat: number, lng: number) {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
}

export default function Tasks() {
  const [tasks, setTasks] = React.useState<LocationTask[]>([])
  const [isLoading, setIsLoading] = React.useState(true) // 新增 Loading 狀態

  // 首次載入任務
  React.useEffect(() => {
    (async()=> {
      setIsLoading(true) // 開始載入
      // 這裡使用 as LocationTask[] 進行型別斷言
      setTasks(await db.tasks.toArray() as LocationTask[])
      setIsLoading(false) // 載入完成
    })()
  }, [])

  async function addTask() {
    // 示例任務：新增時包含一個示例地點和描述，以便列表顯示
    const t: LocationTask = {
      id: crypto.randomUUID(),
      title:'本地測試任務 (點擊刪除)',
      status:'todo',
      updatedAt:Date.now(),
      locationText: '（此為本地測試任務，無完整地圖地址）',
      description: '測試任務描述，用於檢查任務板是否能正常顯示。'
    }
    await db.tasks.put(t as Task)
    setTasks(await db.tasks.toArray() as LocationTask[])
  }

  async function updateStatus(t: LocationTask, s: TaskStatus) {
    const updated = { ...t, status:s, updatedAt:Date.now() }
    await db.taskUpdates.put(updated as Task) // 寫入隊列
    await db.tasks.put(updated as Task) // 寫入 DB
    setTasks(await db.tasks.toArray() as LocationTask[])
  }

  async function deleteTask(t: LocationTask) {
    if (!window.confirm(`確定要刪除任務：「${t.title}」嗎？`)) {
      return // 取消刪除
    }
    await db.tasks.delete(t.id)
    // 刪除後更新列表
    setTasks(await db.tasks.toArray() as LocationTask[])
  }

  return (
    <div style={{ padding: 16 }}>
      <h2>任務板</h2>
      <button onClick={addTask}>新增本地任務（示例）</button>

      {isLoading ? ( // 顯示載入狀態
        <div style={{ marginTop: 16, color: '#9ca3af' }}>任務載入中...</div>
      ) : (
        <ul>
          {tasks.map(t=>(
            <li key={t.id} style={{ margin:'8px 0', border: '1px solid #eee', padding: 8, borderRadius: 8, position: 'relative' }}>
              {/* 刪除按鈕 */}
              <button
                onClick={() => deleteTask(t)}
                title="刪除此任務"
                style={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  padding: '4px 8px',
                  border: '1px solid #fee2e2',
                  borderRadius: 4,
                  background: '#fef2f2',
                  color: '#ef4444',
                  fontSize: 12
                }}
              >
                🗑️ 刪除
              </button>

              <div style={{ fontWeight: 600, marginRight: 80 }}> {/* 留出空間給刪除按鈕 */}
                {t.title} —
                <span style={{
                  marginLeft: 4,
                  padding: '2px 6px',
                  borderRadius: 4,
                  fontSize: 12,
                  background: t.status === 'done' ? '#dcfce7' : t.status === 'doing' ? '#fffbeb' : t.status === 'hold' ? '#fee2e2' : '#f3f4f6'
                }}>
                  {t.status}
                </span>
              </div>

              {/* 顯示地圖關聯的地理資訊 (優先顯示 locationText，即完整地址) */}
              {(t.locationText || (t.lat && t.lng)) && (
                <div style={{ color: '#6b7280', fontSize: 13, marginTop: 4, whiteSpace: 'pre-wrap' }}>
                  地點：
                  <span style={{ fontWeight: 500, color: '#333' }}>
                    {t.locationText
                      ? t.locationText // 優先顯示完整地址 (MapPage 或 NeedForm 傳入的完整地址)
                      : (t.lat && t.lng) ? formatCoord(t.lat, t.lng) : '無地址資訊'}
                  </span>
                  {/* 輔助顯示座標，如果 locationText 存在 */}
                  {t.locationText && t.lat && t.lng && (
                     <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 8 }}>
                       ({formatCoord(t.lat, t.lng)})
                     </span>
                  )}
                </div>
              )}
              {/* 顯示描述 */}
              {t.description && (
                <div style={{ color: '#4b5563', fontSize: 13, marginTop: 4, whiteSpace: 'pre-wrap', borderLeft: '3px solid #e5e7eb', paddingLeft: 8 }}>
                  描述：{t.description}
                </div>
              )}

              {/* 狀態切換按鈕 */}
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop: 8 }}>
                {(['todo','doing','done','hold'] as TaskStatus[]).map(s=><button key={s} onClick={()=>updateStatus(t,s)}>{s}</button>)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}