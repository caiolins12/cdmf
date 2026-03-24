import React, { useState } from "react";

type Props = {
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  onStart?: () => void;
  onSuccess?: () => void;
  onError?: (error: unknown) => void;
};

function GoogleGIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M9 3.48c1.69 0 2.84.73 3.49 1.34l2.54-2.54C13.46.82 11.42 0 9 0 5.48 0 2.44 2.02.96 4.96l2.96 2.3C4.57 5.34 6.62 3.48 9 3.48z"
      />
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84c-.21 1.12-.84 2.07-1.79 2.71l2.9 2.25c1.69-1.55 2.69-3.84 2.69-6.6z"
      />
      <path
        fill="#FBBC05"
        d="M3.92 10.74a5.41 5.41 0 0 1-.29-1.74c0-.6.1-1.18.29-1.74L.96 4.96A8.99 8.99 0 0 0 0 9c0 1.45.35 2.82.96 4.04l2.96-2.3z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.42 0 4.46-.8 5.95-2.18l-2.9-2.25c-.8.54-1.83.86-3.05.86-2.38 0-4.43-1.86-5.08-4.38L.96 13.04C2.44 15.98 5.48 18 9 18z"
      />
    </svg>
  );
}

export default function GoogleButton({
  onPress,
  disabled = false,
  loading = false,
  onStart,
}: Props) {
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const isInteractive = !disabled && !loading;

  const handleClick = () => {
    if (!isInteractive) return;
    onStart?.();
    onPress();
  };

  const wrapperScale = isPressed ? 0.985 : isHovered ? 1.01 : 1;
  const wrapperShadow = isHovered
    ? "0 8px 20px rgba(60, 64, 67, 0.18)"
    : "0 1px 2px rgba(60, 64, 67, 0.12)";

  return (
    <div
      onMouseEnter={() => { if (!disabled) setIsHovered(true); }}
      onMouseLeave={() => { setIsHovered(false); setIsPressed(false); }}
      onMouseDown={() => { if (isInteractive) setIsPressed(true); }}
      onMouseUp={() => setIsPressed(false)}
      onTouchStart={() => { if (isInteractive) setIsPressed(true); }}
      onTouchEnd={() => setIsPressed(false)}
      onTouchCancel={() => setIsPressed(false)}
      style={{
        width: "100%",
        maxWidth: 340,
        marginTop: 4,
        opacity: disabled ? 0.65 : loading ? 0.9 : 1,
        pointerEvents: disabled ? "none" : "auto",
        transform: `scale(${wrapperScale})`,
        transition: "transform 140ms ease, box-shadow 160ms ease, opacity 160ms ease",
        boxShadow: wrapperShadow,
        borderRadius: 14,
        background: "#FFFFFF",
      }}
    >
      <button
        type="button"
        onClick={handleClick}
        disabled={!isInteractive}
        aria-busy={loading}
        style={{
          width: "100%",
          minHeight: 58,
          borderRadius: 14,
          border: "1px solid #DADCE0",
          background: "#FFFFFF",
          color: "#3C4043",
          padding: "0 24px",
          fontSize: 16,
          fontWeight: 600,
          fontFamily: "\"Roboto\", \"Segoe UI\", \"Helvetica Neue\", Arial, sans-serif",
          cursor: !isInteractive ? "not-allowed" : "pointer",
          boxShadow: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          letterSpacing: 0.2,
          position: "relative",
          transition: "background-color 140ms ease, color 140ms ease",
        }}
      >
        <span
          style={{
            width: 22,
            height: 22,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            position: "absolute",
            left: 20,
            top: "50%",
            transform: "translateY(-50%)",
          }}
        >
          <GoogleGIcon />
        </span>
        <span>{loading ? "Conectando ao Google..." : "Fazer login com o Google"}</span>
      </button>
      {loading ? (
        <div
          style={{
            marginTop: 10,
            color: "#5F6368",
            fontSize: 13,
            fontWeight: 500,
            textAlign: "center",
          }}
        >
          Aguarde, estamos abrindo o login.
        </div>
      ) : null}
    </div>
  );
}
