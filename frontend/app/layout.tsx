import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { AuroraBackground } from "@/components/ui/aurora-background";

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
  title: {
    default: "JobSynk — AI Career Platform",
    template: "%s · JobSynk",
  },
  description:
    "Optimize your resume with AI-powered ATS analysis, semantic scoring, and recruiter-grade feedback. Land your dream job faster.",
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
    title: "JobSynk — AI Career Platform",
    description:
      "Optimize your resume with AI-powered ATS analysis and recruiter feedback.",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "JobSynk — AI Career Platform",
    description: "AI-powered resume optimizer and ATS scorer.",
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
      </body>
    </html>
  );
}
