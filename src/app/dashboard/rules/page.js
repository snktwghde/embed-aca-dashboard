"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";

const PAGE_SIZE = 25;

const ACTION_LABELS = {
  approve: { label: "Auto-approve", tone: "emerald" },
  reject: { label: "Auto-reject", tone: "red" },
  review: { label: "Flag for review", tone: "amber" },
};

const RULE_TYPE_LABELS = {
  auto_approve: "Auto-approve",
  auto_reject: "Auto-reject",
  flag_review: "Flag review",
};

const TONE_CLASSES = {
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  red: "border-red-200 bg-red-50 text-red-700",
  stone: "border-stone-200 bg-stone-50 text-stone-600",
};

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatCurrency(n) {
  if (n === null || n === undefined) return null;
  const num = Number(n);
  if (num >= 1_00_00_000) return `₹${(num / 1_00_00_000).toFixed(2)} Cr`;
  if (num >= 1_00_000) return `₹${(num / 1_00_000).toFixed(2)} L`;
  if (num >= 1_000) return `₹${(num / 1_000).toFixed(1)}K`;
  return `₹${num}`;
}

/**
 * Renders a human-readable summary of a rule's conditions JSONB.
 * Phase 7 recognizes exactly seven keys; anything else is silently ignored
 * by the engine and we deliberately do NOT surface unknown keys in the UI
 * to avoid implying they have any effect.
 */
function summarizeConditions(conditions) {
  if (!conditions || typeof conditions !== "object") {
    return <span className="text-stone-400">No conditions</span>;
  }

  const parts = [];

  if (conditions.vendor) {
    parts.push(
      <span key="vendor">
        Vendor is <strong className="text-stone-900">{conditions.vendor}</strong>
      </span>
    );
  }

  const min = conditions.min_amount;
  const max = conditions.max_amount;
  if (min !== undefined && max !== undefined) {
    parts.push(
      <span key="range">
        Amount{" "}
        <strong className="text-stone-900 font-mono">
          {formatCurrency(min)}–{formatCurrency(max)}
        </strong>
      </span>
    );
  } else if (min !== undefined) {
    parts.push(
      <span key="min">
        Amount ≥ <strong className="text-stone-900 font-mono">{formatCurrency(min)}</strong>
      </span>
    );
  } else if (max !== undefined) {
    parts.push(
      <span key="max">
        Amount ≤ <strong className="text-stone-900 font-mono">{formatCurrency(max)}</strong>
      </span>
    );
  }

  if (conditions.department) {
    parts.push(
      <span key="dept">
        Department <strong className="text-stone-900">{conditions.department}</strong>
      </span>
    );
  }

  if (conditions.is_known_vendor === true) {
    parts.push(<span key="known">Vendor must be known</span>);
  }

  if (conditions.vendor_score_min !== undefined) {
    parts.push(
      <span key="score">
        Reliability ≥{" "}
        <strong className="text-stone-900 font-mono">{conditions.vendor_score_min}</strong>
      </span>
    );
  }

  if (conditions.is_duplicate === true) {
    parts.push(<span key="dup">Only on suspected duplicates</span>);
  }

  if (parts.length === 0) {
    return (
      <span className="text-amber-700">
        No recognized conditions — rule will match every invoice
      </span>
    );
  }

  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-stone-600">
      {parts.map((p, i) => (
        <span key={i} className="inline-flex items-center">
          {p}
          {i < parts.length - 1 && <span className="ml-3 text-stone-300">·</span>}
        </span>
      ))}
    </div>
  );
}

