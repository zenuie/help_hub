import { db } from '../db'
const BASE = 'http://localhost:5984'
type ChangeRow = { id: string; seq: any; doc?: any }
async function getLastSeq(dbName: string) {
  const item = await db.meta.get(`${dbName}:lastSeq`)
  return item?.value ?? 0
}
async function setLastSeq(dbName: string, seq: any) {
  await db.meta.put({ key: `${dbName}:lastSeq`, value: seq })
}
export async function pullChanges(dbName: 'tasks'|'needs'|'markers') {
  const since = await getLastSeq(dbName)
  const url = `${BASE}/${dbName}/_changes?since=${encodeURIComponent(String(since))}&include_docs=true`
  const res = await fetch(url)
  if (!res.ok) return
  const data = await res.json()
  if (data?.results) {
    for (const row of data.results as ChangeRow[]) {
      if (!row.doc) continue
      if (dbName==='tasks') await db.tasks.put(row.doc)
      else if (dbName==='needs') await db.needsDrafts.put(row.doc)
      else await db.markers.put(row.doc)
    }
    await setLastSeq(dbName, data.last_seq)
  }
}
