import { AnalysisResultClient } from "./analysis-result-client";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Analysis Result" };

export default function AnalysisResultPage({ params }: { params: { id: string } }) {
  return <AnalysisResultClient id={params.id} />;
}
