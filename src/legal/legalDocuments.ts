export type LegalDocumentKey = "privacyPolicy" | "termsOfService";

export type LegalDocumentSection = {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
};

export type LegalDocumentDefinition = {
  key: LegalDocumentKey;
  title: string;
  shortTitle: string;
  description: string;
  path: string;
  lastUpdated: string;
  intro: string[];
  sections: LegalDocumentSection[];
};

export type LegalAcceptanceProfile = {
  termsAccepted?: boolean;
  termsAcceptedAt?: number;
  privacyPolicyAccepted?: boolean;
  privacyPolicyAcceptedAt?: number;
  termsOfServiceAccepted?: boolean;
  termsOfServiceAcceptedAt?: number;
};

export const LEGAL_DOCUMENT_KEYS: LegalDocumentKey[] = [
  "privacyPolicy",
  "termsOfService",
];

export const LEGAL_DOCUMENTS: Record<LegalDocumentKey, LegalDocumentDefinition> = {
  privacyPolicy: {
    key: "privacyPolicy",
    title: "Política de Privacidade",
    shortTitle: "Privacidade",
    description:
      "Explica como o CDMF coleta, utiliza, protege e compartilha os dados pessoais tratados na plataforma.",
    path: "/privacy-policy",
    lastUpdated: "19/03/2026",
    intro: [
      "Esta Política de Privacidade descreve como o CDMF trata os dados pessoais utilizados para operação da plataforma, gestão de turmas, autenticação, cobranças e comunicação com alunos, professores e administradores.",
      "Ao utilizar o sistema, você reconhece que seus dados poderão ser tratados conforme as finalidades descritas abaixo, sempre com foco na operação do serviço, segurança e cumprimento de obrigações legais.",
    ],
    sections: [
      {
        title: "1. Dados coletados",
        bullets: [
          "Dados de cadastro, como nome, e-mail, telefone, foto de perfil e identificadores da conta.",
          "Dados operacionais, como perfil de acesso, turmas vinculadas, presenças, registros de atividades e histórico de uso relevante ao funcionamento da plataforma.",
          "Dados financeiros e administrativos necessários para cobranças, pagamentos, conciliação e atendimento.",
        ],
      },
      {
        title: "2. Finalidades do tratamento",
        bullets: [
          "Permitir acesso seguro à conta do usuário e autenticar sessões.",
          "Gerenciar alunos, professores, turmas, eventos, cobranças e comunicações relacionadas ao serviço.",
          "Cumprir obrigações legais, prevenir fraudes, responder solicitações e manter a integridade da plataforma.",
        ],
      },
      {
        title: "3. Compartilhamento de dados",
        paragraphs: [
          "O CDMF não comercializa dados pessoais. O compartilhamento pode ocorrer apenas quando necessário para operação do serviço, incluindo provedores de infraestrutura, autenticação, banco de dados, pagamentos e comunicação, sempre dentro do mínimo necessário.",
          "Também poderemos compartilhar dados quando houver obrigação legal, ordem de autoridade competente ou necessidade de exercício regular de direitos.",
        ],
      },
      {
        title: "4. Armazenamento e segurança",
        paragraphs: [
          "Adotamos medidas técnicas e organizacionais razoáveis para proteger os dados contra acesso indevido, perda, alteração ou divulgação não autorizada.",
          "Os dados são mantidos pelo período necessário para execução do serviço, atendimento de obrigações legais e resguardo de direitos, respeitando a finalidade de cada tratamento.",
        ],
      },
      {
        title: "5. Direitos do titular",
        bullets: [
          "Solicitar confirmação de tratamento e acesso aos dados disponíveis na plataforma.",
          "Pedir correção de dados incompletos, desatualizados ou imprecisos.",
          "Solicitar exclusão ou restrição, quando cabível e sem prejuízo de obrigações legais ou contratuais.",
        ],
      },
      {
        title: "6. Contato e atualizações",
        paragraphs: [
          "Dúvidas, solicitações e pedidos relacionados à privacidade podem ser encaminhados pelos canais oficiais disponibilizados pelo CDMF.",
          "Esta política pode ser atualizada periodicamente. Quando houver alterações relevantes, a versão mais recente ficará publicada nesta URL.",
        ],
      },
    ],
  },
  termsOfService: {
    key: "termsOfService",
    title: "Termos de Serviço",
    shortTitle: "Termos",
    description:
      "Define as regras de uso do CDMF, responsabilidades dos usuários e condições gerais para utilização da plataforma.",
    path: "/terms-of-service",
    lastUpdated: "19/03/2026",
    intro: [
      "Estes Termos de Serviço regulam o acesso e o uso da plataforma CDMF por alunos, professores, administradores e demais usuários autorizados.",
      "Ao acessar ou utilizar o sistema, o usuário concorda em seguir estas regras, manter informações corretas e utilizar a plataforma apenas para finalidades legítimas relacionadas ao serviço.",
    ],
    sections: [
      {
        title: "1. Uso permitido",
        bullets: [
          "Utilizar a plataforma apenas para finalidades acadêmicas, administrativas, financeiras e operacionais ligadas ao CDMF.",
          "Manter dados de acesso sob responsabilidade do próprio usuário, evitando compartilhamento indevido de credenciais.",
          "Respeitar os perfis de permissão e não tentar acessar, alterar ou excluir informações sem autorização.",
        ],
      },
      {
        title: "2. Conta e responsabilidades",
        paragraphs: [
          "Cada usuário é responsável pelas informações fornecidas, pela veracidade dos dados cadastrados e pelo uso feito a partir da própria conta.",
          "O CDMF poderá limitar, suspender ou encerrar acessos em caso de uso abusivo, violação destes termos, fraude, tentativa de invasão ou descumprimento de obrigações aplicáveis.",
        ],
      },
      {
        title: "3. Conteúdo e operação do serviço",
        bullets: [
          "A plataforma pode exibir informações de turmas, pagamentos, eventos, comunicações, notificações e históricos administrativos.",
          "Algumas funcionalidades dependem de serviços de terceiros, como autenticação, hospedagem, banco de dados e meios de pagamento.",
          "O CDMF pode ajustar, evoluir, corrigir ou descontinuar funcionalidades quando necessário para manutenção ou melhoria do serviço.",
        ],
      },
      {
        title: "4. Pagamentos e registros",
        paragraphs: [
          "Quando houver cobranças, o usuário concorda que registros financeiros, vencimentos, comprovações e conciliações possam ser processados e armazenados para execução do serviço.",
          "Eventuais regras comerciais, prazos, cancelamentos ou condições específicas de cobrança podem ser complementadas por comunicações próprias do CDMF.",
        ],
      },
      {
        title: "5. Limitações e disponibilidade",
        paragraphs: [
          "O CDMF busca manter a plataforma disponível e segura, mas não garante operação ininterrupta, ausência total de erros ou disponibilidade absoluta de serviços de terceiros.",
          "Falhas técnicas, manutenções, atualizações e indisponibilidades externas podem impactar temporariamente o uso da plataforma.",
        ],
      },
      {
        title: "6. Atualizações destes termos",
        paragraphs: [
          "Os Termos de Serviço podem ser atualizados a qualquer momento para refletir mudanças operacionais, legais ou técnicas.",
          "A versão vigente permanecerá publicada nesta URL e poderá ser novamente apresentada ao usuário caso seja necessário um novo aceite.",
        ],
      },
    ],
  },
};

