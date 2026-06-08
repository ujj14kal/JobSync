import type { Metadata } from "next";
import dynamic from "next/dynamic";
import NavBar from "@/components/landing/NavBar";
import HeroSection from "@/components/landing/HeroSection";

// Below-fold sections — lazily loaded so they don't block hero paint
const StatsSection        = dynamic(() => import("@/components/landing/StatsSection"),        { ssr: false });
const FeaturesSection     = dynamic(() => import("@/components/landing/FeaturesSection"),     { ssr: false });
const ScoreDemoSection    = dynamic(() => import("@/components/landing/ScoreDemoSection"),    { ssr: false });
const SkillGapSection     = dynamic(() => import("@/components/landing/SkillGapSection"),     { ssr: false });
const TestimonialsSection = dynamic(() => import("@/components/landing/TestimonialsSection"), { ssr: false });
const PricingSection      = dynamic(() => import("@/components/landing/PricingSection"),      { ssr: false });
const CTASection          = dynamic(() => import("@/components/landing/CTASection"),          { ssr: false });
const Footer              = dynamic(() => import("@/components/landing/footer").then((m) => m.Footer), { ssr: false });

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

        {/* Stats bar — animated count-up */}
        <StatsSection />

        {/* Features — 8-card glassmorphism grid */}
        <div id="features">
          <FeaturesSection />
        </div>

        {/* ATS Score Demo — animated donut chart */}
        <div id="analytics">
          <ScoreDemoSection />
        </div>

        {/* Skill Gap Intelligence — graph + roadmap */}
        <div id="skillgap">
          <SkillGapSection />
        </div>

        {/* Social proof */}
        <TestimonialsSection />

        {/* Pricing */}
        <div id="pricing">
          <PricingSection />
        </div>

        {/* Final CTA */}
        <CTASection />
      </main>

      <Footer />
    </div>
  );
}
