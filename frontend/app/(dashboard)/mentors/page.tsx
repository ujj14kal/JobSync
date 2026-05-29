"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { MentorCard } from "@/components/mentors/mentor-card";
import { mentorsApi } from "@/lib/api/mentors";
import { analysisApi } from "@/lib/api/analysis";
import { Search, Users, Filter, Loader2, Brain } from "lucide-react";
import { toast } from "sonner";

const platforms = ["All", "ADPList", "MentorCruise", "Unstop", "LinkedIn"];
const careerStages = ["All stages", "Student", "Entry Level", "Mid Level", "Senior"];

function detectUserCountry(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    const lang = navigator.language ?? "";
    // Map timezone regions to country names for LLM context
    if (tz.startsWith("Asia/Kolkata") || tz.startsWith("Asia/Calcutta") || lang.startsWith("hi")) return "India";
    if (tz.startsWith("Asia/Dubai")) return "UAE";
    if (tz.startsWith("Asia/Singapore")) return "Singapore";
    if (tz.startsWith("Asia/Karachi")) return "Pakistan";
    if (tz.startsWith("Asia/Dhaka")) return "Bangladesh";
    if (tz.startsWith("Asia/Jakarta")) return "Indonesia";
    if (tz.startsWith("Europe/London")) return "United Kingdom";
    if (tz.startsWith("Europe/")) return "Europe";
    if (tz.startsWith("America/New_York") || tz.startsWith("America/Chicago") || tz.startsWith("America/Los_Angeles") || tz.startsWith("America/Denver")) return "United States";
    if (tz.startsWith("America/Toronto") || tz.startsWith("America/Vancouver")) return "Canada";
    if (tz.startsWith("Australia/")) return "Australia";
    return "";
  } catch {
    return "";
  }
}

