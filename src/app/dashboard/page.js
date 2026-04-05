"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchIntelligence() {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) return;

        const tenantId = user.app_metadata?.tenant_id;
        if (!tenantId) {
          setError("No tenant configured for this account.");
          setLoading(false);
          return;
        }

        const apiUrl = process.env.NEXT_PUBLIC_ACA_API_URL;
        const res = await fetch(
          `${apiUrl}/intelligence?tenant_id=${tenantId}`
        );

        if (!res.ok) {
          throw new Error(`API returned ${res.status}`);
        }

        const json = await res.json();
        setData(json);
      } catch (err) {
        console.error("Failed to fetch intelligence:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchIntelligence();
  }, []);

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-48 bg-stone-200 rounded" />
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-28 bg-stone-200 rounded-xl" />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="h-64 bg-stone-200 rounded-xl" />
            <div className="h-64 bg-stone-200 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6">
          <h3 className="text-red-800 font-medium mb-1">
            Failed to load dashboard
          </h3>
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  const stats = data.system_stats;
  const engine = data.decision_engine;
  const accuracy = data.prediction_accuracy;

  return (
    <div className="p-8 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-stone-900 tracking-tight">
          Operations Overview
        </h1>
        <p className="text-stone-500 text-sm mt-1">
          {data.tenant} — AP Control Center
        </p>
      </div>

      {/* Top Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Total Invoices"
          value={stats.total_invoices}
          detail={`₹${formatAmount(stats.total_amount)} processed`}
        />
        <StatCard
          label="Approved"
          value={stats.total_approved}
          detail={`${stats.total_rejected} rejected`}
          variant="success"
        />
        <StatCard
          label="Pending"
          value={stats.total_pending}
          detail={`₹${formatAmount(stats.pending_amount)} outstanding`}
          variant={stats.total_pending > 0 ? "warning" : "default"}
        />
        <StatCard
          label="Auto-Decision Rate"
          value={`${(engine.auto_decision_rate * 100).toFixed(0)}%`}
          detail={`${engine.llm_calls_saved} LLM calls saved`}
          variant="accent"
        />
      </div>

      {/* Second Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Decision Engine Breakdown */}
        <div className="bg-white border border-stone-200 rounded-xl p-6">
          <h3 className="text-sm font-medium text-stone-500 uppercase tracking-wider mb-4">
            Decision Engine
          </h3>
          <div className="space-y-3">
            <SourceBar
              label="Rules Engine"
              count={engine.by_source?.rules_engine || 0}
              total={engine.total_decisions}
              color="bg-blue-500"
            />
            <SourceBar
              label="AI (LLM)"
              count={engine.by_source?.llm || 0}
              total={engine.total_decisions}
              color="bg-amber-500"
            />
            <SourceBar
              label="Hard Rules"
              count={engine.by_source?.hard_rule || 0}
              total={engine.total_decisions}
              color="bg-stone-400"
            />
          </div>
          <p className="text-xs text-stone-400 mt-4">
            {engine.total_decisions} total decisions tracked
          </p>
        </div>

        {/* Prediction Accuracy */}
        <div className="bg-white border border-stone-200 rounded-xl p-6">
          <h3 className="text-sm font-medium text-stone-500 uppercase tracking-wider mb-4">
            Prediction Accuracy
          </h3>
          {accuracy.total_closed > 0 ? (
            <>
              <div className="flex items-baseline gap-2 mb-4">
                <span className="stat-value text-4xl text-stone-900">
                  {(accuracy.accuracy * 100).toFixed(0)}%
                </span>
                <span className="text-sm text-stone-500">correct</span>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <MiniStat
                  label="Evaluated"
                  value={accuracy.total_closed}
                />
                <MiniStat
                  label="Correct"
                  value={accuracy.correct}
                  color="text-green-600"
                />
                <MiniStat
                  label="Incorrect"
                  value={accuracy.incorrect}
                  color="text-red-600"
                />
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-32 text-stone-400 text-sm">
              No predictions evaluated yet.
              <br />
              Approve or reject invoices to start tracking.
            </div>
          )}
        </div>
      </div>

      {/* Third Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Vendor Intelligence */}
        <div className="bg-white border border-stone-200 rounded-xl p-6">
          <h3 className="text-sm font-medium text-stone-500 uppercase tracking-wider mb-4">
            Vendor Intelligence
          </h3>
          {data.vendor_intelligence.length > 0 ? (
            <div className="space-y-3">
              {data.vendor_intelligence.map((v) => (
                <div
                  key={v.vendor_name}
                  className="flex items-center justify-between py-2 border-b border-stone-100 last:border-0"
                >
                  <div>
                    <p className="text-sm font-medium text-stone-800">
                      {v.vendor_name}
                    </p>
                    <p className="text-xs text-stone-400">
                      {v.total_invoices} invoices · avg ₹
                      {formatAmount(v.avg_amount)}
                    </p>
                  </div>
                  <ReliabilityBadge score={v.reliability_score} />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState text="No vendor data yet" />
          )}
        </div>

        {/* Active Rules */}
        <div className="bg-white border border-stone-200 rounded-xl p-6">
          <h3 className="text-sm font-medium text-stone-500 uppercase tracking-wider mb-4">
            Active Rules
          </h3>
          {data.active_rules.length > 0 ? (
            <div className="space-y-3">
              {data.active_rules.map((r) => (
                <div
                  key={r.id}
                  className="py-2 border-b border-stone-100 last:border-0"
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-stone-800">
                      {r.name}
                    </p>
                    <ActionBadge action={r.action} />
                  </div>
                  <p className="text-xs text-stone-400">
                    Priority {r.priority} · Type: {r.type}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState text="No rules configured" />
          )}
        </div>
      </div>

      {/* Rule Suggestions */}
      {data.suggested_rules.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-6">
          <h3 className="text-sm font-medium text-blue-800 uppercase tracking-wider mb-3">
            Suggested Rules
          </h3>
          <div className="space-y-3">
            {data.suggested_rules.map((s, i) => (
              <div
                key={i}
                className="bg-white rounded-lg border border-blue-100 p-4"
              >
                <p className="text-sm font-medium text-stone-800 mb-1">
                  {s.suggested_rule.rule_name}
                </p>
                <p className="text-xs text-stone-500">{s.reason}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Predictions */}
      <div className="bg-white border border-stone-200 rounded-xl p-6">
        <h3 className="text-sm font-medium text-stone-500 uppercase tracking-wider mb-4">
          Recent Decisions
        </h3>
        {data.recent_predictions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200">
                  <th className="text-left py-2 pr-4 text-xs font-medium text-stone-400 uppercase">
                    Invoice
                  </th>
                  <th className="text-left py-2 pr-4 text-xs font-medium text-stone-400 uppercase">
                    Predicted
                  </th>
                  <th className="text-left py-2 pr-4 text-xs font-medium text-stone-400 uppercase">
                    Source
                  </th>
                  <th className="text-left py-2 pr-4 text-xs font-medium text-stone-400 uppercase">
                    Confidence
                  </th>
                  <th className="text-left py-2 pr-4 text-xs font-medium text-stone-400 uppercase">
                    Outcome
                  </th>
                  <th className="text-left py-2 text-xs font-medium text-stone-400 uppercase">
                    Correct
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.recent_predictions.map((p, i) => (
                  <tr key={i} className="border-b border-stone-100 last:border-0">
                    <td className="py-2.5 pr-4 font-mono text-xs text-stone-700">
                      {p.invoice_id}
                    </td>
                    <td className="py-2.5 pr-4">
                      <ActionBadge action={p.predicted} />
                    </td>
                    <td className="py-2.5 pr-4 text-xs text-stone-500">
                      {p.source === "rules_engine"
                        ? "Rules"
                        : p.source === "hard_rule"
                        ? "Hard Rule"
                        : "AI"}
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-xs text-stone-600">
                      {(p.confidence * 100).toFixed(0)}%
                    </td>
                    <td className="py-2.5 pr-4 text-xs text-stone-500">
                      {p.actual_outcome || "—"}
                    </td>
                    <td className="py-2.5">
                      {p.was_correct === null ? (
                        <span className="text-xs text-stone-300">—</span>
                      ) : p.was_correct ? (
                        <span className="text-xs text-green-600">✓</span>
                      ) : (
                        <span className="text-xs text-red-600">✗</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState text="No decisions recorded yet" />
        )}
      </div>
    </div>
  );
}

/* ---- Sub-components ---- */

function StatCard({ label, value, detail, variant = "default" }) {
  const borderColor =
    variant === "success"
      ? "border-l-green-500"
      : variant === "warning"
      ? "border-l-amber-500"
      : variant === "accent"
      ? "border-l-blue-500"
      : "border-l-stone-300";

  return (
    <div
      className={`bg-white border border-stone-200 border-l-4 ${borderColor} rounded-xl p-5`}
    >
      <p className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-2">
        {label}
      </p>
      <p className="stat-value text-2xl text-stone-900 mb-1">{value}</p>
      <p className="text-xs text-stone-400">{detail}</p>
    </div>
  );
}

function SourceBar({ label, count, total, color }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-stone-700">{label}</span>
        <span className="font-mono text-xs text-stone-500">
          {count} ({pct.toFixed(0)}%)
        </span>
      </div>
      <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function MiniStat({ label, value, color = "text-stone-900" }) {
  return (
    <div>
      <p className="text-xs text-stone-400 mb-1">{label}</p>
      <p className={`stat-value text-xl ${color}`}>{value}</p>
    </div>
  );
}

function ReliabilityBadge({ score }) {
  const bg =
    score >= 70
      ? "bg-green-100 text-green-700"
      : score >= 40
      ? "bg-amber-100 text-amber-700"
      : "bg-red-100 text-red-700";

  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-mono font-medium ${bg}`}>
      {score}
    </span>
  );
}

function ActionBadge({ action }) {
  const styles = {
    approve: "bg-green-100 text-green-700",
    approved: "bg-green-100 text-green-700",
    review: "bg-amber-100 text-amber-700",
    reject: "bg-red-100 text-red-700",
    rejected: "bg-red-100 text-red-700",
  };

  return (
    <span
      className={`px-2 py-0.5 rounded text-xs font-medium ${
        styles[action] || "bg-stone-100 text-stone-600"
      }`}
    >
      {action}
    </span>
  );
}

function EmptyState({ text }) {
  return (
    <div className="flex items-center justify-center h-24 text-stone-400 text-sm">
      {text}
    </div>
  );
}

function formatAmount(amount) {
  if (!amount && amount !== 0) return "0";
  const num = parseFloat(amount);
  if (num >= 10000000) return `${(num / 10000000).toFixed(1)}Cr`;
  if (num >= 100000) return `${(num / 100000).toFixed(1)}L`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toLocaleString("en-IN");
}
