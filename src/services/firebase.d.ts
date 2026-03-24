import type { CompatApp } from "./appCompat";
import type { Functions } from "./functionsCompat";

export declare const isWeb: boolean;
export declare const app: CompatApp;
export declare const db: { kind: "postgres-firestore" };
export declare const functions: Functions;

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
  renderGoogleSignInButton: (
    container: HTMLElement,
    handlers?: {
      onStart?: () => void;
      onSuccess?: (user: UnifiedUser) => void;
      onError?: (error: unknown) => void;
    }
  ) => Promise<() => void>;
  signInWithGoogle: () => Promise<{ user: UnifiedUser }>;
  signInWithCredential: (idToken: string) => Promise<{ user: UnifiedUser }>;
  readonly currentUser: UnifiedUser | null;
};

export declare const GoogleAuthProvider: any;
