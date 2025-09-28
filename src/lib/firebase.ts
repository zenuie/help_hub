// src/lib/firebase.ts
import { initializeApp } from 'firebase/app';
import { getFirestore, enableIndexedDbPersistence, collection } from 'firebase/firestore';
import { getAuth } from "firebase/auth"; // 匯入 getAuth

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app); // 取得並匯出 auth 實例

enableIndexedDbPersistence(db)
  .catch((err: any) => { // 修正：為 err 加上 any 型別
    if (err.code === 'failed-precondition') {
      console.warn('Firestore: Multiple tabs open, persistence can only be enabled in one tab at a time.');
    } else if (err.code === 'unimplemented') {
      console.error('Firestore: The current browser does not support all of the features required to enable persistence.');
    }
  });

export const markersCollection = collection(db, 'markers');
export const tasksCollection = collection(db, 'tasks');