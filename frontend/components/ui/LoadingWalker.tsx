"use client";

export function LoadingWalker({ text }: { text?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
      <style>{`
        @keyframes jsw-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes jsw-glow {
          0%,100% { opacity: 0.35; transform: scale(1); }
          50%     { opacity: 0.6;  transform: scale(1.12); }
        }
        .jsw-logo-wrap {
          position: relative;
          width: 64px;
          height: 64px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .jsw-logo-glow {
          position: absolute;
          inset: -8px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(192,88,0,0.45) 0%, transparent 70%);
          animation: jsw-glow 2s ease-in-out infinite;
        }
        .jsw-logo-img {
          width: 52px;
          height: 52px;
          object-fit: contain;
          animation: jsw-spin 3s linear infinite;
          position: relative;
          z-index: 1;
        }
      `}</style>

      <div className="jsw-logo-wrap">
        <div className="jsw-logo-glow" />
        <img src="/logo.png" alt="" className="jsw-logo-img" />
      </div>

      {text && (
        <p style={{
          color: "rgba(253,251,212,0.4)",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          margin: 0,
        }}>
          {text}
        </p>
      )}
    </div>
  );
}

/** Full-area centered loader — drop into any loading.tsx */
export function PageLoader({ text }: { text?: string }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "60vh",
      width: "100%",
    }}>
      <LoadingWalker text={text} />
    </div>
  );
}
