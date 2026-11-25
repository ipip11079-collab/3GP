import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
];

const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
for (const scope of GMAIL_SCOPES) {
  provider.addScope(scope);
}

// Keep OAuth access token strictly in memory — never in localStorage or sessionStorage
let isSigningIn = false;
let cachedAccessToken: string | null = null;

export function initGoogleAuth(
  onAuthSuccess?: (user: User, accessToken: string | null) => void,
  onSignedOut?: () => void,
) {
  return onAuthStateChanged(auth, (user) => {
    if (user) {
      if (cachedAccessToken) {
        onAuthSuccess?.(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        onAuthSuccess?.(user, null);
      }
    } else {
      cachedAccessToken = null;
      onSignedOut?.();
    }
  });
}

export async function signInWithGoogleGmail(): Promise<{
  user: User;
  accessToken: string;
}> {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Google sign-in completed, but Gmail access permission was not granted.');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: credential.accessToken };
  } finally {
    isSigningIn = false;
  }
}

export async function signOutGoogleGmail(): Promise<void> {
  cachedAccessToken = null;
  await signOut(auth);
}

export function getGoogleAccessToken(): string | null {
  return cachedAccessToken;
}