export function getLegalDocument(key: LegalDocumentKey): LegalDocumentDefinition {
  return LEGAL_DOCUMENTS[key];
}

export function getLegalDocumentUrl(key: LegalDocumentKey, origin?: string): string {
  const baseOrigin =
    origin ?? (typeof window !== "undefined" ? window.location.origin : "");

  return `${baseOrigin}${LEGAL_DOCUMENTS[key].path}`;
}

function normalizePath(pathname: string): string {
  if (!pathname) {
    return "/";
  }

  const normalized = pathname.trim().replace(/\/+$/, "");
  return normalized === "" ? "/" : normalized;
}

export function getLegalDocumentKeyFromPath(pathname: string): LegalDocumentKey | null {
  const normalized = normalizePath(pathname);

  for (const key of LEGAL_DOCUMENT_KEYS) {
    if (normalizePath(LEGAL_DOCUMENTS[key].path) === normalized) {
      return key;
    }
  }

  return null;
}

export function hasAcceptedPrivacyPolicy(profile?: LegalAcceptanceProfile | null): boolean {
  return Boolean(profile?.privacyPolicyAccepted || profile?.termsAccepted);
}

export function hasAcceptedTermsOfService(profile?: LegalAcceptanceProfile | null): boolean {
  return Boolean(profile?.termsOfServiceAccepted || profile?.termsAccepted);
}

export function hasAcceptedAllLegalDocuments(
  profile?: LegalAcceptanceProfile | null
): boolean {
  return hasAcceptedPrivacyPolicy(profile) && hasAcceptedTermsOfService(profile);
}

export function needsLegacyLegalMigration(
  profile?: LegalAcceptanceProfile | null
): boolean {
  return Boolean(
    profile?.termsAccepted &&
      (!profile?.privacyPolicyAccepted || !profile?.termsOfServiceAccepted)
  );
}

export function getLegacyAcceptedTimestamp(
  profile?: LegalAcceptanceProfile | null
): number {
  return profile?.termsAcceptedAt ?? Date.now();
}
