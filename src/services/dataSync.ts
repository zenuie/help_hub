// src/services/dataSync.ts
import {
  collection,
  onSnapshot,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
  writeBatch,
  Timestamp,
  QuerySnapshot,
  DocumentData,
  QueryDocumentSnapshot
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { type Marker as BaseMarker, type Task as BaseTask } from '../lib/db';

// FirestoreMarker 型別，確保 id 是必須的
export type FirestoreMarker = Omit<BaseMarker, 'updatedAt'> & {
  updatedAt: Timestamp;
};

// FirestoreTask 型別，確保 id 是必須的
export type FirestoreTask = Omit<BaseTask, 'updatedAt'> & {
  updatedAt: Timestamp;
};

// 安全數字轉換：僅回傳有限數字，否則回傳 null
function toFiniteNumber(v: any): number | null {
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
}

// 台灣大致合理範圍（粗略）
function isInReasonableTWBounds(lat: number | null, lng: number | null): boolean {
  if (lat === null || lng === null) return false;
  return lat >= 21 && lat <= 26 && lng >= 119 && lng <= 123;
}

// --- Markers ---
export const subscribeToMarkers = (callback: (markers: FirestoreMarker[]) => void) => {
  const markersCollection = collection(db, 'markers');

  return onSnapshot(markersCollection, (querySnapshot: QuerySnapshot<DocumentData>) => {
    const markers: FirestoreMarker[] = [];

    querySnapshot.forEach((d: QueryDocumentSnapshot<DocumentData>) => {
      const data = d.data();

      const lat = toFiniteNumber(data.lat);
      const lng = toFiniteNumber(data.lng);

      const marker: FirestoreMarker = {
        id: d.id, // 從 doc 物件直接取得 ID，保證存在
        type: (data.type as FirestoreMarker['type']) || 'block',
        lat: lat ?? 0,
        lng: lng ?? 0,
        city: data.city || '',
        district: data.district || '',
        fullAddress: data.fullAddress || '',
        creatorId: data.creatorId ?? null,
        linkedTaskId: data.linkedTaskId ?? undefined,
        updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt : Timestamp.now(),
      };

      // 僅加入合理範圍的標註
      if (isInReasonableTWBounds(lat, lng)) {
        markers.push(marker);
      }
    });

    callback(markers);
  });
};

export const updateMarker = async (id: string, dataToUpdate: Partial<Omit<FirestoreMarker, 'id' | 'updatedAt'>>) => {
  const markerDoc = doc(db, 'markers', id);
  return await updateDoc(markerDoc, { ...dataToUpdate, updatedAt: Timestamp.now() });
};

export const deleteMarker = async (id: string) => {
  return await deleteDoc(doc(db, 'markers', id));
};

// --- Tasks ---
export const subscribeToTasks = (callback: (tasks: FirestoreTask[]) => void) => {
  const tasksCollection = collection(db, 'tasks');
  return onSnapshot(tasksCollection, (querySnapshot: QuerySnapshot<DocumentData>) => {
    const tasks: FirestoreTask[] = [];

    querySnapshot.forEach((d: QueryDocumentSnapshot<DocumentData>) => {
      const data = d.data();
      const lat = toFiniteNumber(data.lat);
      const lng = toFiniteNumber(data.lng);

      const task: FirestoreTask = {
        id: d.id,
        title: data.title || '',
        status: (data.status as FirestoreTask['status']) || 'todo',
        lat: lat ?? undefined,
        lng: lng ?? undefined,
        locationText: data.locationText || '',
        description: data.description || '',
        creatorId: data.creatorId ?? null,
        creatorName: data.creatorName ?? null,
        linkedMarkerId: data.linkedMarkerId ?? undefined,
        updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt : Timestamp.now(),
      };
      tasks.push(task);
    });

    callback(tasks);
  });
};

export const addTask = async (taskData: Omit<BaseTask, 'id' | 'updatedAt'>) => {
  return await addDoc(collection(db, 'tasks'), { ...taskData, updatedAt: Timestamp.now() });
};

export const updateTask = async (id: string, dataToUpdate: Partial<Omit<BaseTask, 'id' | 'updatedAt'>>) => {
  const taskDoc = doc(db, 'tasks', id);
  return await updateDoc(taskDoc, { ...dataToUpdate, updatedAt: Timestamp.now() });
};

export const deleteTask = async (id: string) => {
  return await deleteDoc(doc(db, 'tasks', id));
};

// --- 複合操作 ---
export const createReport = async (
  markerData: Omit<BaseMarker, 'id' | 'updatedAt' | 'linkedTaskId'>,
  taskData: Omit<BaseTask, 'id' | 'updatedAt' | 'linkedMarkerId'>
) => {
  const batch = writeBatch(db);
  const markerRef = doc(collection(db, 'markers'));
  const taskRef = doc(collection(db, 'tasks'));

  batch.set(markerRef, {
    ...markerData,
    linkedTaskId: taskRef.id,
    updatedAt: Timestamp.now(),
  });

  batch.set(taskRef, {
    ...taskData,
    linkedMarkerId: markerRef.id,
    updatedAt: Timestamp.now(),
  });

  await batch.commit();
  return { markerId: markerRef.id, taskId: taskRef.id };
};
