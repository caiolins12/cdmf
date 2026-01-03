// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Módulos nativos que não funcionam na web
const nativeOnlyModules = [
  '@react-native-firebase/app',
  '@react-native-firebase/auth',
  '@react-native-google-signin/google-signin',
];

// Resolver customizado para a web
const originalResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Na web, redireciona módulos nativos para um stub vazio
  if (platform === 'web' && nativeOnlyModules.some(m => moduleName.startsWith(m))) {
    return {
      filePath: require.resolve('./src/services/native-stub.js'),
      type: 'sourceFile',
    };
  }

  // Para outros casos, usa o resolver padrão
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }

  return context.resolveRequest(context, moduleName, platform);
};

// Add platform-specific extensions
config.resolver.sourceExts = [
  'web.tsx',
  'web.ts',
  'web.jsx',
  'web.js',
  ...config.resolver.sourceExts.filter(ext => !ext.startsWith('native.')),
];

module.exports = config;
