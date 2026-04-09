"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

const PAGE_SIZE = 20;

// ---------- formatting helpers ----------
const formatCurrency = (num) => {
  if (num === null || num === undefined) return "—";
  const n = Number(num);
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)} Cr`;
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(2)} L`;
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(1)}K`;
  return `₹${n.toFixed(0)}`;
};

const formatDate = (ts) => {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatPercent = (num) => {
  if (num === null || num === undefined) return "—";
  return `${Number(num).toFixed(0)}%`;
};

// Reliability band: derive color/label from score 0-100
const reliabilityBand = (score) => {
  const s = Number(score) || 0;
  if (s >= 75) return { label: "High", tone: "emerald" };
  if (s >= 50) return { label: "Medium", tone: "amber" };
  return { label: "Low", tone: "red" };
};

const toneClasses = {
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  red: "border-red-200 bg-red-50 text-red-700",
};

// ---------- page ----------
export default function VendorsListPage() {
  const router = useRouter();
  const supabase = createClient();

  const [vendors, setVendors] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [orphanCount, setOrphanCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("reliability_score");
  const [page, setPage] = useState(0);

  // Load vendor_scores list
  useEffect(() => {
    const fetchVendors = async () => {
      setLoading(true);
      setError(null);

      try {
        let query = supabase
          .from("vendor_scores")
          .select(
            "id, vendor_name, reliability_score, total_invoices, total_approved, total_rejected, total_paid, avg_amount, dispute_rate, invoice_accuracy, avg_days_to_pay, last_updated",
            { count: "exact" }
          );

        if (search.trim()) {
          query = query.ilike("vendor_name", `%${search.trim()}%`);
        }

        query = query
          .order(sortBy, { ascending: false })
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

        const { data, error: qErr, count } = await query;

        if (qErr) throw qErr;

        setVendors(data || []);
        setTotalCount(count || 0);
      } catch (err) {
        console.error("Vendor list fetch failed:", err);
        setError(err.message || "Failed to load vendors");
      } finally {
        setLoading(false);
      }
    };

    fetchVendors();
  }, [search, sortBy, page]);

  // Orphan count: vendors with invoices but no vendor_scores row
  useEffect(() => {
    const fetchOrphans = async () => {
      try {
        const { data: invoiceVendors } = await supabase
          .from("invoices")
          .select("vendor");

        const { data: scoredVendors } = await supabase
          .from("vendor_scores")
          .select("vendor_name");

        if (!invoiceVendors || !scoredVendors) return;

        const scoredSet = new Set(scoredVendors.map((v) => v.vendor_name));
        const invoiceVendorSet = new Set(
          invoiceVendors.map((i) => i.vendor).filter(Boolean)
        );

        let orphans = 0;
        for (const v of invoiceVendorSet) {
          if (!scoredSet.has(v)) orphans++;
        }
        setOrphanCount(orphans);
      } catch (err) {
        // Non-fatal: banner just won't show
        console.warn("Orphan count failed:", err);
      }
    };

    fetchOrphans();
  }, []);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="px-8 py-8 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="mb-8">
        <p className="text-xs uppercase tracking-wider text-stone-500 mb-1">
          Vendor Intelligence
        </p>
        <h1 className="text-2xl font-semibold text-stone-900 tracking-tight">
          Vendors
        </h1>
        <p className="text-sm text-stone-600 mt-1">
          Reliability scores built from your actual payment and approval history.
        </p>
      </div>

      {/* Orphan banner */}
      {orphanCount > 0 && (
        <div className="mb-6 border border-stone-200 bg-white rounded-lg px-4 py-3 flex items-start gap-3">
          <span className="text-stone-400 text-sm mt-0.5">ⓘ</span>
          <div className="flex-1">
            <p className="text-sm text-stone-700">
              <span className="font-medium">{orphanCount} vendor{orphanCount === 1 ? "" : "s"}</span>{" "}
              with invoices but no intelligence score yet.
            </p>
            <p className="text-xs text-stone-500 mt-0.5">
              Scores are generated after the first human approval decision. They will appear here once the feedback loop runs.
            </p>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <input
          type="text"
          placeholder="Search vendor name…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          className="px-3 py-2 text-sm border border-stone-200 rounded-lg bg-white placeholder:text-stone-400 focus:outline-none focus:border-stone-400 w-64"
        />

        <select
          value={sortBy}
          onChange={(e) => {
            setSortBy(e.target.value);
            setPage(0);
          }}
          className="px-3 py-2 text-sm border border-stone-200 rounded-lg bg-white focus:outline-none focus:border-stone-400"
        >
          <option value="reliability_score">Sort: Reliability (high → low)</option>
          <option value="total_invoices">Sort: Total invoices</option>
          <option value="avg_amount">Sort: Avg amount</option>
          <option value="last_updated">Sort: Recently updated</option>
        </select>

        <div className="ml-auto text-xs text-stone-500">
          {loading
            ? "Loading…"
            : `${totalCount} vendor${totalCount === 1 ? "" : "s"} scored`}
        </div>
      </div>

      {/* Table */}
      <div className="border border-stone-200 rounded-lg bg-white overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-stone-200 bg-stone-50">
              <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider text-stone-500 font-medium">Vendor</th>
              <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider text-stone-500 font-medium">Reliability</th>
              <th className="text-right px-4 py-3 text-[11px] uppercase tracking-wider text-stone-500 font-medium">Invoices</th>
              <th className="text-right px-4 py-3 text-[11px] uppercase tracking-wider text-stone-500 font-medium">Approved</th>
              <th className="text-right px-4 py-3 text-[11px] uppercase tracking-wider text-stone-500 font-medium">Rejected</th>
              <th className="text-right px-4 py-3 text-[11px] uppercase tracking-wider text-stone-500 font-medium">Avg amount</th>
              <th className="text-right px-4 py-3 text-[11px] uppercase tracking-wider text-stone-500 font-medium">Disputes</th>
              <th className="text-right px-4 py-3 text-[11px] uppercase tracking-wider text-stone-500 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody>
            {loading && vendors.length === 0 && (
              <>
                {[...Array(6)].map((_, i) => (
                  <tr key={i} className="border-b border-stone-100">
                    <td colSpan={8} className="px-4 py-4">
                      <div className="h-4 bg-stone-100 rounded animate-pulse" />
                    </td>
                  </tr>
                ))}
              </>
            )}

            {!loading && error && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-red-600">
                  {error}
                </td>
              </tr>
            )}

            {!loading && !error && vendors.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center">
                  <p className="text-sm text-stone-600">No scored vendors yet.</p>
                  <p className="text-xs text-stone-500 mt-1">
                    Vendor intelligence appears after the first human approval decision.
                  </p>
                </td>
              </tr>
            )}

            {!loading && !error && vendors.map((v) => {
              const band = reliabilityBand(v.reliability_score);
              return (
                <tr
                  key={v.id}
                  onClick={() => router.push(`/dashboard/vendors/${v.id}`)}
                  className="border-b border-stone-100 last:border-0 hover:bg-stone-50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-stone-900">{v.vendor_name}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] uppercase tracking-wider ${toneClasses[band.tone]}`}>
                        {band.label}
                      </span>
                      <span className="text-sm text-stone-700 font-mono">
                        {Number(v.reliability_score).toFixed(0)}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-stone-700 font-mono">{v.total_invoices ?? 0}</td>
                  <td className="px-4 py-3 text-right text-sm text-stone-700 font-mono">{v.total_approved ?? 0}</td>
                  <td className="px-4 py-3 text-right text-sm text-stone-700 font-mono">{v.total_rejected ?? 0}</td>
                  <td className="px-4 py-3 text-right text-sm text-stone-700 font-mono">{formatCurrency(v.avg_amount)}</td>
                  <td className="px-4 py-3 text-right text-sm text-stone-700 font-mono">{formatPercent(v.dispute_rate)}</td>
                  <td className="px-4 py-3 text-right text-xs text-stone-500">{formatDate(v.last_updated)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <div className="text-xs text-stone-500">
            Page {page + 1} of {totalPages}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1.5 text-xs border border-stone-200 rounded bg-white text-stone-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-stone-50"
            >
              ← Previous
            </button>
            <button
              onClick={() => setPage((p) => (p + 1 < totalPages ? p + 1 : p))}
              disabled={page + 1 >= totalPages}
              className="px-3 py-1.5 text-xs border border-stone-200 rounded bg-white text-stone-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-stone-50"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}