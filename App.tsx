import React, { useContext, useState, useEffect, useMemo, useCallback, memo, lazy, Suspense, Component, ErrorInfo } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { View, Text, ActivityIndicator, Platform, StyleSheet, ScrollView, Pressable } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider, AuthContext } from "./src/contexts/AuthContext";
import { DesktopProvider } from "./src/contexts/DesktopContext";
import { ThemeProvider } from "./src/contexts/ThemeContext";
import { PaymentProvider } from "./src/contexts/PaymentContext";
import { ActivityProvider } from "./src/contexts/ActivityContext";
import { AlertProvider } from "./src/contexts/AlertContext";
import CustomAlert from "./src/components/CustomAlert";
import LegalDocumentPage from "./src/components/legal/LegalDocumentPage";
import LegalFooter from "./src/components/legal/LegalFooter";
import {
  getLegalDocumentKeyFromPath,
  type LegalDocumentKey,
} from "./src/legal/legalDocuments";

const isWeb = Platform.OS === "web";

function getPublicLegalDocumentKey(): LegalDocumentKey | null {
  if (!isWeb || typeof window === "undefined") {
    return null;
  }

  return getLegalDocumentKeyFromPath(window.location.pathname);
}

// Error Boundary para capturar erros de renderização
class ErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null; errorInfo: ErrorInfo | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // ChunkLoadError = módulo lazy não encontrado após novo deploy (cache obsoleto)
    // Solução: recarrega a página automaticamente para buscar os novos chunks
    const isChunkError =
      error.name === 'ChunkLoadError' ||
      error.message?.includes('Failed to fetch dynamically imported module') ||
      error.message?.includes('Importing a module script failed');
    if (isChunkError && isWeb && typeof window !== 'undefined') {
      window.location.reload();
      return;
    }
    console.error('React Error Boundary:', error.message, errorInfo.componentStack);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={errorBoundaryStyles.container}>
          <ScrollView style={errorBoundaryStyles.scroll}>
            <Text style={errorBoundaryStyles.title}>❌ Erro na Renderização</Text>
            <Text style={errorBoundaryStyles.message}>{this.state.error?.message}</Text>
            <Text style={errorBoundaryStyles.stack}>{this.state.error?.stack}</Text>
            {this.state.errorInfo && (
              <>
                <Text style={errorBoundaryStyles.subtitle}>Component Stack:</Text>
                <Text style={errorBoundaryStyles.stack}>{this.state.errorInfo.componentStack}</Text>
              </>
            )}
          </ScrollView>
          <Pressable 
            style={errorBoundaryStyles.reloadBtn}
            onPress={() => {
              if (isWeb && typeof window !== 'undefined') {
                window.location.reload();
              }
            }}
          >
            <Text style={errorBoundaryStyles.reloadText}>Recarregar App</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const errorBoundaryStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    padding: 20,
  },
  scroll: {
    flex: 1,
  },
  title: {
    color: '#FF5252',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  subtitle: {
    color: '#FFB300',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 20,
    marginBottom: 10,
  },
  message: {
    color: '#FFFFFF',
    fontSize: 16,
    marginBottom: 15,
  },
  stack: {
    color: '#AAAAAA',
    fontSize: 11,
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
    lineHeight: 18,
  },
  reloadBtn: {
    backgroundColor: '#9C27B0',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 20,
  },
  reloadText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
// ============ FIM DEBUG ============

// Preloader
import Preloader from "./src/components/Preloader";

// Update Checker - verifica se há nova versão disponível
import UpdateChecker from "./src/components/UpdateChecker";

// Lazy loading dos stacks de navegação para reduzir bundle inicial
const AuthStack = lazy(() => import("./src/navigation/AuthStack"));
const MasterTabs = lazy(() => import("./src/navigation/MasterTabs"));
const TeacherTabs = lazy(() => import("./src/navigation/TeacherTabs"));
const StudentRootStack = lazy(() => import("./src/navigation/StudentRootStack"));

// Linking config simplificado - URL sempre limpa (apenas domínio)
// Similar ao WhatsApp Web - não mostra rotas na URL
function createLinkingConfig() {
  // Detecta o domínio atual automaticamente na web
  let prefixes: string[] = ["cdmf://"];
  if (isWeb && typeof window !== 'undefined') {
    prefixes = [window.location.origin, ...prefixes];
  } else {
    prefixes = ["https://cdmf-d52fa.web.app", ...prefixes];
  }
  
  return {
    prefixes,
    config: {
      screens: {},
    },
    // Qualquer path redireciona para a rota padrão
    getStateFromPath: () => undefined,
  };
}

// Loading component otimizado com memo
const LoadingView = memo(function LoadingView() {
  return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color="#9C27B0" />
      <Text style={styles.loadingText}>Carregando...</Text>
    </View>
  );
});

