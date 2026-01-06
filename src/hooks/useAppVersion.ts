/**
 * Hook simples que retorna a versão do app.
 * O buildTime é gerenciado automaticamente pelo UpdateChecker via localStorage.
 */
export function useAppVersion() {
  return { 
    version: "1.0.0",
  };
}
