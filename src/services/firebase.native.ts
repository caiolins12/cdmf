/**
 * Firebase service - NATIVE (Android/iOS) version
 */
import rnfbApp from "@react-native-firebase/app";
import rnfbAuth from "@react-native-firebase/auth";
import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

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
export const isWeb = false;

// Web SDK app (usado para Firestore)
export const app: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Ensure native Firebase app is initialized
if (rnfbApp.apps.length === 0) {
  rnfbApp.initializeApp({
    apiKey: firebaseConfig.apiKey,
    appId: firebaseConfig.appId,
    projectId: firebaseConfig.projectId,
    messagingSenderId: firebaseConfig.messagingSenderId,
    storageBucket: firebaseConfig.storageBucket,
  } as any);
}

// Firestore still uses JS SDK
export const db = getFirestore(app);

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

function toUnifiedUser(user: any): UnifiedUser | null {
  if (!user) return null;
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    phoneNumber: user.phoneNumber,
    providerData: user.providerData?.map((p: any) => ({ providerId: p.providerId })) || [],
  };
}

// ============ AUTH METHODS ============

export const auth = {
  onAuthStateChanged: (callback: AuthStateCallback) => {
    return rnfbAuth().onAuthStateChanged((user: any) => {
      callback(toUnifiedUser(user));
    });
  },

  signInWithEmailAndPassword: async (email: string, password: string) => {
    const cred = await rnfbAuth().signInWithEmailAndPassword(email, password);
    return { user: toUnifiedUser(cred.user)! };
  },

  createUserWithEmailAndPassword: async (email: string, password: string) => {
    const cred = await rnfbAuth().createUserWithEmailAndPassword(email, password);
    return { user: toUnifiedUser(cred.user)! };
  },

  signOut: async () => {
    await rnfbAuth().signOut();
  },

  signInWithGoogle: async () => {
    // No mobile, usa @react-native-google-signin via googleSignIn service
    throw new Error("Use googleSignIn service for mobile Google auth");
  },

  signInWithCredential: async (idToken: string) => {
    const googleCredential = rnfbAuth.GoogleAuthProvider.credential(idToken);
    const result = await rnfbAuth().signInWithCredential(googleCredential);
    return { user: toUnifiedUser(result.user)! };
  },

  get currentUser(): UnifiedUser | null {
    return toUnifiedUser(rnfbAuth().currentUser);
  },
};

// GoogleAuthProvider para compatibilidade
export const GoogleAuthProvider = rnfbAuth.GoogleAuthProvider;

