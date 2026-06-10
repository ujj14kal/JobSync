"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { MentorCard } from "@/components/mentors/mentor-card";
import { LoadingWalker } from "@/components/ui/LoadingWalker";
import { mentorsApi } from "@/lib/api/mentors";
import { analysisApi } from "@/lib/api/analysis";
import { Search, Users, Loader2 } from "lucide-react";
import { toast } from "sonner";

function detectUserCountry(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    const lang = navigator.language ?? "";
    if (tz.startsWith("Asia/Kolkata") || tz.startsWith("Asia/Calcutta") || lang.startsWith("hi")) return "India";
    if (tz.startsWith("Asia/Dubai")) return "UAE";
    if (tz.startsWith("Asia/Singapore")) return "Singapore";
    if (tz.startsWith("America/New_York") || tz.startsWith("America/Chicago") || tz.startsWith("America/Los_Angeles") || tz.startsWith("America/Denver")) return "United States";
    if (tz.startsWith("Europe/")) return "Europe";
    return "";
  } catch { return ""; }
}

export default function MentorsPage() {
  const [customSearch, setCustomSearch] = useState({ role: "", skills: "" });
  const [showCustomSearch, setShowCustomSearch] = useState(false);
  const [customResults, setCustomResults] = useState<any[] | null>(null);
  const [searching, setSearching] = useState(false);

  const userCountry = useMemo(() => detectUserCountry(), []);

  const { data: analyses } = useQuery({
    queryKey: ["analyses"],
    queryFn: analysisApi.list,
  });
  const latestAnalysis = analyses?.[0];

  const { data: recommendedMentors, isLoading: loadingRecommended } = useQuery({
    queryKey: ["mentor-recommendations", latestAnalysis?.id, userCountry],
    queryFn: () => mentorsApi.forAnalysis(latestAnalysis!.id, userCountry),
    enabled: !!latestAnalysis?.id && latestAnalysis.status === "complete",
  });

  async function handleCustomSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!customSearch.role) { toast.error("Enter a target role"); return; }
    setSearching(true);
    try {
      const results = await mentorsApi.search({
        role: customSearch.role,
        skills: customSearch.skills ? customSearch.skills.split(",").map((s) => s.trim()) : undefined,
      });
      setCustomResults(results);
    } catch { toast.error("Search failed. Try again."); }
    finally { setSearching(false); }
  }

  const displayMentors = customResults ?? recommendedMentors ?? [];

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-1">Find a Mentor</h1>
        <p className="text-[14px] text-[var(--text-secondary)]">
          Real mentors on trusted platforms — curated for your target role
          {latestAnalysis && !customResults ? ` based on your latest analysis` : ""}.
          {userCountry === "India" ? " India-first recommendations shown." : ""}
        </p>
      </motion.div>

      {/* Custom search panel */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="p-5 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] space-y-4"
      >
        <button
          onClick={() => setShowCustomSearch(!showCustomSearch)}
          className="flex items-center gap-2 text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          <Search className="w-4 h-4" />
          {showCustomSearch ? "Hide" : "Search by a specific role or skill"}
        </button>

        {showCustomSearch && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            onSubmit={handleCustomSearch}
            className="grid grid-cols-1 md:grid-cols-3 gap-3"
          >
            <input
              type="text"
              value={customSearch.role}
              onChange={(e) => setCustomSearch((s) => ({ ...s, role: e.target.value }))}
              placeholder="Target role (e.g. Product Manager)"
              className="px-4 py-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
            />
            <input
              type="text"
              value={customSearch.skills}
              onChange={(e) => setCustomSearch((s) => ({ ...s, skills: e.target.value }))}
              placeholder="Skills (e.g. React, System Design)"
              className="px-4 py-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
            />
            <button
              type="submit"
              disabled={searching}
              className="px-4 py-2.5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-[13px] font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Find mentors"}
            </button>
          </motion.form>
        )}
      </motion.div>

      {/* Results */}
      {loadingRecommended && !customResults ? (
        <div className="flex flex-col items-center justify-center py-24 gap-6">
          <LoadingWalker text="Finding mentors based on your needs" />
        </div>
      ) : displayMentors.length > 0 ? (
        <div>
          <div className="flex items-center gap-2 mb-5">
            <Users className="w-4 h-4 text-[var(--text-muted)]" />
            <span className="text-[13px] text-[var(--text-muted)]">
              {displayMentors.length} platform{displayMentors.length !== 1 ? "s" : ""} with mentors matching your profile
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {displayMentors.map((mentor: any, i: number) => (
              <MentorCard key={mentor.id ?? `${mentor.platform}-${i}`} mentor={mentor} index={i} />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-dashed border-[var(--border-subtle)]">
          <Users className="w-10 h-10 text-[var(--text-muted)] mb-3" />
          <p className="text-[14px] text-[var(--text-secondary)] mb-1">No mentors found</p>
          <p className="text-[12px] text-[var(--text-muted)] text-center max-w-xs">
            {!latestAnalysis
              ? "Run an ATS analysis first to get role-matched mentor platforms"
              : "Try a custom search with a specific role"}
          </p>
        </div>
      )}
    </div>
  );
}
