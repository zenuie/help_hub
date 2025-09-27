import Dexie, { Table } from 'dexie'

export type TaskStatus = 'todo'|'doing'|'done'|'hold'
export type Task = { _id?: string; id: string; title: string; status: TaskStatus; updatedAt: number }
export type Need = { _id?: string; id: string; category: 'medical'|'food'|'shelter'; severity: 1|2|3; locationText?: string; description?: string; createdAt: number; updatedAt: number }
export type MarkerType = 'block'|'supply'|'meeting'|'danger'
export type Marker = { _id?: string; id: string; type: MarkerType; lat: number; lng: number; updatedAt: number }

export class HelpHubDB extends Dexie {
  tasks!: Table<Task, string>
  needsDrafts!: Table<Need, string>
  taskUpdates!: Table<Task, string>
  markers!: Table<Marker, string>
  meta!: Table<{ key: string; value: any }, string>
  constructor() {
    super('help_hub_db')
    this.version(1).stores({
      tasks: 'id, updatedAt, status',
      needsDrafts: 'id, updatedAt, createdAt, category',
      taskUpdates: 'id, updatedAt, status',
      markers: 'id, updatedAt, type',
      meta: 'key'
    })
  }
}
export const db = new HelpHubDB()
