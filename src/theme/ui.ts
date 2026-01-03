export const ui = {
  layout: {
    contentMaxWidth: 360,
    contentWidthPct: 0.82,
  },
  spacing: {
    xs: 6,
    sm: 10,
    md: 14,
    lg: 20,
    xl: 28,
    xxl: 40,
  },
  auth: {
    // Logo: padronizada para todas as telas de auth
    logo: {
      width: 360,
      height: 190,
    },
    // Distância entre logo e o primeiro botão/conteúdo
    logoGap: 0,
    // Offset vertical opcional do bloco de logo (negativo sobe, positivo desce)
    logoOffsetY: 0,
    // Padding inferior geral nas telas noScroll
    bottomPadding: 16,
    buttonTopMargin: 14,
    helperTopMargin: 22,
  },
} as const;
