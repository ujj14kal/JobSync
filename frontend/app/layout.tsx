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
  metadataBase: new URL("https://jobsynk.in"),
  title: {
    default: "JobSynk | AI Resume Analyzer, ATS Score & Job Matching Platform",
    template: "%s · JobSynk",
  },
  description:
    "Analyze your resume against any job description, get ATS scores, AI-powered feedback, skill gap analysis, and rewritten bullets tailored to the role. Free to start — no credit card needed.",
  keywords: [
    "resume optimizer",
    "ATS score checker",
    "AI resume analyzer",
    "job matching",
    "resume feedback",
    "career platform",
    "job search tool",
    "resume analysis",
  ],
  authors: [{ name: "JobSynk" }],
  creator: "JobSynk",
  openGraph: {
    title: "JobSynk | AI Resume Analyzer, ATS Score & Job Matching Platform",
    description:
      "Paste the job URL. Upload your resume. Know your chances in 30 seconds — ATS score, missing keywords, and AI-rewritten bullets.",
    type: "website",
    locale: "en_US",
    url: "https://jobsynk.in",
    siteName: "JobSynk",
    images: [
      {
        url: "https://jobsynk.in/opengraph-image",
        width: 1200,
        height: 630,
        alt: "JobSynk — AI Resume Analyzer & ATS Score Platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "JobSynk | AI Resume Analyzer, ATS Score & Job Matching Platform",
    description:
      "Paste the job URL. Upload your resume. Know your chances in 30 seconds.",
    images: ["https://jobsynk.in/opengraph-image"],
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

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://jobsynk.in/#organization",
      name: "JobSynk",
      url: "https://jobsynk.in",
      logo: {
        "@type": "ImageObject",
        url: "https://jobsynk.in/logo.png",
        width: 512,
        height: 512,
      },
      sameAs: [],
    },
    {
      "@type": "WebSite",
      "@id": "https://jobsynk.in/#website",
      url: "https://jobsynk.in",
      name: "JobSynk",
      publisher: { "@id": "https://jobsynk.in/#organization" },
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: "https://jobsynk.in/dashboard?q={search_term_string}",
        },
        "query-input": "required name=search_term_string",
      },
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="relative min-h-full flex flex-col">
        <AuroraBackground />
        <Providers>{children}</Providers>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
