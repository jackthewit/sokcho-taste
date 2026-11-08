import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, type Firestore } from "firebase/firestore";

// 웹 앱용 Firebase 설정 — 빌드 시 NEXT_PUBLIC_FIREBASE_* 환경변수에서 읽음.
// 값이 없으면 클라우드 저장을 끄고 기기 저장만 사용한다.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "sokcho-bi-system",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:388168963561:web:51e8ca77b5dfb935176778",
};

export const CLOUD_ENABLED = Boolean(firebaseConfig.apiKey);

let app: FirebaseApp | null = null;
let db: Firestore | null = null;

if (CLOUD_ENABLED && typeof window !== "undefined") {
  app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  try {
    // 오프라인 캐시: 인터넷이 끊겨도 읽고 쓰고, 연결되면 자동 동기화
    db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  } catch {
    db = getFirestore(app);
  }
}

export { app, db };