export default function RulesListPage() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [togglingId, setTogglingId] = useState(null);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  // Memoized once per mount — prevents re-creating client on every render,
  // which would invalidate the useCallback identity and loop the effect.
  const supabase = useMemo(() => createClient(), []);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error: fetchError, count } = await supabase
      .from("tenant_rules")
      .select(
        "id, rule_name, rule_type, conditions, action, priority, is_active, updated_at",
        { count: "exact" }
      )
      .order("priority", { ascending: true })
      .order("updated_at", { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (fetchError) {
      setError(fetchError.message);
      setLoading(false);
      return;
    }

    setRules(data || []);
    setTotalCount(count || 0);
    setLoading(false);
  }, [page, supabase]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  async function handleToggleActive(rule) {
    if (togglingId) return; // Guard against double-click while a toggle is in flight
    setTogglingId(rule.id);
    setError(null); // Clear any prior toggle error so retries look clean

    const next = !rule.is_active;

    // Optimistic update
    setRules((prev) =>
      prev.map((r) => (r.id === rule.id ? { ...r, is_active: next } : r))
    );

    try {
      // Pull tenant from JWT for defense-in-depth scoping.
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const tenantId = user?.app_metadata?.tenant_id;

      if (!tenantId) {
        // Roll back optimistic update
        setRules((prev) =>
          prev.map((r) => (r.id === rule.id ? { ...r, is_active: !next } : r))
        );
        setError("Could not determine tenant from session. Try signing out and back in.");
        return;
      }

      const { error: updateError } = await supabase
        .from("tenant_rules")
        .update({ is_active: next, updated_at: new Date().toISOString() })
        .eq("id", rule.id)
        .eq("tenant_id", tenantId);

      if (updateError) {
        setRules((prev) =>
          prev.map((r) => (r.id === rule.id ? { ...r, is_active: !next } : r))
        );
        setError(`Failed to ${next ? "activate" : "deactivate"} rule: ${updateError.message}`);
      }
    } catch (err) {
      setRules((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, is_active: !next } : r))
      );
      setError(`Toggle failed: ${err.message || "Unknown error"}`);
    } finally {
      setTogglingId(null);
    }
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const activeCount = rules.filter((r) => r.is_active).length;

  return (
    <div className="px-8 py-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-semibold text-stone-900 tracking-tight">
            Rules
          </h1>
          <p className="mt-2 text-sm text-stone-500 max-w-2xl">
            Deterministic rules run before the AI on every invoice. Lower priority
            numbers run first. The first rule whose conditions all match decides
            the invoice — no LLM call, no approval email.
          </p>
        </div>
        <Link
          href="/dashboard/rules/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-stone-900 text-white text-sm font-medium rounded-md hover:bg-stone-800 transition-colors"
        >
          <span className="text-base leading-none">+</span>
          New rule
        </Link>
      </div>

      {/* Stats strip */}
      <div className="flex gap-6 mb-6 text-sm">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-2xl font-semibold text-stone-900 tabular-nums">
            {totalCount}
          </span>
          <span className="text-stone-500 uppercase tracking-wide text-xs">
            Total
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-2xl font-semibold text-emerald-700 tabular-nums">
            {activeCount}
          </span>
          <span className="text-stone-500 uppercase tracking-wide text-xs">
            Active on this page
          </span>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-stone-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 border-b border-stone-200">
            <tr className="text-left">
              <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wide w-16">
                Priority
              </th>
              <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wide">
                Rule
              </th>
              <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wide">
                Conditions
              </th>
              <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wide w-36">
                Action
              </th>
              <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wide w-32">
                Updated
              </th>
              <th className="px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wide w-24 text-center">
                Status
              </th>
              <th className="px-4 py-3 w-16"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {loading && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-stone-400 text-sm">
                  Loading rules…
                </td>
              </tr>
            )}

            {!loading && rules.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-16 text-center">
                  <div className="text-stone-500 mb-2">No rules yet</div>
                  <div className="text-xs text-stone-400 max-w-md mx-auto mb-4">
                    Without rules, every invoice goes through the AI. Create your
                    first rule to start auto-approving predictable invoices and
                    save tokens on every match.
                  </div>
                  <Link
                    href="/dashboard/rules/new"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-stone-900 text-white text-sm font-medium rounded-md hover:bg-stone-800 transition-colors"
                  >
                    Create first rule
                  </Link>
                </td>
              </tr>
            )}

            {!loading &&
              rules.map((rule) => {
                const actionMeta = ACTION_LABELS[rule.action] || {
                  label: rule.action,
                  tone: "stone",
                };
                const typeLabel = RULE_TYPE_LABELS[rule.rule_type] || rule.rule_type;

                return (
                  <tr
                    key={rule.id}
                    className={`hover:bg-stone-50 transition-colors ${
                      !rule.is_active ? "opacity-50" : ""
                    }`}
                  >
                    <td className="px-4 py-4">
                      <span className="font-mono text-sm font-semibold text-stone-700 tabular-nums">
                        {rule.priority}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <Link
                        href={`/dashboard/rules/${rule.id}/edit`}
                        className="block group"
                      >
                        <div className="font-medium text-stone-900 group-hover:text-stone-600">
                          {rule.rule_name}
                        </div>
                        <div className="text-xs text-stone-400 mt-0.5 uppercase tracking-wide">
                          {typeLabel}
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-4 text-xs">
                      {summarizeConditions(rule.conditions)}
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 text-xs font-medium border rounded-full ${
                          TONE_CLASSES[actionMeta.tone]
                        }`}
                      >
                        {actionMeta.label}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-xs text-stone-500 font-mono tabular-nums">
                      {formatDate(rule.updated_at)}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <button
                        onClick={() => handleToggleActive(rule)}
                        disabled={togglingId === rule.id}
                        role="switch"
                        aria-checked={rule.is_active}
                        aria-label={`${rule.is_active ? "Deactivate" : "Activate"} rule ${rule.rule_name}`}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          rule.is_active ? "bg-emerald-600" : "bg-stone-300"
                        } ${togglingId === rule.id ? "opacity-50 cursor-wait" : "cursor-pointer"}`}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                            rule.is_active ? "translate-x-5" : "translate-x-1"
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <Link
                        href={`/dashboard/rules/${rule.id}/edit`}
                        className="text-xs text-stone-500 hover:text-stone-900 font-medium"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalCount > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4 text-sm text-stone-500">
          <div>
            Showing {page * PAGE_SIZE + 1}–
            {Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1.5 border border-stone-200 rounded-md hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-3 py-1.5 border border-stone-200 rounded-md hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}