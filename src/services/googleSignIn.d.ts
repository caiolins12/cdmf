/**
 * Type declarations for googleSignIn service
 * This file provides types for both web and native implementations
 */

export type GoogleUser = {
  id: string;
  name: string | null;
  email: string;
  photo: string | null;
};

type GoogleSignInMethods = {
  signIn: () => Promise<boolean>;
  signOut: () => Promise<void>;
  switchAccount: () => Promise<boolean>;
  revokeAccess: () => Promise<void>;
  isSignedIn: () => Promise<boolean>;
  getCurrentUser: () => Promise<GoogleUser | null>;
};

export declare function useGoogleSignIn(): GoogleSignInMethods;

