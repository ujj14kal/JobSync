import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "JobSynk — Your Entire Job Search, Handled.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OGImage() {
  const logoRes = await fetch(new URL("/logo.png", "https://jobsynk.in"));
  const logoBuffer = await logoRes.arrayBuffer();
  const logoBase64 = `data:image/png;base64,${Buffer.from(logoBuffer).toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          background: "#08080a",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: "80px 96px",
          fontFamily: "sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Background glow */}
        <div
          style={{
            position: "absolute",
            top: -120,
            left: -80,
            width: 600,
            height: 600,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(192,88,0,0.18) 0%, transparent 70%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -160,
            right: -100,
            width: 500,
            height: 500,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(113,54,0,0.14) 0%, transparent 70%)",
          }}
        />

        {/* Dot grid overlay */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "radial-gradient(circle, rgba(253,251,212,0.06) 1.5px, transparent 1.5px)",
            backgroundSize: "28px 28px",
          }}
        />

        {/* Logo + name */}
        <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 36 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoBase64}
            width={60}
            height={60}
            style={{ borderRadius: 12, objectFit: "contain" }}
            alt="JobSynk logo"
          />
          <span
            style={{
              fontSize: 42,
              fontWeight: 700,
              color: "#FDFBD4",
              letterSpacing: "-0.5px",
            }}
          >
            JobSynk
          </span>
        </div>

        {/* Headline */}
        <div
          style={{
            fontSize: 68,
            fontWeight: 800,
            color: "#FDFBD4",
            lineHeight: 1.1,
            letterSpacing: "-1.5px",
            marginBottom: 28,
            maxWidth: 820,
          }}
        >
          Your entire job search,{" "}
          <span style={{ color: "#C05800" }}>handled.</span>
        </div>

        {/* Sub-line */}
        <div
          style={{
            fontSize: 24,
            color: "rgba(253,251,212,0.55)",
            fontWeight: 400,
            maxWidth: 620,
            lineHeight: 1.5,
            marginBottom: 52,
          }}
        >
          Paste the job URL · Upload your resume · Know your chances in 30s
        </div>

        {/* Pill badges */}
        <div style={{ display: "flex", gap: 14 }}>
          {["Free to start", "AI-powered", "No credit card"].map((label) => (
            <div
              key={label}
              style={{
                padding: "10px 20px",
                borderRadius: 999,
                border: "1px solid rgba(192,88,0,0.4)",
                background: "rgba(192,88,0,0.1)",
                color: "#FDFBD4",
                fontSize: 16,
                fontWeight: 500,
              }}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Domain watermark */}
        <div
          style={{
            position: "absolute",
            bottom: 44,
            right: 96,
            fontSize: 20,
            color: "rgba(253,251,212,0.3)",
            fontWeight: 500,
            letterSpacing: "0.5px",
          }}
        >
          jobsynk.in
        </div>
      </div>
    ),
    { ...size }
  );
}
