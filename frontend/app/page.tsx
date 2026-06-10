import type { Metadata } from "next";
import NavBar from "@/components/landing/NavBar";
import HeroSection from "@/components/landing/HeroSection";
import LandingSections from "@/components/landing/LandingSections";

export const metadata: Metadata = {
  title: "JobSynk — Your Entire Job Search, Handled.",
  description:
    "Paste the job URL. Upload your resume. Know your chances in 30 seconds — ATS score, missing keywords, and AI-rewritten bullets for that exact role. The only tool that works straight from a link.",
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
