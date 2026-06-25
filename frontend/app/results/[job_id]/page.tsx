"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  Download,
  Loader2,
  Sparkles,
  Send,
  ShieldCheck,
  Clock,
} from "lucide-react";
import { Results, Explanation } from "@/lib/types";
import { getResults, streamExplanation, downloadReport, askQuestion, API_BASE } from "@/lib/api";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { MetricsGrid } from "@/components/dashboard/MetricsGrid";
import { ThresholdSimulator } from "@/components/dashboard/ThresholdSimulator";
import { upsertRecentJob } from "@/lib/recentJobs";

export default function ResultsDashboard({ params }: { params: { job_id: string } }) {
  const [results, setResults] = useState<Results | null>(null);
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const [aiStream, setAiStream] = useState("");
  const [aiError, setAiError] = useState("");   // ← shows Gemini errors in UI
  const [error, setError] = useState("");
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState("");

  const [qaHistory, setQaHistory] = useState<{question: string, answer: string}[]>([]);
  const [questionInput, setQuestionInput] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const [auditLog, setAuditLog] = useState<{ts: string; event: string; detail: Record<string, unknown>}[]>([]);

  const handleAskQuestion = async () => {
    if (!questionInput.trim() || isAsking) return;
    const q = questionInput.trim();
    setQuestionInput("");
    setIsAsking(true);
    try {
      const res = await askQuestion(params.job_id, q);
      setQaHistory((prev) => [...prev, { question: q, answer: res.answer }]);
    } catch (e) {
      setQaHistory((prev) => [
        ...prev,
        { question: q, answer: `⚠ Error: ${e instanceof Error ? e.message : "Failed to get answer"}` },
      ]);
    } finally {
      setIsAsking(false);
    }
  };

  useEffect(() => {
    getResults(params.job_id)
      .then((res) => {
        const typed = res as Results;
        setResults(typed);
        upsertRecentJob({
          job_id: typed.job_id,
          stage: "complete",
          progress: 100,
          message: "Audit complete. Results ready.",
          target_column: typed.dataset_info.target_column,
          protected_attributes: typed.dataset_info.protected_attributes,
          severity: typed.overall_severity,
          updated_at: new Date().toISOString(),
        });
      })
      .catch((e) => setError(e.message));

    const cleanup = streamExplanation(
      params.job_id,
      (chunk) => setAiStream((prev) => prev + chunk),
      (exp) => setExplanation(exp),
      (e) => setAiError(e.message)
    );

    // Fetch audit log
    const apiKey = process.env.NEXT_PUBLIC_API_KEY || "";
    fetch(`${API_BASE}/audit-log/${params.job_id}`, {
      headers: apiKey ? { "X-API-Key": apiKey } : {},
    })
      .then((r) => r.json())
      .then((data) => setAuditLog(data.events || []))
      .catch(() => {});

    return cleanup;
  }, [params.job_id]);

  const handleDownloadReport = async () => {
    try {
      setReportError("");
      setReportLoading(true);
      await downloadReport(params.job_id);
    } catch (err) {
      setReportError(err instanceof Error ? err.message : "Report download failed");
    } finally {
      setReportLoading(false);
    }
  };

  const isMissingResults = error.includes("not found") || error.includes("404");
  const isDemoJob = params.job_id === "demo";

  if (error && !results) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center rounded-[32px] border border-amber-600/15 bg-amber-500/10 p-12 text-center">
        <div className="mb-3 text-sm font-semibold uppercase tracking-widest text-amber-700/80">
          Workspace not ready
        </div>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-semibold text-amber-950">
          {isDemoJob ? "Load the demo dataset first" : "This audit is not ready yet"}
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-amber-900/70">
          {isMissingResults
            ? isDemoJob
              ? "The demo workspace does not have results loaded yet. Start a demo audit or upload a dataset to generate the dashboard."
              : "Results are not available for this job yet. Load a dataset and run the audit before opening the results workspace."
            : error}
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link href="/upload" className="btn-primary px-6 py-3 text-sm">
            Load dataset
          </Link>
          {isDemoJob && (
            <Link href="/upload" className="btn-secondary px-6 py-3 text-sm">
              Start demo audit
            </Link>
          )}
        </div>
      </div>
    );
  }

  if (!results) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center rounded-[28px] border border-amber-600/15 bg-amber-500/10 p-8 text-neutral-500">
        Loading Dashboard...
      </div>
    );
  }

  const severity = results.overall_severity;

  return (
    <div className="animate-fade-in space-y-8 pb-24">
      <div className="panel rounded-[32px] p-8">
        <div className="flex flex-col gap-8 lg:flex-row lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-4 flex flex-wrap items-center gap-4">
              <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold text-amber-950 sm:text-4xl">
                Fairness Audit Report
              </h1>
              <StatusBadge severity={severity} />
            </div>
            <p className="max-w-2xl text-lg leading-relaxed text-amber-900/70">
              Review the current fairness metrics, explanation stream, remediation guidance, and downloadable report for this hosted audit job.
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-4">
              {results.fairness_score && (
                <div className="metric-border rounded-2xl p-4 flex items-center justify-between gap-4 sm:col-span-1">
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-800/60">FairLens Score</span>
                    <div className="mt-1 text-sm font-medium text-amber-950">Grade {results.fairness_score.grade}</div>
                  </div>
                  <div className="relative h-14 w-14 shrink-0">
                    <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 36 36">
                      <circle cx="18" cy="18" r="16" fill="none" className="stroke-cyan-950" strokeWidth="3" />
                      <circle 
                        cx="18" 
                        cy="18" 
                        r="16" 
                        fill="none" 
                        className={
                          results.fairness_score.score >= 80 ? "stroke-emerald-400" :
                          results.fairness_score.score >= 60 ? "stroke-amber-400" : "stroke-rose-400"
                        } 
                        strokeWidth="3" 
                        strokeDasharray={`${results.fairness_score.score} 100`} 
                        pathLength="100"
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className={`text-lg font-bold ${
                        results.fairness_score.score >= 80 ? "text-emerald-400" :
                        results.fairness_score.score >= 60 ? "text-amber-400" : "text-rose-400"
                      }`}>
                        {Math.round(results.fairness_score.score)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
              <div className="metric-border rounded-2xl px-4 py-4">
                <span className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-800/60">Target</span>
                <div className="mt-2 font-bold text-amber-950 dark:text-amber-100">{results.dataset_info.target_column}</div>
              </div>
              <div className="metric-border rounded-2xl px-4 py-4">
                <span className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-800/60">Protected</span>
                <div className="mt-2 font-bold text-amber-950 dark:text-amber-100">{results.dataset_info.protected_attributes.join(", ")}</div>
              </div>
              <div className="metric-border rounded-2xl px-4 py-4">
                <span className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-800/60">Job</span>
                <div className="mt-2 truncate font-mono text-sm text-amber-800/80">{results.job_id}</div>
              </div>
            </div>
          </div>

          <div className="w-full max-w-sm space-y-3">
            <button
              onClick={handleDownloadReport}
              disabled={reportLoading}
              className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-60"
            >
              {reportLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
              {reportLoading ? "Preparing report..." : "Download PDF Report"}
            </button>
            <div className="rounded-2xl border border-amber-600/15 bg-amber-500/10 px-4 py-3 text-sm text-neutral-600">
              The report request uses the existing backend endpoint and opens the generated file in a hosted-safe way.
            </div>
            {reportError && (
              <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {reportError}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* AI Synthesis */}
      <div className="panel-soft p-6 sm:p-8">
        <div className="mb-5 flex items-center gap-3">
          <div className="rounded-xl border border-fuchsia-500/20 bg-fuchsia-500/10 p-2 dark:border-fuchsia-400/20 dark:bg-fuchsia-400/10">
            <Sparkles className="h-5 w-5 text-fuchsia-600 dark:text-fuchsia-400" />
          </div>
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-amber-950 dark:text-amber-100">
              AI Synthesis
            </h2>
            <p className="text-xs text-amber-900/50 dark:text-amber-300/50">Powered by Google Gemini</p>
          </div>
        </div>

        <div className="min-h-[60px] leading-relaxed text-amber-900/80 dark:text-amber-200/80 text-base">
          {explanation
            ? <p>{explanation.plain_english}</p>
            : aiError
            ? (
              <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4 text-rose-700 dark:text-rose-300 font-medium">
                ⚠ AI analysis unavailable: {aiError}
              </div>
            )
            : <p>{aiStream || "Gemini AI is analysing the fairness metrics…"}</p>
          }
          {!explanation && !aiError && (
            <span className="ml-1 inline-block h-4 w-2 animate-pulse rounded-sm bg-amber-500/50" />
          )}
        </div>

        {explanation?.findings && (
          <div className="mt-6 space-y-3">
            {explanation.findings.map((finding) => (
              <div key={finding.id} className="metric-border rounded-2xl p-4 flex gap-4">
                <Activity className="mt-1 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                <div>
                  <h4 className="font-semibold text-amber-950 dark:text-amber-100">{finding.headline}</h4>
                  <p className="mt-1 text-sm leading-relaxed text-amber-900/70 dark:text-amber-300/70">{finding.detail}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Q&A */}
        {explanation && (
          <div className="mt-8 border-t border-amber-600/10 dark:border-amber-400/10 pt-6">
            <h3 className="mb-4 font-[family-name:var(--font-display)] text-lg font-semibold text-amber-950 dark:text-amber-100">
              Follow-up Questions
            </h3>

            {qaHistory.length > 0 && (
              <div className="mb-4 space-y-4 max-h-72 overflow-y-auto scrollbar-subtle pr-1">
                {qaHistory.map((qa, i) => (
                  <div key={i} className="space-y-2 text-sm leading-relaxed">
                    <div className="flex gap-2">
                      <span className="font-bold text-fuchsia-600 dark:text-fuchsia-400 shrink-0">You:</span>
                      <span className="text-neutral-800 dark:text-neutral-200">{qa.question}</span>
                    </div>
                    <div className="metric-border rounded-2xl p-4 flex gap-3">
                      <Sparkles className="h-4 w-4 shrink-0 text-fuchsia-600 dark:text-fuchsia-400 mt-0.5" />
                      <span className="min-w-0 whitespace-pre-wrap break-words text-neutral-800 dark:text-neutral-200">{qa.answer}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder="Ask FairLens about these results…"
                value={questionInput}
                onChange={(e) => setQuestionInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAskQuestion(); }}
                disabled={isAsking}
                className="
                  flex-1 rounded-2xl border border-amber-500/20 bg-transparent
                  px-4 py-3 text-sm text-neutral-900 placeholder-neutral-500
                  outline-none transition
                  focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30
                  disabled:opacity-50
                  dark:border-amber-400/20 dark:bg-neutral-900/50 dark:text-neutral-100
                  dark:placeholder-neutral-400 dark:focus:border-amber-400/50
                "
              />
              <button
                onClick={handleAskQuestion}
                disabled={isAsking || !questionInput.trim()}
                className="flex items-center justify-center rounded-2xl border border-fuchsia-500/20 bg-fuchsia-500/10 p-3 text-fuchsia-700 transition hover:bg-fuchsia-500/20 disabled:opacity-50 dark:text-fuchsia-400 dark:border-fuchsia-400/20 dark:hover:bg-fuchsia-400/20"
              >
                {isAsking ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Metrics */}
      <div>
        <h2 className="mb-6 px-2 font-[family-name:var(--font-display)] text-2xl font-bold text-amber-950 dark:text-amber-100">
          Core Fairness Metrics
        </h2>
        <MetricsGrid metrics={results.metrics} />
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <ThresholdSimulator
          job_id={params.job_id}
          initialThreshold={results.remediation?.threshold?.current_threshold || 0.5}
          currentResults={results}
        />

        <div className="panel-soft flex flex-col p-8">
          <h3 className="mb-2 text-xl font-bold text-amber-950 dark:text-amber-100">SHAP Feature Importance</h3>
          <p className="mb-6 text-sm text-amber-900/60 dark:text-amber-300/60">
            Top drivers of model predictions. Inspect whether protected attributes are exerting outsized influence.
          </p>

          {!results.shap?.top_features || results.shap.top_features.length === 0 ? (
            <div className="flex flex-1 items-center justify-center rounded-[24px] border-2 border-dashed border-amber-500/20 bg-amber-500/8 p-8">
              <div className="max-w-sm text-center">
                <p className="text-amber-900/60 dark:text-amber-300/60">SHAP data is not available for this audit.</p>
                <p className="mt-2 text-sm leading-6 text-amber-900/50 dark:text-amber-300/50">
                  The backend only computes SHAP when a compatible model artifact is uploaded and successfully loaded during analysis.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex-1 space-y-4">
              {results.shap.top_features.map((feat, idx) => (
                <div key={idx} className="flex items-center gap-4">
                  <div className="w-32 truncate text-sm font-medium text-amber-900/80 dark:text-amber-200/80">{feat.feature}</div>
                  <div className="relative h-6 flex-1 overflow-hidden rounded-md bg-amber-500/10 dark:bg-amber-400/10">
                    <div
                      className={`absolute left-0 h-full ${
                        feat.direction === "positive" ? "bg-emerald-400" :
                        feat.direction === "negative" ? "bg-rose-400" : "bg-amber-400"
                      }`}
                      style={{ width: `${(feat.importance / (results.shap?.top_features?.[0]?.importance || 1)) * 100}%` }}
                    />
                  </div>
                  <div className="w-12 text-right text-sm text-amber-900/50 dark:text-amber-300/50">{(feat.importance * 10).toFixed(2)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Audit Log */}
      <div className="panel-soft p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-2 dark:border-emerald-400/20 dark:bg-emerald-400/10">
            <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-amber-950 dark:text-amber-100">Secure Audit Log</h2>
            <p className="text-xs text-amber-900/50 dark:text-amber-300/50">Every action is recorded for compliance and forensic review</p>
          </div>
          <span className="ml-auto rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 dark:border-emerald-400/20">
            Chain of Custody
          </span>
        </div>

        {auditLog.length === 0 ? (
          <div className="metric-border rounded-2xl px-4 py-6 text-center text-sm text-amber-900/50 dark:text-amber-300/50">
            No audit events recorded yet for this job.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-amber-600/10 dark:border-amber-400/10">
            <table className="w-full text-sm">
              <thead className="bg-amber-500/5 dark:bg-amber-400/5 text-left border-b border-amber-600/10 dark:border-amber-400/10">
                <tr>
                  <th className="px-4 py-3 font-semibold text-amber-900/60 dark:text-amber-300/60">Time</th>
                  <th className="px-4 py-3 font-semibold text-amber-900/60 dark:text-amber-300/60">Event</th>
                  <th className="px-4 py-3 font-semibold text-amber-900/60 dark:text-amber-300/60">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-600/8 dark:divide-amber-400/8">
                {auditLog.map((ev, i) => (
                  <tr key={i} className={i % 2 === 0 ? "" : "bg-amber-500/3 dark:bg-amber-400/3"}>
                    <td className="px-4 py-3 font-mono text-xs text-amber-900/55 dark:text-amber-300/55 whitespace-nowrap">
                      <Clock className="mr-1.5 inline h-3 w-3" />
                      {new Date(ev.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${
                        ev.event === "report_downloaded"     ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-700/40" :
                        ev.event === "report_generated"      ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-700/40" :
                        ev.event === "explanation_generated" ? "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-900/20 dark:text-fuchsia-300 dark:border-fuchsia-700/40" :
                        ev.event === "question_asked"        ? "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/20 dark:text-violet-300 dark:border-violet-700/40" :
                        ev.event === "upload_csv"            ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-700/40" :
                        "bg-amber-500/8 text-amber-900/70 border-amber-500/20 dark:text-amber-300/70 dark:border-amber-400/20"
                      }`}>
                        {ev.event.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-amber-900/55 dark:text-amber-300/55">
                      {Object.entries(ev.detail || {}).map(([k, v]) => (
                        <span key={k} className="mr-3">
                          <span className="text-amber-900/35 dark:text-amber-300/35">{k}:</span> {String(v)}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
