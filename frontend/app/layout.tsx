import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { AuroraBackground } from "@/components/ui/aurora-background";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://jobsynk.app"),
  title: {
    default: "JobSynk — Your Entire Job Search, Handled.",
    template: "%s · JobSynk",
  },
  description:
    "Paste the job URL. Upload your resume. Know your chances in 30 seconds — ATS score, missing keywords, and AI-rewritten bullets tailored to that exact role. Free to start.",
  keywords: [
    "resume optimizer",
    "ATS score",
    "job search",
    "AI career platform",
    "resume analysis",
    "job matching",
  ],
  authors: [{ name: "JobSynk" }],
  creator: "JobSynk",
  openGraph: {
    title: "JobSynk — Your Entire Job Search, Handled.",
    description:
      "Paste the job URL. Upload your resume. Know your chances in 30 seconds.",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "JobSynk — Your Entire Job Search, Handled.",
    description: "Paste the job URL. Upload your resume. Know your chances in 30 seconds.",
  },
  robots: { index: true, follow: true },
  verification: {
    google: "_68f8lOcAhJPdc7BctvtJATDK1izxcVobgco4VR6ggU",
  },
};

export const viewport: Viewport = {
  themeColor: "#080809",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="relative min-h-full flex flex-col">
        <AuroraBackground />
        <Providers>{children}</Providers>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
