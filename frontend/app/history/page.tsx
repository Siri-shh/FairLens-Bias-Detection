"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, Clock, Activity, ArrowRight, BarChart2 } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import { API_BASE } from "@/lib/api";
import { getRecentJobs } from "@/lib/recentJobs";

type HistoryItem = {
  job_id: string;
  completed_at: string;
  dataset_info: { filename: string; total_rows: number; target_column: string };
  overall_severity: string;
  fairness_score: number;
  metrics_passed: number;
  metrics_failed: number;
};

function SeverityBadge({ severity }: { severity: string }) {
  const s = severity?.toLowerCase();
  const map: Record<string, string> = {
    none:     "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-700/40",
    low:      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-700/40",
    medium:   "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-700/40",
    high:     "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/20 dark:text-rose-300 dark:border-rose-700/40",
    critical: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-700/40",
  };
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${map[s] ?? map.medium}`}>
      {(severity || "Unknown").toUpperCase()}
    </span>
  );
}

function ScoreRing({ score }: { score: number }) {
  const color = score >= 75 ? "#10b981" : score >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <div className="flex flex-col items-end">
      <div className="text-2xl font-bold text-amber-950 dark:text-amber-100">
        {score}
        <span className="text-sm font-normal text-amber-900/50 dark:text-amber-300/50 ml-1">/ 100</span>
      </div>
      <div className="mt-1 h-1.5 w-20 rounded-full bg-amber-500/10 dark:bg-amber-400/10">
        <div
            className="h-1.5 rounded-full transition-all"
            style={{ width: `${score}%`, backgroundColor: color }}
        />
      </div>
      <div className="mt-1 text-xs text-amber-900/45 dark:text-amber-300/45">FairLens Score</div>
    </div>
  );
}

export default function HistoryPage() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchHistory() {
      const localJobs = getRecentJobs();
      if (localJobs.length === 0) {
        setHistory([]);
        setLoading(false);
        return;
      }

      const jobIds = localJobs.map((job) => job.job_id).join(",");

      try {
        const res = await fetch(`${API_BASE}/history?job_ids=${encodeURIComponent(jobIds)}`, {
          headers: (process.env.NEXT_PUBLIC_API_KEY ? { "X-API-Key": process.env.NEXT_PUBLIC_API_KEY } : {}) as Record<string, string>
        });
        if (!res.ok) throw new Error("Failed to fetch history");
        setHistory(await res.json());
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    fetchHistory();
  }, []);

  const chartData = [...history].reverse().map((item) => ({
    date:   new Date(item.completed_at).toLocaleDateString(),
    score:  item.fairness_score,
    label:  item.dataset_info?.filename || "Unknown",
    job_id: item.job_id,
  }));

  return (
    <div className="space-y-8 animate-fade-in">

      {/* ── Header ── */}
      <section className="panel px-6 py-6 sm:px-8">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center justify-center h-9 w-9 rounded-full border border-amber-500/20 bg-amber-500/10 text-amber-700 transition hover:bg-amber-500/20 dark:text-amber-400 dark:border-amber-400/20"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <div className="text-xs uppercase tracking-widest text-amber-900/50 dark:text-amber-300/50 mb-0.5">
                Workspace
              </div>
              <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-amber-950 dark:text-amber-100">
                Audit History
              </h1>
              <p className="mt-0.5 text-sm text-amber-900/60 dark:text-amber-300/60">
                Compare past model fairness analyses over time
              </p>
            </div>
          </div>
          <Link href="/compare" className="btn-secondary px-4 py-2 text-sm">
            <BarChart2 className="h-4 w-4" />
            Compare Models
          </Link>
        </div>
      </section>

      {/* ── Trend Chart ── */}
      {!loading && history.length > 1 && (
        <section className="panel-soft p-6">
          <div className="flex items-center gap-2 mb-6">
            <Activity className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-amber-950 dark:text-amber-100">
              FairLens Score Trend
            </h2>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(218,155,40,0.12)" />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "rgb(120 83 35 / 0.6)", fontSize: 12 }}
                  dy={10}
                />
                <YAxis
                  domain={[0, 100]}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "rgb(120 83 35 / 0.6)", fontSize: 12 }}
                  dx={-10}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: "12px",
                    border: "1px solid rgba(218,155,40,0.2)",
                    background: "rgba(255,252,248,0.97)",
                    boxShadow: "0 8px 20px rgba(218,155,40,0.12)",
                  }}
                  formatter={(value: any) => [`${value}/100`, "FairLens Score"]}
                  labelFormatter={(_label, payload) => payload[0]?.payload.label || _label}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="#d97706"
                  strokeWidth={3}
                  dot={{ fill: "#d97706", strokeWidth: 2, r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* ── Audit List ── */}
      <section className="panel-soft overflow-hidden">
        <div className="px-6 py-4 border-b border-amber-600/10 dark:border-amber-400/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-amber-950 dark:text-amber-100">
              Past Audits
            </h2>
          </div>
          {history.length > 0 && (
            <div className="text-xs text-amber-900/50 dark:text-amber-300/50 uppercase tracking-wider">
              {history.length} audit{history.length !== 1 ? "s" : ""}
            </div>
          )}
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <div className="inline-flex items-center gap-2 text-amber-900/50 dark:text-amber-300/50">
              <div className="h-4 w-4 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
              Loading history…
            </div>
          </div>
        ) : history.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="text-amber-900/50 dark:text-amber-300/50 text-sm">No completed audits found.</div>
            <Link href="/upload" className="btn-primary px-5 py-2.5 text-sm inline-flex">
              Start a new audit <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-amber-600/8 dark:divide-amber-400/8">
            {history.map((item) => (
              <Link
                key={item.job_id}
                href={`/results/${item.job_id}`}
                className="flex items-center justify-between gap-4 px-6 py-5 transition hover:bg-amber-500/5 dark:hover:bg-amber-400/5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="text-base font-semibold text-amber-950 dark:text-amber-100 truncate">
                      {item.dataset_info?.filename || item.job_id.slice(0, 8)}
                    </h3>
                    <SeverityBadge severity={item.overall_severity} />
                  </div>
                  <div className="mt-1.5 flex items-center gap-3 text-sm text-amber-900/55 dark:text-amber-300/55 flex-wrap">
                    <span>{new Date(item.completed_at).toLocaleString()}</span>
                    <span className="text-amber-500/40">•</span>
                    <span>{item.metrics_passed} passed, {item.metrics_failed} failed</span>
                    <span className="text-amber-500/40">•</span>
                    <span className="font-mono text-xs">{item.job_id.split("-")[0]}</span>
                  </div>
                </div>
                <ScoreRing score={item.fairness_score} />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
