import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;
const googleProvider = new GoogleAuthProvider();

export async function getFirebase() {
  if (app) return { app, db, auth, googleProvider };

  try {
    // Dynamic import to handle missing file at runtime gracefully
    const config = await import('../../firebase-applet-config.json').catch(() => null);

    if (!config || config.apiKey === 'MISSING' || !config.apiKey) {
      console.warn('Firebase configuration is missing or incomplete. Persistence will only work locally.');
      return { app: null, db: null, auth: null, googleProvider: null };
    }

    app = initializeApp(config.default || config);
    db = getFirestore(app);
    auth = getAuth(app);

    return { app, db, auth, googleProvider };
  } catch (error) {
    console.error('Error initializing Firebase:', error);
    return { app: null, db: null, auth: null, googleProvider: null };
  }
}

// Named exports for convenient usage (may return null if not initialized)
export { db, auth, googleProvider };
