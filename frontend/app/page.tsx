import type { Metadata } from "next";
import NavBar from "@/components/landing/NavBar";
import HeroSection from "@/components/landing/HeroSection";
import StatsSection from "@/components/landing/StatsSection";
import FeaturesSection from "@/components/landing/FeaturesSection";
import ScoreDemoSection from "@/components/landing/ScoreDemoSection";
import SkillGapSection from "@/components/landing/SkillGapSection";
import TestimonialsSection from "@/components/landing/TestimonialsSection";
import PricingSection from "@/components/landing/PricingSection";
import CTASection from "@/components/landing/CTASection";
import { Footer } from "@/components/landing/footer";

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
        {/* SEO: crawlable app name and purpose for Google verification */}
        <h1 className="sr-only">
          JobSynk — AI-Powered Resume Analyzer, ATS Scorer &amp; Career Platform
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
