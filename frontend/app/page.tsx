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
        {/* App name and purpose — visible to crawlers */}
        <h1 className="text-center text-[11px] tracking-wide py-2 px-4" style={{ color: "rgba(100,116,139,0.4)" }}>
          JobSynk — AI-powered resume analysis, ATS scoring, and career platform. Free for students and job seekers.
        </h1>

        {/* Hero — 3D neural network + floating cards */}
        <HeroSection />

        {/* All below-fold sections — rendered in Client Component so ssr:false is allowed */}
        <LandingSections />
      </main>
    </div>
  );
}
