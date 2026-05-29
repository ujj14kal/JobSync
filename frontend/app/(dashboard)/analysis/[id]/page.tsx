import { AnalysisResultClient } from "./analysis-result-client";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Analysis Result" };

export default async function AnalysisResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AnalysisResultClient id={id} />;
}
