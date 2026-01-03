/**
 * Firebase service - WEB version
 */
import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import {
  getAuth,
  signInWithEmailAndPassword as fbSignInWithEmailAndPassword,
  createUserWithEmailAndPassword as fbCreateUserWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged as fbOnAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCredential as fbSignInWithCredential,
  browserLocalPersistence,
  setPersistence,
  type User as WebUser,
  type Auth,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCHTS6p16p3zurXpFgwDyom1YZQ8z7-IrU",
  authDomain: "cdmf-d52fa.firebaseapp.com",
  projectId: "cdmf-d52fa",
  storageBucket: "cdmf-d52fa.firebasestorage.app",
  messagingSenderId: "225551176748",
  appId: "1:225551176748:web:c9a9908635134cee996d89",
  measurementId: "G-Q3QF9NNPTZ",
};

// Detecta se está rodando na web
export const isWeb = true;

// Web SDK app
export const app: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Firestore
export const db = getFirestore(app);

// Auth instance
let authInstance: Auth | null = null;

async function getAuthInstance(): Promise<Auth> {
  if (!authInstance) {
    authInstance = getAuth(app);
    
    // Configura persistência local para manter o login
    try {
      await setPersistence(authInstance, browserLocalPersistence);
    } catch (e) {
      console.log("Erro ao configurar persistência:", e);
    }
  }
  return authInstance;
}

// Inicializa auth sincronamente para uso em alguns lugares
function getAuthInstanceSync(): Auth {
  if (!authInstance) {
    authInstance = getAuth(app);
  }
  return authInstance;
}

// ============ TIPOS ============

export type UnifiedUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  phoneNumber: string | null;
  providerData?: Array<{ providerId: string }>;
};

type AuthStateCallback = (user: UnifiedUser | null) => void;

function toUnifiedUser(user: WebUser | null): UnifiedUser | null {
  if (!user) return null;
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    phoneNumber: user.phoneNumber,
    providerData: user.providerData?.map(p => ({ providerId: p.providerId })) || [],
  };
}

// ============ AUTH METHODS ============

export const auth = {
  onAuthStateChanged: (callback: AuthStateCallback) => {
    const authInst = getAuthInstanceSync();
    return fbOnAuthStateChanged(authInst, (user) => {
      callback(toUnifiedUser(user));
    });
  },

  signInWithEmailAndPassword: async (email: string, password: string) => {
    const authInst = await getAuthInstance();
    const cred = await fbSignInWithEmailAndPassword(authInst, email, password);
    return { user: toUnifiedUser(cred.user)! };
  },

  createUserWithEmailAndPassword: async (email: string, password: string) => {
    const authInst = await getAuthInstance();
    const cred = await fbCreateUserWithEmailAndPassword(authInst, email, password);
    return { user: toUnifiedUser(cred.user)! };
  },

  signOut: async () => {
    const authInst = await getAuthInstance();
    await fbSignOut(authInst);
  },

  signInWithGoogle: async () => {
    const authInst = await getAuthInstance();
    const provider = new GoogleAuthProvider();
    provider.addScope("profile");
    provider.addScope("email");
    // Força seleção de conta
    provider.setCustomParameters({
      prompt: 'select_account'
    });
    
    // Usa popup em todas as plataformas web
    // No mobile, o popup abre em uma nova aba/janela
    const result = await signInWithPopup(authInst, provider);
    return { user: toUnifiedUser(result.user)! };
  },

  signInWithCredential: async (idToken: string) => {
    const authInst = await getAuthInstance();
    const credential = GoogleAuthProvider.credential(idToken);
    const result = await fbSignInWithCredential(authInst, credential);
    return { user: toUnifiedUser(result.user)! };
  },

  get currentUser(): UnifiedUser | null {
    const authInst = getAuthInstanceSync();
    return toUnifiedUser(authInst.currentUser);
  },
};

export { GoogleAuthProvider };
