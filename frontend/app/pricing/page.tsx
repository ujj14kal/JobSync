import type { Metadata } from "next";
import NavBar from "@/components/landing/NavBar";
import PricingSection from "@/components/landing/PricingSection";
import { Footer } from "@/components/landing/footer";

export const metadata: Metadata = {
  title: "Pricing — JobSynk",
  description:
    "Free plan with 3 ATS analyses/day. Pro at ₹299/month for 20 analyses, AI resume builder, interview prep, and Claude Sonnet. No credit card needed to start.",
  openGraph: {
    title: "Pricing — JobSynk",
    description: "Free forever. Pro at ₹299/month. No credit card to start.",
    siteName: "JobSynk",
  },
};

export default function PricingPage() {
  return (
    <div className="relative min-h-screen noise" style={{ background: "var(--bg-base)" }}>
      <NavBar />
      <div className="pt-24">
        <PricingSection />
        <Footer />
      </div>
    </div>
  );
}