// Fallback para Suspense
const SuspenseFallback = memo(function SuspenseFallback() {
  return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="small" color="#9C27B0" />
    </View>
  );
});

// Routes component otimizado - SEM telas de transição intermediárias
const Routes = memo(function Routes() {
  const { user, profile, loading, profileDeleted, logout } = useContext(AuthContext);
  const [showDeletedAlert, setShowDeletedAlert] = useState(false);

  // Detecta quando o perfil foi deletado - mas permite criar nova conta (não é banimento)
  useEffect(() => {
    if (profileDeleted && user) {
      setShowDeletedAlert(true);
      // Não faz logout automático - permite que o usuário crie nova conta
      // Se o usuário fizer logout, reseta o alert
      return;
    } else {
      setShowDeletedAlert(false);
    }
  }, [profileDeleted, user]);

  // Perfil foi deletado - mostra mensagem com opção de sair e criar nova conta
  // IMPORTANTE: Isso não é banimento - é apenas remoção, então o usuário pode criar nova conta
  if (profileDeleted && user && showDeletedAlert) {
    return (
      <View style={styles.deletedContainer}>
        <View style={styles.deletedCard}>
          <View style={styles.deletedIconBox}>
            <Text style={styles.deletedIcon}>🚫</Text>
          </View>
          <Text style={styles.deletedTitle}>Conta Removida</Text>
          <Text style={styles.deletedMessage}>
            Sua conta anterior foi removida do sistema.
          </Text>
          <Text style={styles.deletedSubmessage}>
            Você pode criar uma nova conta normalmente. Isso não é um banimento.
          </Text>
          <Pressable 
            style={styles.deletedLogoutBtn}
            onPress={async () => {
              try {
                await logout();
                setShowDeletedAlert(false);
              } catch (e) {
                // Erro silencioso
              }
            }}
          >
            <Text style={styles.deletedLogoutBtnText}>Sair e criar nova conta</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Aguardando perfil ou carregando - mostra loading sutil (preloader já foi escondido)
  if (loading || !profile) {
    // Se tem usuário mas ainda está carregando perfil, mostra loading
    // Se não tem usuário, mostra tela de autenticação
    if (!user) {
      return (
        <Suspense fallback={null}>
          <AuthStack />
        </Suspense>
      );
    }
    // Se tem usuário mas ainda carregando, mostra loading discreto
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color="#9C27B0" />
      </View>
    );
  }

  // Não logado -> tela de autenticação (sem loading intermediário)
  if (!user) {
    return (
      <Suspense fallback={null}>
        <AuthStack />
      </Suspense>
    );
  }

  // Navegação baseada no perfil (sem loading intermediário)
  return (
    <>
      <Suspense fallback={null}>
        {profile.role === "master" && <MasterTabs />}
        {profile.role === "teacher" && <TeacherTabs />}
        {profile.role === "student" && <StudentRootStack />}
        {!["master", "teacher", "student"].includes(profile.role) && <StudentRootStack />}
      </Suspense>
      {/* Notificações globais de pagamento para alunos */}
      {(profile.role === "student" || !["master", "teacher", "student"].includes(profile.role)) && (
        <GlobalPaymentNotifications />
      )}
      {/* Verificação de aceite de termos para alunos */}
      {(profile.role === "student" || !["master", "teacher", "student"].includes(profile.role)) && (
        <TermsConsentChecker />
      )}
    </>
  );
});

// Document title formatter - sempre mostra apenas "CDMF"
const documentTitleFormatter = () => "CDMF";

// Componente global de notificações de pagamento
import GlobalPaymentNotifications from "./src/components/GlobalPaymentNotifications";
// Componente global para verificar aceite de termos
import TermsConsentChecker from "./src/components/TermsConsentChecker";

const LegalFooterGate = memo(function LegalFooterGate() {
  const { user, loading } = useContext(AuthContext);

  if (loading || user) {
    return null;
  }

  return <LegalFooter />;
});

// Componente Preloader que aguarda autenticação
const PreloaderWithAuth = memo(function PreloaderWithAuth({ 
  onFinish 
}: { 
  onFinish: () => void 
}) {
  const [assetsReady, setAssetsReady] = useState(false);
  const { loading } = useContext(AuthContext);

  const handleAssetsReady = useCallback(() => {
    setAssetsReady(true);
  }, []);

  // Esconde o preloader apenas quando assets E autenticação estiverem prontos
  useEffect(() => {
    if (assetsReady && !loading) {
      // Pequeno delay para garantir transição suave
      setTimeout(() => {
        onFinish();
      }, 100);
    }
  }, [assetsReady, loading, onFinish]);

  return <Preloader onFinish={handleAssetsReady} />;
});

// Componente interno que tem acesso ao AuthContext
const NavigationContainerWithLinking = memo(function NavigationContainerWithLinking({ 
  children 
}: { 
  children: React.ReactNode 
}) {
  // Linking config simplificado - URL sempre limpa
  const linkingConfig = useMemo(() => {
    if (!isWeb) return undefined;
    return createLinkingConfig();
  }, []);
  
  // Memoiza as props do NavigationContainer
  const navigationProps = useMemo(() => ({
    linking: linkingConfig,
    documentTitle: {
      formatter: documentTitleFormatter,
    },
  }), [linkingConfig]);

  return (
    <NavigationContainer {...navigationProps}>
      {children}
    </NavigationContainer>
  );
});

// AppContent otimizado com preloader único
const AppContent = memo(function AppContent() {
  const [showPreloader, setShowPreloader] = useState(true);

  const handlePreloaderFinish = useCallback(() => {
    // Na web, restaura o scroll do body após o preloader
    if (isWeb && typeof document !== "undefined") {
      document.body.style.overflow = "";
    }
    setShowPreloader(false);
  }, []);

  // Bloqueia scroll do body na web enquanto preloader está ativo
  useEffect(() => {
    if (isWeb && typeof document !== "undefined" && showPreloader) {
      document.body.style.overflow = "hidden";
      return () => {
        // Restaura o scroll quando o componente desmontar
        document.body.style.overflow = "";
      };
    }
  }, [showPreloader]);

  // Renderiza AuthProvider sempre para verificar autenticação em background
  // Se o preloader estiver ativo, mostra APENAS o preloader (nada mais é renderizado)
  return (
    <>
      <AlertProvider>
        <ThemeProvider>
          <DesktopProvider>
            <AuthProvider>
              {showPreloader ? (
                // Durante o preloader: mostra APENAS o preloader, nada mais é renderizado
                <PreloaderWithAuth onFinish={handlePreloaderFinish} />
              ) : (
                // Após o preloader: renderiza todo o conteúdo do app
                <PaymentProvider>
                  <ActivityProvider>
                    <NavigationContainerWithLinking>
                      <Routes />
                    </NavigationContainerWithLinking>
                  </ActivityProvider>
                </PaymentProvider>
              )}
              {!showPreloader && <LegalFooterGate />}
            </AuthProvider>
          </DesktopProvider>
        </ThemeProvider>
        {/* Componente de alerta customizado renderizado globalmente */}
        <CustomAlert />
      </AlertProvider>
    </>
  );
});

// App principal
export default function App() {
  const publicLegalDocumentKey = getPublicLegalDocumentKey();
  const isPublicLegalRoute = publicLegalDocumentKey !== null;

  return (
    <View style={isPublicLegalRoute ? styles.publicContainer : styles.container}>
      <ErrorBoundary>
        <SafeAreaProvider>
          {isPublicLegalRoute && publicLegalDocumentKey ? (
            <LegalDocumentPage documentKey={publicLegalDocumentKey} />
          ) : (
            <>
              <AppContent />
          {/* Verifica se há nova versão disponível (apenas web) */}
          <UpdateChecker />
            </>
          )}
        </SafeAreaProvider>
      </ErrorBoundary>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // Na web, precisamos definir altura explícita e bloquear overflow
    ...(isWeb && {
      height: '100%' as any,
      width: '100%' as any,
      overflow: 'hidden' as any,
      position: 'fixed' as any,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    }),
  },
  publicContainer: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    ...(isWeb && {
      minHeight: "100%" as any,
      width: "100%" as any,
    }),
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#666666",
  },
  // Estilos para tela de conta deletada
  deletedContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
    padding: 24,
  },
  deletedCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 32,
    alignItems: "center",
    maxWidth: 380,
    width: "100%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  deletedIconBox: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#FEE2E2",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  deletedIcon: {
    fontSize: 40,
  },
  deletedTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#1E293B",
    textAlign: "center",
    marginBottom: 12,
  },
  deletedMessage: {
    fontSize: 16,
    fontWeight: "600",
    color: "#475569",
    textAlign: "center",
    marginBottom: 8,
  },
  deletedSubmessage: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    marginBottom: 24,
  },
  deletedLogoutBtn: {
    backgroundColor: "#7C3AED",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginBottom: 16,
    width: "100%",
  },
  deletedLogoutBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  deletedLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  deletedLoadingText: {
    fontSize: 12,
    color: "#94A3B8",
    fontWeight: "500",
  },
});