export default function MentorsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPlatform, setSelectedPlatform] = useState("All");
  const [selectedStage, setSelectedStage] = useState("All stages");
  const [customSearch, setCustomSearch] = useState({
    role: "",
    company: "",
    skills: "",
  });
  const [showCustomSearch, setShowCustomSearch] = useState(false);
  const [customResults, setCustomResults] = useState<any[] | null>(null);
  const [searching, setSearching] = useState(false);

  const userCountry = useMemo(() => detectUserCountry(), []);

  // Get latest analysis for smart recommendations
  const { data: analyses } = useQuery({
    queryKey: ["analyses"],
    queryFn: analysisApi.list,
  });

  const latestAnalysis = analyses?.[0];

  // Get recommendations based on latest analysis
  const { data: recommendedMentors, isLoading: loadingRecommended } = useQuery({
    queryKey: ["mentor-recommendations", latestAnalysis?.id, userCountry],
    queryFn: () => mentorsApi.forAnalysis(latestAnalysis!.id, userCountry),
    enabled: !!latestAnalysis?.id && latestAnalysis.status === "complete",
  });

  async function handleCustomSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!customSearch.role && !customSearch.company) {
      toast.error("Enter a target role or company");
      return;
    }
    setSearching(true);
    try {
      const results = await mentorsApi.search({
        role: customSearch.role || undefined,
        company: customSearch.company || undefined,
        skills: customSearch.skills
          ? customSearch.skills.split(",").map((s) => s.trim())
          : undefined,
      });
      setCustomResults(results);
    } catch {
      toast.error("Search failed. Try again.");
    } finally {
      setSearching(false);
    }
  }

  const displayMentors = customResults ?? recommendedMentors ?? [];

  const filtered = displayMentors
    .filter((m) => {
      const matchesSearch =
        !searchQuery ||
        m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.company.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (m.specializations ?? []).some((s: string) =>
          s.toLowerCase().includes(searchQuery.toLowerCase())
        );

      const matchesPlatform =
        selectedPlatform === "All" ||
        m.platform.toLowerCase() === selectedPlatform.toLowerCase();

      return matchesSearch && matchesPlatform;
    })
    // Free mentors appear before paid ones
    .sort((a, b) => {
      if (a.is_free && !b.is_free) return -1;
      if (!a.is_free && b.is_free) return 1;
      return (b.match_score ?? 0) - (a.match_score ?? 0);
    });

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">
            Mentor Discovery
          </h1>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border bg-[var(--accent-muted)] border-[var(--accent-primary)]/30 text-[var(--accent-hover)]">
            <Brain className="w-2.5 h-2.5" />
            Matched by JobSync AI
          </span>
        </div>
        <p className="text-[14px] text-[var(--text-secondary)]">
          AI-matched mentors based on your target role, skill gaps, and career stage.
          Free mentors shown first · Sourced from ADPList, Unstop, LinkedIn, and MentorCruise
          {userCountry ? ` · Prioritising mentors in ${userCountry}` : ""}.
        </p>
      </motion.div>

      {/* Search & filters */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="p-5 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] space-y-4"
      >
        <div className="flex gap-3">
          {/* Search bar */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search mentors by name, role, or skill…"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
            />
          </div>

          <button
            onClick={() => setShowCustomSearch(!showCustomSearch)}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-overlay)] transition-colors"
          >
            <Filter className="w-4 h-4" />
            Custom search
          </button>
        </div>

        {/* Platform filter */}
        <div className="flex gap-2 flex-wrap">
          {platforms.map((p) => (
            <button
              key={p}
              onClick={() => setSelectedPlatform(p)}
              className={`text-[12px] px-3 py-1.5 rounded-lg border transition-colors ${
                selectedPlatform === p
                  ? "bg-[var(--accent-muted)] border-[var(--accent-primary)]/30 text-[var(--accent-hover)]"
                  : "bg-[var(--bg-elevated)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Custom search panel */}
        {showCustomSearch && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            onSubmit={handleCustomSearch}
            className="pt-4 border-t border-[var(--border-subtle)] grid grid-cols-1 md:grid-cols-3 gap-3"
          >
            <input
              type="text"
              value={customSearch.role}
              onChange={(e) => setCustomSearch((s) => ({ ...s, role: e.target.value }))}
              placeholder="Target role (e.g. SWE at Google)"
              className="px-4 py-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
            />
            <input
              type="text"
              value={customSearch.company}
              onChange={(e) => setCustomSearch((s) => ({ ...s, company: e.target.value }))}
              placeholder="Target company"
              className="px-4 py-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
            />
            <div className="flex gap-2">
              <input
                type="text"
                value={customSearch.skills}
                onChange={(e) => setCustomSearch((s) => ({ ...s, skills: e.target.value }))}
                placeholder="Skills (comma-separated)"
                className="flex-1 px-4 py-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
              />
              <button
                type="submit"
                disabled={searching}
                className="px-4 py-2.5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-[13px] font-medium transition-colors disabled:opacity-50"
              >
                {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
              </button>
            </div>
          </motion.form>
        )}
      </motion.div>

      {/* Results */}
      {loadingRecommended && !customResults ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-64 rounded-2xl animate-shimmer" />
          ))}
        </div>
      ) : filtered.length > 0 ? (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 text-[var(--text-muted)]" />
            <span className="text-[13px] text-[var(--text-muted)]">
              {filtered.length} mentor{filtered.length !== 1 ? "s" : ""} found
              {latestAnalysis && !customResults && " · Based on your latest analysis"}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map((mentor, i) => (
              <MentorCard key={mentor.id} mentor={mentor} index={i} />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-dashed border-[var(--border-subtle)]">
          <Users className="w-10 h-10 text-[var(--text-muted)] mb-3" />
          <p className="text-[14px] text-[var(--text-secondary)] mb-1">
            No mentors found
          </p>
          <p className="text-[12px] text-[var(--text-muted)] text-center max-w-xs">
            {!latestAnalysis
              ? "Run an ATS analysis first to get personalized mentor recommendations"
              : "Try a custom search with different role or skills"}
          </p>
        </div>
      )}
    </div>
  );
}
