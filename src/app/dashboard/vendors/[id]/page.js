"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";

// ---------- helpers ----------
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

const formatRatio = (num) => {
  if (num === null || num === undefined) return "—";
  return `${(Number(num) * 100).toFixed(0)}%`;
};

const reliabilityBand = (score) => {
  const s = Number(score) || 0;
  if (s >= 75) return { label: "High Reliability", tone: "emerald" };
  if (s >= 50) return { label: "Medium Reliability", tone: "amber" };
  return { label: "Low Reliability", tone: "red" };
};

const toneClasses = {
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  red: "border-red-200 bg-red-50 text-red-700",
};

const statusTone = (status) => {
  const s = (status || "").toLowerCase();
  if (s === "approved") return "emerald";
  if (s === "rejected") return "red";
  if (s === "pending") return "amber";
  return "stone";
};

const stoneTone = "border-stone-200 bg-stone-50 text-stone-600";

// Mirrors server.js bucketToAmountRange — must stay in sync with backend.
const bucketToAmountRange = (bucket) => {
  const ranges = {
    under_10k: { max_amount: 10000 },
    "10k_50k": { min_amount: 10000, max_amount: 50000 },
    "50k_100k": { min_amount: 50000, max_amount: 100000 },
    "100k_500k": { min_amount: 100000, max_amount: 500000 },
    over_500k: { min_amount: 500000 },
  };
  return ranges[bucket] || {};
};

/**
 * Returns true if an active rule for this vendor already covers the
 * amount bucket this pattern represents. Used to hide the "Convert to
 * rule" button when the operator has already converted the pattern (or
 * manually created an equivalent rule).
 *
 * "Covers" means: same vendor (exact match) AND the rule's amount range
 * overlaps the pattern's bucket. A widened rule (min=5000, max=100000)
 * still counts as covering a 10k_50k pattern.
 *
 * KNOWN GAP — rule shadowing via is_known_vendor:
 * A broad "approve all known vendors under ₹50K" rule (is_known_vendor=true,
 * no vendor field) will fire for this vendor but is NOT caught by this dedup
 * check because we require an exact vendor match. Operators can therefore
 * create a vendor-specific rule that is already shadowed by a broader rule.
 * Full rule-shadowing detection belongs in Task 6 (System Intelligence),
 * where it can surface as "Rule A shadows Rule B" relationships rather than
 * as an ad-hoc check inside the vendor detail page.
 */
const patternIsAlreadyCovered = (pattern, rules) => {
  const bucket = bucketToAmountRange(pattern.amount_bucket);
  const patternMin = bucket.min_amount ?? 0;
  const patternMax = bucket.max_amount ?? Number.POSITIVE_INFINITY;
  const patternVendor = (pattern.vendor_name || "").toLowerCase();

  return rules.some((r) => {
    const c = r.conditions || {};
    // Defensive: vendor must be a string before .toLowerCase()
    if (typeof c.vendor !== "string") return false;
    if (c.vendor.toLowerCase() !== patternVendor) return false;
    const ruleMin = c.min_amount ?? 0;
    const ruleMax = c.max_amount ?? Number.POSITIVE_INFINITY;
    return ruleMin <= patternMax && ruleMax >= patternMin;
  });
};

// Mirrors backend thresholds from generateRuleSuggestions in server.js.
// If these are ever relaxed or tightened on the backend, update here too.
const PATTERN_QUALIFIES_FOR_CONVERSION = (p) =>
  (p.decision || "").toLowerCase() === "approved" &&
  Number(p.occurrence_count) >= 3 &&
  Number(p.confidence) >= 0.85;

