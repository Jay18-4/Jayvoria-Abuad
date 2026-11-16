import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import {
  doc,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
  type Firestore,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(app);

function createFirestoreClient(): Firestore {
  try {
    return initializeFirestore(
      app,
      {
        experimentalForceLongPolling: true,
      },
      firebaseConfig.firestoreDatabaseId
    );
  } catch {
    return getFirestore(app, firebaseConfig.firestoreDatabaseId);
  }
}

export const firestoreDb = createFirestoreClient();
export const googleAuthProvider = new GoogleAuthProvider();

export async function testFirestoreConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(firestoreDb, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

export async function signInWithGooglePopup(): Promise<{ idToken: string; email: string | null; name: string | null }> {
  const result = await signInWithPopup(firebaseAuth, googleAuthProvider);
  const idToken = await result.user.getIdToken();
  return {
    idToken,
    email: result.user.email,
    name: result.user.displayName,
  };
}
