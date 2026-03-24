import { AppRegistry } from "react-native";

import App from "./App";

const ROOT_COMPONENT_NAME = "cdmf";

if (typeof globalThis !== "undefined" && !(globalThis as any).global) {
  (globalThis as any).global = globalThis;
}

function silenceConsoleNoise() {
  if (typeof window === "undefined") {
    return;
  }

  if (import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEBUG_LOGS === "true") {
    return;
  }

  const noop = () => {};
  console.log = noop;
  console.info = noop;
  console.debug = noop;
}

function setupWebDocument() {
  if (typeof document === "undefined") {
    return;
  }

  const style = document.createElement("style");
  style.id = "cdmf-web-styles";
  style.textContent = `
    #root > div,
    #root > div > div {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }

    [data-testid="scroll-view"],
    [class*="scrollView"] {
      -webkit-overflow-scrolling: touch;
      overflow-y: auto;
      overflow-x: hidden;
    }

    * {
      -webkit-backface-visibility: hidden;
      backface-visibility: hidden;
    }

    button,
    a,
    [role="button"] {
      touch-action: manipulation;
    }

    input,
    textarea,
    [contenteditable="true"] {
      -webkit-user-select: auto !important;
      user-select: auto !important;
    }
  `;

  if (!document.getElementById(style.id)) {
    document.head.appendChild(style);
  }
}

function getInitialLoader(): HTMLElement | null {
  if (typeof document === "undefined") {
    return null;
  }

  return document.getElementById("initial-loader");
}

function hideInitialLoader() {
  const loader = getInitialLoader();
  if (!loader || typeof window === "undefined") {
    return;
  }

  loader.classList.add("fade-out");
  window.setTimeout(() => loader.remove(), 300);
}

function showBootstrapError(error: unknown) {
  const loader = getInitialLoader();
  if (loader) {
    loader.classList.remove("fade-out");
    const text = loader.querySelector(".text");
    if (text) {
      text.textContent = "Erro ao iniciar. Recarregue a pagina.";
    }
  }

  console.error("Falha ao inicializar aplicacao web:", error);
}

setupWebDocument();
silenceConsoleNoise();

AppRegistry.registerComponent(ROOT_COMPONENT_NAME, () => App);

const rootTag = document.getElementById("root");

if (!rootTag) {
  throw new Error("Root element #root nao encontrado");
}

try {
  AppRegistry.runApplication(ROOT_COMPONENT_NAME, {
    rootTag,
    initialProps: {},
  });

  if (typeof window !== "undefined") {
    window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        hideInitialLoader();
      }, 80);
    });
  }
} catch (error) {
  showBootstrapError(error);
  throw error;
}

