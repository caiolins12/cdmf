import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

// Otimizações específicas para web
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  // Injeta CSS adicional para garantir comportamento correto
  const style = document.createElement('style');
  style.id = 'expo-web-styles';
  style.textContent = `
    /* Garante que os containers flex funcionem corretamente */
    #root > div,
    #root > div > div {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }
    
    /* ScrollView deve ter overflow correto */
    [data-testid="scroll-view"],
    [class*="scrollView"] {
      -webkit-overflow-scrolling: touch;
      overflow-y: auto;
      overflow-x: hidden;
    }
    
    /* Otimizações de GPU para transições suaves */
    .r-transform-gpu,
    [style*="transform"] {
      will-change: transform;
      transform: translateZ(0);
    }
    
    /* Previne flickering em animações */
    * {
      -webkit-backface-visibility: hidden;
      backface-visibility: hidden;
    }
    
    /* Touch feedback mais rápido */
    button, a, [role="button"] {
      touch-action: manipulation;
    }
    
    /* Inputs devem permitir seleção */
    input, textarea, [contenteditable="true"] {
      -webkit-user-select: auto !important;
      user-select: auto !important;
    }
  `;
  
  // Adiciona o style se ainda não existir
  if (!document.getElementById('expo-web-styles')) {
    document.head.appendChild(style);
  }
  
  // Remove o loader inicial se ainda existir
  const loader = document.getElementById('initial-loader');
  if (loader) {
    loader.classList.add('fade-out');
    setTimeout(() => loader.remove(), 300);
  }
}
