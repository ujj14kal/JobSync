import { AnalysisClient } from "./analysis-client";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "ATS Analysis" };

export default function AnalysisPage() {
  return <AnalysisClient />;
}
