"use client";

export function LoadingWalker({ text = "On the way…" }: { text?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
      <svg
        width="160" height="135"
        viewBox="0 0 160 135"
        xmlns="http://www.w3.org/2000/svg"
      >
        <style>{`
          @keyframes jsw-bob {
            0%,100% { transform: translateY(0px); }
            50%      { transform: translateY(-4px); }
          }
          @keyframes jsw-lf {
            0%,100% { transform: rotate(-24deg); }
            50%     { transform: rotate(24deg); }
          }
          @keyframes jsw-lb {
            0%,100% { transform: rotate(24deg); }
            50%     { transform: rotate(-24deg); }
          }
          @keyframes jsw-af {
            0%,100% { transform: rotate(20deg); }
            50%     { transform: rotate(-20deg); }
          }
          @keyframes jsw-ab {
            0%,100% { transform: rotate(-20deg); }
            50%     { transform: rotate(20deg); }
          }
          @keyframes jsw-step {
            0%   { opacity:0; transform:scaleX(0) translateX(0); }
            12%  { opacity:0.55; transform:scaleX(1) translateX(0); }
            75%  { opacity:0.15; }
            100% { opacity:0; transform:scaleX(1) translateX(-38px); }
          }
          @keyframes jsw-shadow {
            0%,100% { transform:scaleX(0.8); opacity:0.25; }
            50%     { transform:scaleX(1.1); opacity:0.4; }
          }
          .jsw-body { animation: jsw-bob 0.65s ease-in-out infinite; }
          .jsw-lf   { transform-origin: 0 0; animation: jsw-lf 0.65s ease-in-out infinite; }
          .jsw-lb   { transform-origin: 0 0; animation: jsw-lb 0.65s ease-in-out infinite; }
          .jsw-af   { transform-origin: 0 0; animation: jsw-af 0.65s ease-in-out infinite; }
          .jsw-ab   { transform-origin: 0 0; animation: jsw-ab 0.65s ease-in-out infinite; }
          .jsw-s1   { transform-origin: 85px 114px; animation: jsw-step 1.3s ease-out infinite 0s; }
          .jsw-s2   { transform-origin: 85px 114px; animation: jsw-step 1.3s ease-out infinite 0.65s; }
          .jsw-shadow-el { transform-origin: 80px 117px; animation: jsw-shadow 0.65s ease-in-out infinite; }
        `}</style>

        {/* Ground line */}
        <line x1="28" y1="114" x2="132" y2="114" stroke="rgba(253,251,212,0.07)" strokeWidth="1"/>

        {/* Footstep prints */}
        <ellipse className="jsw-s1" cx="85" cy="114" rx="7" ry="2.5" fill="rgba(192,88,0,0.4)"/>
        <ellipse className="jsw-s2" cx="85" cy="114" rx="7" ry="2.5" fill="rgba(192,88,0,0.4)"/>

        {/* Ground shadow */}
        <ellipse className="jsw-shadow-el" cx="80" cy="117" rx="22" ry="5" fill="rgba(0,0,0,0.35)"/>

        {/* ── Everything that bobs ── */}
        <g className="jsw-body" style={{ transformOrigin: "80px 68px" }}>

          {/* ── BACK LEG (behind body) pivot at 76,70 ── */}
          <g transform="translate(76,70)">
            <g className="jsw-lb">
              <line x1="0" y1="0" x2="-4" y2="42" stroke="#161d30" strokeWidth="7" strokeLinecap="round"/>
              <ellipse cx="-4" cy="43" rx="8.5" ry="3" fill="#08090f"/>
            </g>
          </g>

          {/* ── BACK ARM (behind body) pivot at 72,37 ── */}
          <g transform="translate(72,37)">
            <g className="jsw-ab">
              <line x1="0" y1="0" x2="-8" y2="27" stroke="#161d30" strokeWidth="6" strokeLinecap="round"/>
              <circle cx="-8" cy="27" r="4" fill="#f0d8b0"/>
            </g>
          </g>

          {/* ── SUIT BODY ── */}
          <path d="M 65,35 L 95,35 L 92,70 L 68,70 Z" fill="#1a2038"/>
          {/* Left (back) lapel — cream shirt shows */}
          <path d="M 72,35 L 80,51 L 80,35 Z" fill="#f0ebe0"/>
          {/* Right (front) lapel */}
          <path d="M 88,35 L 80,51 L 80,35 Z" fill="#222b45"/>
          {/* Shirt face between lapels */}
          <path d="M 72,35 L 88,35 L 80,51 Z" fill="#edeae0"/>
          {/* Tie */}
          <path d="M 78.5,35 L 81.5,35 L 81,53 L 80,55.5 L 79,53 Z" fill="#C05800"/>
          <rect x="78.5" y="34" width="3" height="3.5" rx="0.8" fill="#8c3800"/>
          {/* Suit stitching / button line */}
          <line x1="80" y1="55" x2="80" y2="69" stroke="#222b45" strokeWidth="1" strokeDasharray="2 3"/>
          {/* Pocket square */}
          <path d="M 84,43 L 91,43 L 90,47 L 85,47 Z" fill="#222b45"/>
          <path d="M 85,43 L 88,40 L 91,43" fill="#edeae0"/>
          {/* Belt */}
          <rect x="68" y="67" width="24" height="4.5" rx="1" fill="#08090f"/>
          <rect x="78" y="67" width="4" height="4.5" fill="#555"/>
          <rect x="79" y="67.8" width="2" height="2.8" rx="0.3" fill="#333"/>

          {/* ── HEAD ── */}
          {/* Neck */}
          <rect x="76" y="29" width="8" height="9" rx="2" fill="#e8c898"/>
          {/* Suit collar overlap */}
          <path d="M 71,35 L 76,29 L 80,33 L 84,29 L 89,35 L 80,40 Z" fill="#1a2038"/>
          {/* Head (facing right) */}
          <ellipse cx="80" cy="17" rx="13.5" ry="14" fill="#f0d8b0"/>
          {/* Hair */}
          <path d="M 66.5,15 Q 66.5,2 80,2 Q 93.5,2 93.5,15" fill="#180a02"/>
          <path d="M 66.5,15 L 66.5,23 Q 67,27 70,27" fill="none" stroke="#180a02" strokeWidth="2.5" strokeLinecap="round"/>
          {/* Ear (back/left side) */}
          <path d="M 68,16 Q 63.5,16 63.5,19.5 Q 63.5,23 68,23"
            fill="none" stroke="#d4a870" strokeWidth="3.5" strokeLinecap="round"/>
          {/* Ear inner */}
          <path d="M 67,17.5 Q 65,19.5 67,22"
            fill="none" stroke="#c09060" strokeWidth="1.5" strokeLinecap="round"/>
          {/* Eye (front/right side) */}
          <circle cx="87.5" cy="16" r="3" fill="#111"/>
          <circle cx="88.5" cy="14.8" r="1.1" fill="white"/>
          {/* Upper eyelid */}
          <path d="M 84.5,14 Q 87.5,12 90.5,14" fill="none" stroke="#180a02" strokeWidth="1.5" strokeLinecap="round"/>
          {/* Eyebrow */}
          <path d="M 84,11 Q 87.5,8.5 91,11" fill="none" stroke="#180a02" strokeWidth="2.2" strokeLinecap="round"/>
          {/* Nose (side profile) */}
          <path d="M 92,18 Q 95.5,20.5 93.5,24.5" fill="none" stroke="#c09060" strokeWidth="2" strokeLinecap="round"/>
          {/* Confident smile */}
          <path d="M 89.5,26.5 Q 91.5,29 93.5,27" fill="none" stroke="#c09060" strokeWidth="1.8" strokeLinecap="round"/>

          {/* ── FRONT LEG pivot at 84,70 ── */}
          <g transform="translate(84,70)">
            <g className="jsw-lf">
              <line x1="0" y1="0" x2="4" y2="42" stroke="#1a2038" strokeWidth="7" strokeLinecap="round"/>
              {/* Oxford shoe */}
              <ellipse cx="5" cy="43" rx="10" ry="3.5" fill="#08090f"/>
              <path d="M -4,43 Q 5,40 14,43" fill="none" stroke="#1a1a2a" strokeWidth="1.2"/>
            </g>
          </g>

          {/* ── FRONT ARM + BRIEFCASE pivot at 88,37 ── */}
          <g transform="translate(88,37)">
            <g className="jsw-af">
              {/* Arm */}
              <line x1="0" y1="0" x2="8" y2="26" stroke="#1a2038" strokeWidth="6" strokeLinecap="round"/>
              {/* Hand */}
              <circle cx="8" cy="26" r="4" fill="#f0d8b0"/>
              {/* Briefcase handle */}
              <path d="M 5,29 Q 5,23 10.5,23 Q 16,23 16,29"
                fill="none" stroke="#6e2c00" strokeWidth="2.5" strokeLinecap="round"/>
              {/* Briefcase body */}
              <rect x="2" y="29" width="17" height="13.5" rx="2.5" fill="#C05800"/>
              {/* Center divider */}
              <line x1="10.5" y1="29" x2="10.5" y2="42.5" stroke="#903800" strokeWidth="1.5"/>
              {/* Top ridge */}
              <rect x="2" y="29" width="17" height="3" rx="1.5" fill="#903800"/>
              {/* Clasp */}
              <rect x="7" y="33.5" width="7" height="4" rx="1.2" fill="#d4aa30"/>
              <line x1="10.5" y1="33.5" x2="10.5" y2="37.5" stroke="#a88800" strokeWidth="1.2"/>
              {/* Outline / stitching */}
              <rect x="2" y="29" width="17" height="13.5" rx="2.5"
                fill="none" stroke="#6e2c00" strokeWidth="0.8"/>
            </g>
          </g>

        </g>
      </svg>

      <p style={{
        color: "rgba(253,251,212,0.4)",
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
      }}>
        {text}
      </p>
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
