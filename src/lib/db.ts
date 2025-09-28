// src/lib/db.ts
// 這個檔案現在只用來定義整個應用程式共用的 TypeScript 基礎型別

export type TaskStatus = 'todo' | 'doing' | 'done' | 'hold';

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  updatedAt: number; // 在 UI 層，我們處理轉換後的數字 (milliseconds)
  lat?: number;
  lng?: number;
  locationText?: string;
  description?: string;
  creatorId?: string | null;
  creatorName?: string | null;
  linkedMarkerId?: string;
}

export type MarkerType =
  | 'block'      // 障礙/需幫忙
  | 'supply'     // 物資點
  | 'meeting'    // 集合點/避難所
  | 'danger'     // 危險區域
  | 'water'      // 供水站/加水站
  | 'medical'    // 醫療站
  | 'traffic'    // 交通管制/狀況
  | 'info';      // 其他資訊點

export interface Marker {
  id: string;
  type: MarkerType;
  lat: number;
  lng: number;
  updatedAt: number; // 在 UI 層，我們處理轉換後的數字
  city?: string;
  district?: string;
  fullAddress?: string;
  linkedTaskId?: string;
  creatorId?: string | null;
}