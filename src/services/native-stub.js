/**
 * Stub file for native-only modules on web platform.
 * This file is used as a replacement for React Native Firebase
 * and Google Sign-In modules when building for web.
 */

// Stub para @react-native-firebase/app
const firebaseAppStub = {
  apps: [],
  app: () => firebaseAppStub,
  initializeApp: () => firebaseAppStub,
};

// Stub para @react-native-firebase/auth
const authStub = () => ({
  currentUser: null,
  onAuthStateChanged: () => () => {},
  signInWithEmailAndPassword: async () => { throw new Error('Use web auth'); },
  createUserWithEmailAndPassword: async () => { throw new Error('Use web auth'); },
  signOut: async () => {},
  signInWithCredential: async () => { throw new Error('Use web auth'); },
});

authStub.GoogleAuthProvider = {
  credential: () => null,
};

// Stub para @react-native-google-signin/google-signin
const GoogleSignin = {
  configure: () => {},
  hasPlayServices: async () => true,
  signIn: async () => { throw new Error('Use web Google Sign-In'); },
  signOut: async () => {},
  getCurrentUser: async () => null,
  revokeAccess: async () => {},
};

const statusCodes = {
  SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
  IN_PROGRESS: 'IN_PROGRESS',
  PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
};

const isSuccessResponse = () => false;
const isErrorWithCode = () => false;

// Export default for @react-native-firebase/app and @react-native-firebase/auth
module.exports = authStub;
module.exports.default = firebaseAppStub;
module.exports.GoogleSignin = GoogleSignin;
module.exports.statusCodes = statusCodes;
module.exports.isSuccessResponse = isSuccessResponse;
module.exports.isErrorWithCode = isErrorWithCode;

