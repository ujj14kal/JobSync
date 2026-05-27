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

export default function LandingPage() {
  return (
    <div className="min-h-screen noise" style={{ background: "var(--bg-base)" }}>
      <NavBar />

      <main>
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
