import Link from "next/link";
import { Zap } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-[var(--border-subtle)] py-12 px-6">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-[var(--accent-primary)] flex items-center justify-center">
            <Zap className="w-3.5 h-3.5 text-white" fill="white" />
          </div>
          <span className="text-[14px] font-semibold text-[var(--text-secondary)]">
            JobSync
          </span>
        </Link>

        <p className="text-[12px] text-[var(--text-muted)]">
          © 2025 JobSync. Built with Next.js, FastAPI, and Groq.
        </p>

        <div className="flex items-center gap-6 text-[12px] text-[var(--text-muted)]">
          {["Privacy", "Terms", "GitHub"].map((item) => (
            <Link key={item} href="#" className="hover:text-[var(--text-secondary)] transition-colors">
              {item}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  );
}
