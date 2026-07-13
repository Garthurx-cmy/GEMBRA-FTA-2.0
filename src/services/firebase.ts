import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
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
    db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
    auth = getAuth(app);
    storage = getStorage(app);
  } catch (error) {
    console.error("Failed to initialize Firebase:", error);
  }
}

export { app, db, auth, storage, hasFirebase };