// ---------- page ----------
export default function VendorDetailPage() {
  const router = useRouter();
  const params = useParams();
  const vendorId = params?.id;
  const supabase = useMemo(() => createClient(), []);

  const [vendor, setVendor] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [approvers, setApprovers] = useState([]);
  const [existingRules, setExistingRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!vendorId) return;

    const fetchAll = async () => {
      setLoading(true);
      setError(null);

      try {
        // 1. Vendor score row
        const { data: vendorRow, error: vErr } = await supabase
          .from("vendor_scores")
          .select("*")
          .eq("id", vendorId)
          .single();

        if (vErr) throw vErr;
        if (!vendorRow) {
          setError("Vendor not found");
          setLoading(false);
          return;
        }

        setVendor(vendorRow);

        // 2. Invoice history by text-match on vendor_name
        const { data: invoiceRows, error: iErr } = await supabase
          .from("invoices")
          .select(
            "id, invoice_id, amount, invoice_date, due_date, approval_status, payment_status, decision, confidence_score, created_at"
          )
          .eq("vendor", vendorRow.vendor_name)
          .order("created_at", { ascending: false })
          .limit(50);

        if (iErr) throw iErr;
        setInvoices(invoiceRows || []);

        // 3. Approval patterns for this vendor (optional, non-fatal)
        try {
          const { data: patternRows } = await supabase
            .from("approval_patterns")
            .select(
              "id, approver_email, amount_bucket, decision, occurrence_count, confidence, last_observed, vendor_name"
            )
            .eq("vendor_name", vendorRow.vendor_name)
            .order("occurrence_count", { ascending: false })
            .limit(10);
          setApprovers(patternRows || []);
        } catch (pErr) {
          console.warn("Approval patterns fetch failed:", pErr);
          setApprovers([]);
        }

        // 4. Active rules for this vendor (to dedupe convert-to-rule button).
        // Limit is a soft cap — a tenant with 200+ active rules is already in
        // "needs System Intelligence page" territory, so 200 is more than enough.
        try {
          const { data: ruleRows } = await supabase
            .from("tenant_rules")
            .select("conditions")
            .eq("is_active", true)
            .limit(200);
          setExistingRules(ruleRows || []);
        } catch (rErr) {
          console.warn("Rules fetch failed:", rErr);
          setExistingRules([]);
        }
      } catch (err) {
        console.error("Vendor detail fetch failed:", err);
        setError(err.message || "Failed to load vendor");
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, [vendorId, supabase]);

  if (loading) {
    return (
      <div className="px-8 py-8 max-w-[1400px] mx-auto">
        <div className="h-8 bg-stone-100 rounded animate-pulse w-64 mb-4" />
        <div className="h-4 bg-stone-100 rounded animate-pulse w-96 mb-8" />
        <div className="grid grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-24 bg-stone-100 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !vendor) {
    return (
      <div className="px-8 py-8 max-w-[1400px] mx-auto">
        <button
          onClick={() => router.push("/dashboard/vendors")}
          className="text-xs text-stone-500 hover:text-stone-900 mb-4"
        >
          ← Back to vendors
        </button>
        <div className="border border-red-200 bg-red-50 rounded-lg px-4 py-6 text-sm text-red-700">
          {error || "Vendor not found"}
        </div>
      </div>
    );
  }

  const band = reliabilityBand(vendor.reliability_score);

  return (
    <div className="px-8 py-8 max-w-[1400px] mx-auto">
      {/* Back */}
      <button
        onClick={() => router.push("/dashboard/vendors")}
        className="text-xs text-stone-500 hover:text-stone-900 mb-4"
      >
        ← Back to vendors
      </button>

      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-6 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-wider text-stone-500 mb-1">Vendor Profile</p>
          <h1 className="text-2xl font-semibold text-stone-900 tracking-tight">
            {vendor.vendor_name}
          </h1>
          <p className="text-sm text-stone-600 mt-1">
            Last updated {formatDate(vendor.last_updated)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={`inline-flex items-center px-3 py-1 rounded border text-xs uppercase tracking-wider ${toneClasses[band.tone]}`}>
            {band.label}
          </span>
          <div className="text-right">
            <div className="text-3xl font-mono font-semibold text-stone-900">
              {Number(vendor.reliability_score).toFixed(0)}
              <span className="text-base text-stone-400 font-normal"> / 100</span>
            </div>
          </div>
        </div>
      </div>

      {/* Intelligence cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        <StatCard label="Total Invoices" value={vendor.total_invoices ?? 0} mono />
        <StatCard label="Approved" value={vendor.total_approved ?? 0} mono tone="emerald" />
        <StatCard label="Rejected" value={vendor.total_rejected ?? 0} mono tone="red" />
        <StatCard label="Paid" value={vendor.total_paid ?? 0} mono />
        <StatCard label="Avg Amount" value={formatCurrency(vendor.avg_amount)} mono />
        <StatCard label="Dispute Rate" value={formatRatio(vendor.dispute_rate)} mono />
      </div>

      {/* Secondary metrics */}
      <div className="mb-8">
        <div className="border border-stone-200 bg-white rounded-lg px-5 py-4">
          <p className="text-[11px] uppercase tracking-wider text-stone-500">Avg Days to Pay</p>
          <p className="text-xl font-mono font-semibold text-stone-900 mt-1">
            {vendor.avg_days_to_pay !== null && vendor.avg_days_to_pay !== undefined
              ? `${Number(vendor.avg_days_to_pay).toFixed(1)} days`
              : "—"}
          </p>
          <p className="text-xs text-stone-500 mt-1">
            Average time from invoice received to payment confirmed.
          </p>
        </div>
      </div>

      {/* Approval patterns */}
      {approvers.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-stone-900 mb-3">Approval Patterns</h2>
          <div className="border border-stone-200 rounded-lg bg-white overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50">
                  <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wider text-stone-500 font-medium">Approver</th>
                  <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wider text-stone-500 font-medium">Amount Bucket</th>
                  <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wider text-stone-500 font-medium">Typical Decision</th>
                  <th className="text-right px-4 py-2.5 text-[11px] uppercase tracking-wider text-stone-500 font-medium">Occurrences</th>
                  <th className="text-right px-4 py-2.5 text-[11px] uppercase tracking-wider text-stone-500 font-medium">Confidence</th>
                  <th className="text-right px-4 py-2.5 text-[11px] uppercase tracking-wider text-stone-500 font-medium">Last Seen</th>
                  <th className="text-right px-4 py-2.5 text-[11px] uppercase tracking-wider text-stone-500 font-medium w-40"></th>
                </tr>
              </thead>
              <tbody>
                {approvers.map((p) => {
                  const tone = statusTone(p.decision);
                  const cls = tone === "stone" ? stoneTone : toneClasses[tone];
                  const qualifies = PATTERN_QUALIFIES_FOR_CONVERSION(p);
                  const covered = qualifies && patternIsAlreadyCovered(p, existingRules);
                  const showConvert = qualifies && !covered;

                  return (
                    <tr key={p.id} className="border-b border-stone-100 last:border-0">
                      <td className="px-4 py-3 text-sm text-stone-700">{p.approver_email}</td>
                      <td className="px-4 py-3 text-xs text-stone-600 font-mono">{p.amount_bucket}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] uppercase tracking-wider ${cls}`}>
                          {p.decision}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-mono text-stone-700">{p.occurrence_count}</td>
                      <td className="px-4 py-3 text-right text-sm font-mono text-stone-700">{formatPercent(Number(p.confidence) * 100)}</td>
                      <td className="px-4 py-3 text-right text-xs text-stone-500">{formatDate(p.last_observed)}</td>
                      <td className="px-4 py-3 text-right">
                        {showConvert ? (
                          <Link
                            href={`/dashboard/rules/new?from_pattern=${p.id}`}
                            aria-label={`Convert approval pattern for ${p.vendor_name} ${p.amount_bucket} to a rule`}
                            className="text-xs font-medium text-stone-600 hover:text-stone-900 whitespace-nowrap"
                          >
                            Convert to rule →
                          </Link>
                        ) : covered ? (
                          <span className="text-[10px] uppercase tracking-wider text-stone-400">
                            Rule exists
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Invoice history */}
      <div>
        <h2 className="text-sm font-semibold text-stone-900 mb-3">
          Invoice History <span className="text-stone-400 font-normal">({invoices.length})</span>
        </h2>
        <div className="border border-stone-200 rounded-lg bg-white overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50">
                <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wider text-stone-500 font-medium">Invoice ID</th>
                <th className="text-right px-4 py-2.5 text-[11px] uppercase tracking-wider text-stone-500 font-medium">Amount</th>
                <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wider text-stone-500 font-medium">Decision</th>
                <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wider text-stone-500 font-medium">Approval</th>
                <th className="text-left px-4 py-2.5 text-[11px] uppercase tracking-wider text-stone-500 font-medium">Payment</th>
                <th className="text-right px-4 py-2.5 text-[11px] uppercase tracking-wider text-stone-500 font-medium">Received</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center">
                    <p className="text-sm text-stone-600">No invoices found for this vendor.</p>
                  </td>
                </tr>
              )}
              {invoices.map((inv) => {
                const apTone = statusTone(inv.approval_status);
                const apCls = apTone === "stone" ? stoneTone : toneClasses[apTone];
                const payTone = statusTone(inv.payment_status);
                const payCls = payTone === "stone" ? stoneTone : toneClasses[payTone];
                return (
                  <tr
                    key={inv.id}
                    onClick={() => router.push(`/dashboard/invoices/${inv.id}`)}
                    className="border-b border-stone-100 last:border-0 hover:bg-stone-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 text-sm font-mono text-stone-700">{inv.invoice_id || `#${inv.id}`}</td>
                    <td className="px-4 py-3 text-right text-sm font-mono text-stone-900">{formatCurrency(inv.amount)}</td>
                    <td className="px-4 py-3 text-sm text-stone-700">{inv.decision || "—"}</td>
                    <td className="px-4 py-3">
                      {inv.approval_status ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] uppercase tracking-wider ${apCls}`}>
                          {inv.approval_status}
                        </span>
                      ) : (
                        <span className="text-xs text-stone-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {inv.payment_status ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] uppercase tracking-wider ${payCls}`}>
                          {inv.payment_status}
                        </span>
                      ) : (
                        <span className="text-xs text-stone-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-stone-500">{formatDate(inv.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, mono, tone }) {
  const valueClass = tone === "emerald"
    ? "text-emerald-700"
    : tone === "red"
    ? "text-red-700"
    : "text-stone-900";
  return (
    <div className="border border-stone-200 bg-white rounded-lg px-4 py-3">
      <p className="text-[11px] uppercase tracking-wider text-stone-500">{label}</p>
      <p className={`text-xl font-semibold mt-1 ${mono ? "font-mono" : ""} ${valueClass}`}>
        {value}
      </p>
    </div>
  );
}