import { initializeApp, getApps, getApp } from "firebase/app";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  getFirestore
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";
import firebaseConfig from "../../firebase-applet-config.json";

const hasFirebase = !!(firebaseConfig && firebaseConfig.apiKey && firebaseConfig.apiKey !== "");

let app: any = null;
let db: any = null;
let auth: any = null;
let storage: any = null;

if (hasFirebase) {
  try {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    try {
      db = initializeFirestore(
        app,
        {
          localCache: persistentLocalCache({
            tabManager: persistentMultipleTabManager()
          }),
          experimentalForceLongPolling: true,
          // Proteção global: campos opcionais não preenchidos não podem impedir
          // o salvamento inteiro de uma inspeção no Firestore.
          ignoreUndefinedProperties: true
        },
        firebaseConfig.firestoreDatabaseId
      );
    } catch (cacheErr) {
      // Fallback if already initialized with different config or unsupported in environment
      db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
    }
    auth = getAuth(app);
    storage = getStorage(app);
  } catch (error) {
    console.error("Failed to initialize Firebase:", error);
  }
}

export { app, db, auth, storage, hasFirebase };
