import { db } from '../db'
const BASE = 'http://localhost:5984'

export async function pushNeeds() {
  const drafts = await db.needsDrafts.toArray()
  for (const n of drafts) {
    const id = n._id ?? n.id
    const res = await fetch(`${BASE}/needs/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(n)
    })
    if (res.ok) await db.needsDrafts.delete(n.id)
  }
}
export async function pushTaskUpdates() {
  const updates = await db.taskUpdates.toArray()
  for (const t of updates) {
    const id = t._id ?? t.id
    const res = await fetch(`${BASE}/tasks/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(t)
    })
    if (res.ok) {
      await db.taskUpdates.delete(t.id)
      await db.tasks.put(t)
    } else if (res.status === 409) {
      console.warn('Conflict on task', id)
    }
  }
}
