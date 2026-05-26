import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

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
    default: "JobSync — AI Career Platform",
    template: "%s · JobSync",
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
  authors: [{ name: "JobSync" }],
  creator: "JobSync",
  openGraph: {
    title: "JobSync — AI Career Platform",
    description:
      "Optimize your resume with AI-powered ATS analysis and recruiter feedback.",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "JobSync — AI Career Platform",
    description: "AI-powered resume optimizer and ATS scorer.",
  },
  robots: { index: true, follow: true },
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
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
