// src/pages/Tasks.tsx
import React, { useEffect, useState } from 'react';
import {
  subscribeToTasks,
  updateTask,
  deleteTask,
  FirestoreTask
} from '../services/dataSync';
import { TaskStatus } from '../lib/db';

function formatCoord(lat?: number, lng?: number) {
  if (lat === undefined || lng === undefined) return '無座標資訊';
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

function formatTimestamp(timestamp: any) {
    if (timestamp && typeof timestamp.toDate === 'function') {
        return timestamp.toDate().toLocaleString();
    }
    return '未知時間';
}

export default function Tasks() {
  const [tasks, setTasks] = useState<FirestoreTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    const unsubscribe = subscribeToTasks((tasksFromDb) => {
      const sortedTasks = tasksFromDb.sort((a, b) => b.updatedAt.toMillis() - a.updatedAt.toMillis());
      setTasks(sortedTasks);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  async function handleUpdateStatus(t: FirestoreTask, s: TaskStatus) {
    if (t.id) {
      try {
        await updateTask(t.id, { status: s });
      } catch (error) {
        console.error("更新任務狀態失敗:", error);
        alert("更新失敗");
      }
    }
  }

  async function handleDeleteTask(t: FirestoreTask) {
    if (t.id && window.confirm(`確定要刪除任務：「${t.title}」嗎？`)) {
      try {
        await deleteTask(t.id);
      } catch (error) {
        console.error("刪除任務失敗:", error);
        alert("刪除失敗");
      }
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <h2>任務板</h2>
      <p>所有回報的需求都會在這裡彙整成可追蹤的任務。</p>

      {isLoading ? (
        <div style={{ marginTop: 16, color: '#9ca3af' }}>任務載入中...</div>
      ) : tasks.length === 0 ? (
        <div style={{ marginTop: 16, color: '#9ca3af' }}>目前沒有任務。</div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {tasks.map(t => (
            <li key={t.id} style={{ margin: '12px 0', border: '1px solid #eee', padding: '12px', borderRadius: 8, position: 'relative' }}>
              <button
                onClick={() => handleDeleteTask(t)}
                title="刪除此任務"
                style={{ position: 'absolute', top: 8, right: 8, background: '#fee2e2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: 4, cursor: 'pointer', padding: '4px 8px' }}
              >
                🗑️
              </button>

              <div style={{ fontWeight: 600, marginRight: 80, paddingRight: '20px' }}>
                {t.title} —
                <span style={{ marginLeft: 8, padding: '2px 8px', borderRadius: 12, fontSize: 12, background: '#f3f4f6', color: '#4b5563', display: 'inline-block' }}>
                  {t.status}
                </span>
              </div>

              {t.locationText && (
                <div style={{ color: '#6b7280', fontSize: 13, marginTop: 4 }}>
                  📍 地點：{t.locationText} ({formatCoord(t.lat, t.lng)})
                </div>
              )}

              {t.description && (
                <div style={{ color: '#4b5563', fontSize: 13, marginTop: 4, whiteSpace: 'pre-wrap', borderLeft: '3px solid #e5e7eb', paddingLeft: 8, background: '#fafafa' }}>
                  {t.description}
                </div>
              )}

              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 8 }}>
                回報人: {t.creatorName || '未知'} | 最後更新: {formatTimestamp(t.updatedAt)}
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                {(['todo', 'doing', 'done', 'hold'] as TaskStatus[]).map(s => (
                  <button key={s} onClick={() => handleUpdateStatus(t, s)} disabled={t.status === s} style={{ padding: '6px 12px', cursor: t.status === s ? 'default' : 'pointer' }}>
                    設為 {s}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}