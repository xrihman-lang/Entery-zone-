import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, Auth, GoogleAuthProvider } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, Firestore, getFirestore } from 'firebase/firestore';

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;
const googleProvider = new GoogleAuthProvider();

export async function getFirebase() {
  if (app && db && auth) return { app, db, auth, googleProvider };

  try {
    // Dynamic import to handle missing file at runtime gracefully
    const config = await import('../../firebase-applet-config.json').catch(() => null);

    if (!config || config.apiKey === 'MISSING' || !config.apiKey) {
      console.warn('Firebase configuration is missing or incomplete. Persistence will only work locally.');
      return { app: null, db: null, auth: null, googleProvider: null };
    }

    if (getApps().length > 0) {
      app = getApps()[0];
    } else {
      app = initializeApp(config.default || config);
    }
    
    if (!db) {
      try {
        // Enable offline persistence caching
        db = initializeFirestore(app, {
          localCache: persistentLocalCache({
            tabManager: persistentMultipleTabManager()
          })
        });
      } catch (e: any) {
        if (e.message && e.message.includes('already been called')) {
           db = getFirestore(app);
        } else {
           console.error(e);
           db = getFirestore(app);
        }
      }
    }
    
    if (!auth) auth = getAuth(app);

    return { app, db, auth, googleProvider };
  } catch (error) {
    console.error('Error initializing Firebase:', error);
    return { app: null, db: null, auth: null, googleProvider: null };
  }
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid,
      email: auth?.currentUser?.email,
      emailVerified: auth?.currentUser?.emailVerified,
      isAnonymous: auth?.currentUser?.isAnonymous,
      tenantId: auth?.currentUser?.tenantId,
      providerInfo: auth?.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Named exports for convenient usage (may return null if not initialized)
export { db, auth, googleProvider };
