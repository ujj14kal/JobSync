import type { Metadata } from "next";
import NavBar from "@/components/landing/NavBar";
import HeroSection from "@/components/landing/HeroSection";
import LandingSections from "@/components/landing/LandingSections";

export const metadata: Metadata = {
  title: "JobSynk — AI-Powered Resume Analyzer & ATS Scorer",
  description:
    "JobSynk is a free AI career platform. Paste a job URL, upload your resume, and get an instant ATS score, keyword gap analysis, and AI-rewritten bullet points in under 30 seconds.",
};

export default function LandingPage() {
  return (
    <div className="relative min-h-screen noise" style={{ background: "var(--bg-base)" }}>
      <NavBar />

      <main>
        {/* Hero — 3D neural network + floating cards */}
        <HeroSection />

        {/* All below-fold sections — rendered in Client Component so ssr:false is allowed */}
        <LandingSections />
      </main>
    </div>
  );
}
