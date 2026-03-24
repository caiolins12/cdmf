// Exportações separadas para evitar dependências circulares
export { default as DesktopLayout } from "./DesktopLayout";
export { default as DesktopSidebar } from "./DesktopSidebar";
export { default as DesktopHeader } from "./DesktopHeader";
export { default as DesktopContentWrapper } from "./DesktopContentWrapper";
// Não exportar o contexto aqui para evitar dependências circulares
// Importe diretamente de contexts/DesktopNavigationContext quando necessário
