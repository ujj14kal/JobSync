import { createClient as createAnonClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { AdminClient } from "./admin-client";

export type FaqQuestion = {
  id: string;
  user_id: string;
  question: string;
  answer: string | null;
  answered_at: string | null;
  created_at: string;
};

const ADMIN_EMAIL = "ujj.kalra10@gmail.com";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://dzdziagugdcbkictslrt.supabase.co";

function serviceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured in environment variables");
  return createServiceClient(SUPABASE_URL, key);
}

async function addCreditsAction(
  userId: string,
  creditType: string,
  amount: number
): Promise<{ error?: string }> {
  "use server";
  try {
    const anonClient = await createAnonClient();
    const { data: { user } } = await anonClient.auth.getUser();
    if (!user || user.email !== ADMIN_EMAIL) return { error: "Unauthorized" };

    const svc = serviceClient();
    const { error } = await svc.from("user_credits").insert({
      user_id: userId,
      credit_type: creditType,
      credits_total: amount,
      credits_used: 0,
    });
    if (error) return { error: error.message };
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

async function deleteFaqAction(questionId: string): Promise<{ error?: string }> {
  "use server";
  try {
    const anonClient = await createAnonClient();
    const { data: { user } } = await anonClient.auth.getUser();
    if (!user || user.email !== ADMIN_EMAIL) return { error: "Unauthorized" };

    const svc = serviceClient();
    const { error } = await svc.from("faq_questions").delete().eq("id", questionId);
    if (error) return { error: error.message };
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

async function answerFaqAction(questionId: string, answer: string): Promise<{ error?: string }> {
  "use server";
  try {
    const anonClient = await createAnonClient();
    const { data: { user } } = await anonClient.auth.getUser();
    if (!user || user.email !== ADMIN_EMAIL) return { error: "Unauthorized" };

    const svc = serviceClient();
    const { error } = await svc
      .from("faq_questions")
      .update({ answer: answer.trim(), answered_at: new Date().toISOString() })
      .eq("id", questionId);
    if (error) return { error: error.message };
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

export default async function AdminPage() {
  const supabase = await createAnonClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== ADMIN_EMAIL) redirect("/dashboard");

  const svc = serviceClient();

  // ── Fetch stats in parallel ────────────────────────────────────────────────
  const [usersRes, analysesRes, subRes, creditsRes, faqRes] = await Promise.all([
    svc
      .from("user_profiles")
      .select("id,email,full_name,career_stage,created_at")
      .order("created_at", { ascending: false })
      .limit(100),
    svc.from("analyses").select("id", { count: "exact", head: true }),
    svc
      .from("user_subscriptions")
      .select("user_id,plan,billing_cycle,current_period_end")
      .eq("plan", "pro"),
    svc.from("user_credits").select("user_id,credit_type,credits_total,credits_used"),
    svc.from("faq_questions").select("*").order("created_at", { ascending: false }),
  ]);

  const users = usersRes.data ?? [];
  const totalAnalyses = analysesRes.count ?? 0;
  const proSubs = subRes.data ?? [];
  const credits = creditsRes.data ?? [];

  const creditsByUser: Record<string, { type: string; remaining: number }[]> = {};
  for (const c of credits) {
    if (!creditsByUser[c.user_id]) creditsByUser[c.user_id] = [];
    creditsByUser[c.user_id].push({
      type: c.credit_type,
      remaining: c.credits_total - c.credits_used,
    });
  }

  const proUserIds = new Set(proSubs.map((s) => s.user_id));

  const enrichedUsers = users.map((u) => ({
    ...u,
    is_pro: proUserIds.has(u.id),
    credits: creditsByUser[u.id] ?? [],
  }));

  const stats = {
    totalUsers: users.length,
    proUsers: proSubs.length,
    totalAnalyses,
    last7Days: users.filter(
      (u) => new Date(u.created_at) > new Date(Date.now() - 7 * 86400 * 1000)
    ).length,
  };

  return (
    <AdminClient
      users={enrichedUsers}
      stats={stats}
      faqQuestions={(faqRes.data ?? []) as FaqQuestion[]}
      onAddCredits={addCreditsAction}
      onDeleteFaq={deleteFaqAction}
      onAnswerFaq={answerFaqAction}
    />
  );
}
