/**
 * Google Sign-In service - NATIVE (Android/iOS) version
 */
import {
  GoogleSignin,
  isSuccessResponse,
  isErrorWithCode,
  statusCodes,
} from "@react-native-google-signin/google-signin";
import auth from "@react-native-firebase/auth";

// Web Client ID do Firebase
const WEB_CLIENT_ID =
  "225551176748-0ntgm34l4uil6vvi2jpjibnr86nthu5g.apps.googleusercontent.com";

// Configura o Google Sign-In uma única vez
GoogleSignin.configure({
  webClientId: WEB_CLIENT_ID,
  offlineAccess: true,
});

export type GoogleUser = {
  id: string;
  name: string | null;
  email: string;
  photo: string | null;
};

const mobileGoogleSignIn = {
  async signIn(): Promise<boolean> {
    try {
      // Verifica se o Google Play Services está disponível
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

      // Realiza o sign-in nativo
      const response = await GoogleSignin.signIn();

      if (isSuccessResponse(response)) {
        const idToken = response.data.idToken;

        if (!idToken) {
          throw new Error("Google sign-in failed: missing id_token");
        }

        // Cria credencial para o Firebase
        const googleCredential = auth.GoogleAuthProvider.credential(idToken);

        // Autentica no Firebase
        await auth().signInWithCredential(googleCredential);

        return true;
      }

      return false;
    } catch (error) {
      if (isErrorWithCode(error)) {
        switch (error.code) {
          case statusCodes.IN_PROGRESS:
            console.log("Sign-in já em progresso");
            break;
          case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
            console.log("Play Services não disponível");
            break;
          case statusCodes.SIGN_IN_CANCELLED:
            console.log("Sign-in cancelado pelo usuário");
            break;
          default:
            console.log("Erro desconhecido:", error.code, error.message);
        }
      } else {
        console.log("Erro não relacionado ao Google Sign-In:", error);
      }
      throw error;
    }
  },

  async signOut(): Promise<void> {
    try {
      await GoogleSignin.signOut();
      await auth().signOut();
    } catch (error) {
      console.log("Erro ao fazer logout:", error);
    }
  },

  async switchAccount(): Promise<boolean> {
    try {
      // Primeiro faz logout do Google (mas não do Firebase ainda)
      await GoogleSignin.signOut();

      // Agora faz login novamente, mostrando o seletor de contas
      return await this.signIn();
    } catch (error) {
      console.log("Erro ao trocar conta:", error);
      throw error;
    }
  },

  async revokeAccess(): Promise<void> {
    try {
      await GoogleSignin.revokeAccess();
      await GoogleSignin.signOut();
      await auth().signOut();
    } catch (error) {
      console.log("Erro ao revogar acesso:", error);
      // Mesmo com erro, tenta fazer signOut
      await this.signOut();
    }
  },

  async isSignedIn(): Promise<boolean> {
    try {
      const userInfo = await GoogleSignin.getCurrentUser();
      return userInfo !== null;
    } catch {
      return false;
    }
  },

  async getCurrentUser(): Promise<GoogleUser | null> {
    try {
      const userInfo = await GoogleSignin.getCurrentUser();
      if (userInfo?.user) {
        return {
          id: userInfo.user.id,
          name: userInfo.user.name,
          email: userInfo.user.email,
          photo: userInfo.user.photo,
        };
      }
      return null;
    } catch {
      return null;
    }
  },
};

/**
 * Hook de login com Google para mobile.
 * Usa @react-native-google-signin.
 */
export function useGoogleSignIn() {
  return mobileGoogleSignIn;
}

