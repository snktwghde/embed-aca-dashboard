"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase-browser";

const PAGE_SIZE = 20;

function formatCurrency(amount) {
  if (amount == null) return "—";
  const num = parseFloat(amount);
  if (num >= 10000000) return `₹${(num / 10000000).toFixed(2)} Cr`;
  if (num >= 100000) return `₹${(num / 100000).toFixed(2)} L`;
  if (num >= 1000) return `₹${(num / 1000).toFixed(1)}K`;
  return `₹${num.toLocaleString("en-IN")}`;
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function StatusBadge({ status }) {
  const styles = {
    approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
    rejected: "bg-red-50 text-red-700 border-red-200",
    pending: "bg-amber-50 text-amber-700 border-amber-200",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
        styles[status] || "bg-stone-100 text-stone-600 border-stone-200"
      }`}
    >
      {status || "unknown"}
    </span>
  );
}

function DecisionBadge({ decision }) {
  const styles = {
    approve: "bg-emerald-50 text-emerald-700",
    review: "bg-amber-50 text-amber-700",
    reject: "bg-red-50 text-red-700",
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
        styles[decision] || "bg-stone-100 text-stone-600"
      }`}
    >
      {decision || "—"}
    </span>
  );
}

function ConfidencePill({ score, level }) {
  if (score == null && !level) return <span className="text-stone-400">—</span>;
  const pct = score != null ? Math.round(score * 100) : null;
  const color =
    level === "high" || (pct && pct >= 80)
      ? "text-emerald-700"
      : level === "medium" || (pct && pct >= 50)
      ? "text-amber-700"
      : "text-red-700";
  return (
    <span className={`font-mono text-xs ${color}`}>
      {pct != null ? `${pct}%` : level}
    </span>
  );
}

export default function InvoicesPage() {
  const router = useRouter();
  const supabase = createBrowserClient();

  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);

  // Filters
  const [statusFilter, setStatusFilter] = useState("all");
  const [vendorSearch, setVendorSearch] = useState("");
  const [decisionFilter, setDecisionFilter] = useState("all");

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      let query = supabase
        .from("invoices")
        .select(
          "id, invoice_id, vendor, amount, department, invoice_date, decision, confidence, confidence_score, reasoning, approval_status, approved_at, approved_by, due_date, payment_status, created_at",
          { count: "exact" }
        )
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      // Apply filters
      if (statusFilter !== "all") {
        query = query.eq("approval_status", statusFilter);
      }
      if (decisionFilter !== "all") {
        query = query.eq("decision", decisionFilter);
      }
      if (vendorSearch.trim()) {
        query = query.ilike("vendor", `%${vendorSearch.trim()}%`);
      }

      const { data, error: fetchError, count } = await query;

      if (fetchError) throw fetchError;

      setInvoices(data || []);
      setTotalCount(count || 0);
    } catch (err) {
      console.error("Invoice fetch error:", err);
      setError(err.message || "Failed to load invoices");
    } finally {
      setLoading(false);
    }
  }, [supabase, page, statusFilter, decisionFilter, vendorSearch]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  // Reset to page 0 when filters change
  useEffect(() => {
    setPage(0);
  }, [statusFilter, decisionFilter, vendorSearch]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="p-6 lg:p-8 max-w-[1400px]">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-stone-900 tracking-tight">
          Invoice Pipeline
        </h1>
        <p className="text-stone-500 text-sm mt-1">
          {totalCount} invoice{totalCount !== 1 ? "s" : ""} processed by your AP
          agent
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="text-sm border border-stone-200 rounded-lg px-3 py-2 bg-white text-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-300"
        >
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>

        {/* Decision filter */}
        <select
          value={decisionFilter}
          onChange={(e) => setDecisionFilter(e.target.value)}
          className="text-sm border border-stone-200 rounded-lg px-3 py-2 bg-white text-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-300"
        >
          <option value="all">All decisions</option>
          <option value="approve">Approve</option>
          <option value="review">Review</option>
          <option value="reject">Reject</option>
        </select>

        {/* Vendor search */}
        <input
          type="text"
          placeholder="Search vendor..."
          value={vendorSearch}
          onChange={(e) => setVendorSearch(e.target.value)}
          className="text-sm border border-stone-200 rounded-lg px-3 py-2 bg-white text-stone-700 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-300 w-56"
        />

        {/* Clear filters */}
        {(statusFilter !== "all" ||
          decisionFilter !== "all" ||
          vendorSearch) && (
          <button
            onClick={() => {
              setStatusFilter("all");
              setDecisionFilter("all");
              setVendorSearch("");
            }}
            className="text-sm text-stone-500 hover:text-stone-700 underline underline-offset-2"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 mb-5 text-sm">
          {error}
          <button
            onClick={fetchInvoices}
            className="ml-3 underline underline-offset-2"
          >
            Retry
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-stone-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-100 bg-stone-50/50">
                <th className="text-left px-4 py-3 font-medium text-stone-500 text-xs uppercase tracking-wider">
                  Invoice
                </th>
                <th className="text-left px-4 py-3 font-medium text-stone-500 text-xs uppercase tracking-wider">
                  Vendor
                </th>
                <th className="text-right px-4 py-3 font-medium text-stone-500 text-xs uppercase tracking-wider">
                  Amount
                </th>
                <th className="text-left px-4 py-3 font-medium text-stone-500 text-xs uppercase tracking-wider">
                  AI Decision
                </th>
                <th className="text-left px-4 py-3 font-medium text-stone-500 text-xs uppercase tracking-wider">
                  Confidence
                </th>
                <th className="text-left px-4 py-3 font-medium text-stone-500 text-xs uppercase tracking-wider">
                  Status
                </th>
                <th className="text-left px-4 py-3 font-medium text-stone-500 text-xs uppercase tracking-wider">
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {loading ? (
                // Skeleton rows
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3.5">
                        <div className="h-4 bg-stone-100 rounded animate-pulse w-20" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : invoices.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-12 text-center text-stone-400"
                  >
                    No invoices found
                    {statusFilter !== "all" || vendorSearch
                      ? " matching your filters"
                      : ""}
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr
                    key={inv.id}
                    onClick={() => router.push(`/dashboard/invoices/${inv.id}`)}
                    className="hover:bg-stone-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3.5">
                      <span className="font-mono text-xs text-stone-700">
                        {inv.invoice_id || `#${inv.id}`}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-stone-800 font-medium">
                        {inv.vendor}
                      </span>
                      {inv.department && (
                        <span className="block text-xs text-stone-400 mt-0.5">
                          {inv.department}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <span className="font-mono text-stone-800">
                        {formatCurrency(inv.amount)}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <DecisionBadge decision={inv.decision} />
                    </td>
                    <td className="px-4 py-3.5">
                      <ConfidencePill
                        score={inv.confidence_score}
                        level={inv.confidence}
                      />
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={inv.approval_status} />
                    </td>
                    <td className="px-4 py-3.5 text-stone-500 text-xs">
                      {formatDate(inv.invoice_date || inv.created_at)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-stone-100 bg-stone-50/50">
            <p className="text-xs text-stone-500">
              Showing {page * PAGE_SIZE + 1}–
              {Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount}
            </p>
            <div className="flex gap-1">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1.5 text-xs rounded border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ← Prev
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="px-3 py-1.5 text-xs rounded border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}