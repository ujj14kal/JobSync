"use client";

/**
 * LandingSections — Client Component wrapper for all below-fold landing sections.
 * Keeps ssr:false dynamic imports out of the Server Component (page.tsx),
 * which Turbopack forbids since Next.js 15.
 */

import dynamic from "next/dynamic";

const StatsSection        = dynamic(() => import("@/components/landing/StatsSection"));
const FeaturesSection     = dynamic(() => import("@/components/landing/FeaturesSection"));
const ScoreDemoSection    = dynamic(() => import("@/components/landing/ScoreDemoSection"));
const SkillGapSection     = dynamic(() => import("@/components/landing/SkillGapSection"));
const TestimonialsSection = dynamic(() => import("@/components/landing/TestimonialsSection"));
const PricingSection      = dynamic(() => import("@/components/landing/PricingSection"));
const CTASection          = dynamic(() => import("@/components/landing/CTASection"));
const Footer              = dynamic(() => import("@/components/landing/footer").then((m) => m.Footer));

export default function LandingSections() {
  return (
    <>
      <StatsSection />

      <div id="features">
        <FeaturesSection />
      </div>

      <div id="analytics">
        <ScoreDemoSection />
      </div>

      <div id="skillgap">
        <SkillGapSection />
      </div>

      <TestimonialsSection />

      <div id="pricing">
        <PricingSection />
      </div>

      <CTASection />

      <Footer />
    </>
  );
}
