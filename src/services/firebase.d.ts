/**
 * Type declarations for firebase service
 * This file provides types for both web and native implementations
 */

import type { FirebaseApp } from "firebase/app";
import type { Firestore } from "firebase/firestore";

export declare const isWeb: boolean;
export declare const app: FirebaseApp;
export declare const db: Firestore;

export type UnifiedUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  phoneNumber: string | null;
  providerData?: Array<{ providerId: string }>;
};

type AuthStateCallback = (user: UnifiedUser | null) => void;

export declare const auth: {
  onAuthStateChanged: (callback: AuthStateCallback) => () => void;
  signInWithEmailAndPassword: (email: string, password: string) => Promise<{ user: UnifiedUser }>;
  createUserWithEmailAndPassword: (email: string, password: string) => Promise<{ user: UnifiedUser }>;
  signOut: () => Promise<void>;
  signInWithGoogle: () => Promise<{ user: UnifiedUser }>;
  signInWithCredential: (idToken: string) => Promise<{ user: UnifiedUser }>;
  readonly currentUser: UnifiedUser | null;
};

export declare const GoogleAuthProvider: any;

