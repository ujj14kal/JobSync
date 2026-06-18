import Link from "next/link";

const LINKS = [
  { label: "Privacy Policy",  href: "/legal/privacy-policy" },
  { label: "Terms of Service", href: "/legal/terms" },
  { label: "Support",          href: "/support" },
  { label: "Pricing",          href: "/pricing" },
];

export function Footer() {
  return (
    <footer className="border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
      <div className="max-w-7xl mx-auto px-6 py-10 flex flex-col md:flex-row items-center justify-between gap-6">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2 group">
          <img src="/logo.png" alt="JobSynk" className="w-6 h-6 object-contain transition-opacity group-hover:opacity-80" />
          <span className="text-sm font-semibold" style={{ color: "rgba(148,163,184,0.8)" }}>
            JobSynk
          </span>
        </Link>

        {/* Centre copy */}
        <p className="text-xs text-center" style={{ color: "rgba(100,116,139,0.7)" }}>
          © 2026 JobSynk · Built by{" "}
          <a
            href="https://github.com/ujj14kal"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white transition-colors underline"
          >
            Ujjwal Kalra
          </a>
          {" "}· Free for students &amp; job seekers
        </p>

        {/* Links */}
        <div className="flex items-center gap-5">
          {LINKS.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="text-xs transition-colors hover:text-white"
              style={{ color: "rgba(100,116,139,0.8)" }}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Bottom bar */}
      <div
        className="border-t px-6 py-4"
        style={{ borderColor: "rgba(255,255,255,0.04)" }}
      >
        <p className="text-center text-[10px]" style={{ color: "rgba(100,116,139,0.5)" }}>
          Scoring powered by the <strong style={{ color: "rgba(192,88,0,0.7)" }}>JobSynk AI Engine</strong> — our custom-trained neural model (6,000+ resume-job pairs). &nbsp;·&nbsp;
          AI feedback via Groq (LLaMA 3.3 70B). &nbsp;·&nbsp;
          We never sell your data. &nbsp;·&nbsp;
          <a href="/legal/privacy-policy" className="underline hover:text-white transition-colors">Privacy Policy</a>
          &nbsp;·&nbsp;
          <a href="/legal/terms" className="underline hover:text-white transition-colors">Terms</a>
        </p>
      </div>
    </footer>
  );
}
