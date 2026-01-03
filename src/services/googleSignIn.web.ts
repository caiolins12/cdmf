/**
 * Google Sign-In service - WEB version
 */
import { auth } from "./firebase";

export type GoogleUser = {
  id: string;
  name: string | null;
  email: string;
  photo: string | null;
};

const webGoogleSignIn = {
  async signIn(): Promise<boolean> {
    try {
      await auth.signInWithGoogle();
      return true;
    } catch (error: any) {
      // Usuário fechou o popup
      if (error.code === "auth/popup-closed-by-user") {
        console.log("Sign-in cancelado pelo usuário");
        return false;
      }
      // Popup bloqueado
      if (error.code === "auth/popup-blocked") {
        console.log("Popup bloqueado pelo navegador");
        throw new Error("Popup bloqueado. Permita popups para este site.");
      }
      console.log("Erro no Google Sign-In web:", error);
      throw error;
    }
  },

  async signOut(): Promise<void> {
    await auth.signOut();
  },

  async switchAccount(): Promise<boolean> {
    // Na web, basta fazer logout e login novamente
    await auth.signOut();
    return this.signIn();
  },

  async revokeAccess(): Promise<void> {
    await auth.signOut();
  },

  async isSignedIn(): Promise<boolean> {
    return auth.currentUser !== null;
  },

  async getCurrentUser(): Promise<GoogleUser | null> {
    const user = auth.currentUser;
    if (!user) return null;
    return {
      id: user.uid,
      name: user.displayName,
      email: user.email || "",
      photo: user.photoURL,
    };
  },
};

/**
 * Hook de login com Google para Web.
 * Usa Firebase Auth signInWithPopup.
 */
export function useGoogleSignIn() {
  return webGoogleSignIn;
}

