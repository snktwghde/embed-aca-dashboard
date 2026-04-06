"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

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

function formatDateTime(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
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
      className={`inline-flex items-center px-2.5 py-1 rounded-md text-sm font-medium border ${
        styles[status] || "bg-stone-100 text-stone-600 border-stone-200"
      }`}
    >
      {status === "approved" && "✓ "}
      {status === "rejected" && "✕ "}
      {status === "pending" && "⏳ "}
      {status || "unknown"}
    </span>
  );
}

function InfoRow({ label, children }) {
  return (
    <div className="flex justify-between items-start py-2.5 border-b border-stone-100 last:border-0">
      <span className="text-stone-500 text-sm">{label}</span>
      <span className="text-stone-800 text-sm text-right max-w-[60%]">
        {children}
      </span>
    </div>
  );
}

export default function InvoiceDetailPage() {
  const router = useRouter();
  const params = useParams();
  const invoiceId = params.id;
  const supabase = createClient();

  const [invoice, setInvoice] = useState(null);
  const [vendorScore, setVendorScore] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchDetail() {
      setLoading(true);
      setError(null);

      try {
        // 1. Fetch the invoice
        const { data: inv, error: invErr } = await supabase
          .from("invoices")
          .select("*")
          .eq("id", invoiceId)
          .single();

        if (invErr) throw invErr;
        if (!inv) throw new Error("Invoice not found");

        setInvoice(inv);

        // 2. Fetch vendor score (if vendor exists in vendor_scores)
        if (inv.vendor) {
          const { data: vs } = await supabase
            .from("vendor_scores")
            .select("*")
            .eq("vendor_name", inv.vendor)
            .maybeSingle();
          setVendorScore(vs);
        }

        // 3. Fetch prediction record for this invoice
        if (inv.invoice_id) {
          const { data: preds } = await supabase
            .from("prediction_confidence")
            .select("*")
            .eq("invoice_id", inv.invoice_id)
            .order("created_at", { ascending: false })
            .limit(1);
          if (preds && preds.length > 0) {
            setPrediction(preds[0]);
          }
        }
      } catch (err) {
        console.error("Detail fetch error:", err);
        setError(err.message || "Failed to load invoice");
      } finally {
        setLoading(false);
      }
    }

    if (invoiceId) fetchDetail();
  }, [invoiceId, supabase]);

  if (loading) {
    return (
      <div className="p-6 lg:p-8 max-w-4xl">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-40 bg-stone-200 rounded" />
          <div className="h-4 w-64 bg-stone-100 rounded" />
          <div className="h-64 bg-stone-100 rounded-lg mt-6" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 lg:p-8 max-w-4xl">
        <button
          onClick={() => router.push("/dashboard/invoices")}
          className="text-sm text-stone-500 hover:text-stone-700 mb-4"
        >
          ← Back to invoices
        </button>
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">
          {error}
        </div>
      </div>
    );
  }

  if (!invoice) return null;

  const confidencePct =
    invoice.confidence_score != null
      ? Math.round(invoice.confidence_score * 100)
      : null;

  return (
    <div className="p-6 lg:p-8 max-w-4xl">
      {/* Back link */}
      <button
        onClick={() => router.push("/dashboard/invoices")}
        className="text-sm text-stone-500 hover:text-stone-700 mb-5 flex items-center gap-1"
      >
        ← Back to invoices
      </button>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900 tracking-tight">
            {invoice.invoice_id || `Invoice #${invoice.id}`}
          </h1>
          <p className="text-stone-500 text-sm mt-1">
            {invoice.vendor} · {formatCurrency(invoice.amount)}
          </p>
        </div>
        <StatusBadge status={invoice.approval_status} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column — Invoice details */}
        <div className="space-y-6">
          {/* Basic info */}
          <div className="bg-white border border-stone-200 rounded-lg p-5">
            <h2 className="text-sm font-semibold text-stone-700 uppercase tracking-wider mb-3">
              Invoice Details
            </h2>
            <InfoRow label="Vendor">{invoice.vendor}</InfoRow>
            <InfoRow label="Amount">
              <span className="font-mono">{formatCurrency(invoice.amount)}</span>
            </InfoRow>
            <InfoRow label="Department">
              {invoice.department || "—"}
            </InfoRow>
            <InfoRow label="Invoice Date">
              {formatDate(invoice.invoice_date)}
            </InfoRow>
            <InfoRow label="Due Date">
              {formatDate(invoice.due_date)}
            </InfoRow>
            <InfoRow label="Submitted">
              {formatDateTime(invoice.created_at)}
            </InfoRow>
          </div>

          {/* Approval info */}
          <div className="bg-white border border-stone-200 rounded-lg p-5">
            <h2 className="text-sm font-semibold text-stone-700 uppercase tracking-wider mb-3">
              Approval Status
            </h2>
            <InfoRow label="Status">
              <StatusBadge status={invoice.approval_status} />
            </InfoRow>
            <InfoRow label="Approver">
              {invoice.approved_by || "—"}
            </InfoRow>
            {invoice.approved_at && (
              <InfoRow label="Decided At">
                {formatDateTime(invoice.approved_at)}
              </InfoRow>
            )}
            <InfoRow label="Payment Status">
              {invoice.payment_status || "unpaid"}
            </InfoRow>
            {invoice.reminder_count > 0 && (
              <InfoRow label="Reminders Sent">
                {invoice.reminder_count}
              </InfoRow>
            )}
            {invoice.escalation_status && (
              <InfoRow label="Escalation">
                {invoice.escalation_status}
              </InfoRow>
            )}
          </div>
        </div>

        {/* Right column — Intelligence context */}
        <div className="space-y-6">
          {/* AI Decision */}
          <div className="bg-white border border-stone-200 rounded-lg p-5">
            <h2 className="text-sm font-semibold text-stone-700 uppercase tracking-wider mb-3">
              System Decision
            </h2>
            <div className="flex items-center gap-4 mb-4">
              <div
                className={`text-3xl font-mono font-bold ${
                  confidencePct >= 80
                    ? "text-emerald-700"
                    : confidencePct >= 50
                    ? "text-amber-700"
                    : "text-red-700"
                }`}
              >
                {confidencePct != null ? `${confidencePct}%` : invoice.confidence || "—"}
              </div>
              <div>
                <p className="text-sm text-stone-600">
                  Decision:{" "}
                  <span className="font-medium text-stone-800">
                    {invoice.decision}
                  </span>
                </p>
                {prediction && (
                  <p className="text-xs text-stone-400 mt-0.5">
                    Source:{" "}
                    {prediction.decision_source === "rules_engine"
                      ? "Rules Engine"
                      : prediction.decision_source === "hard_rule"
                      ? "Safety Rule"
                      : prediction.decision_source === "llm"
                      ? "AI Analysis"
                      : prediction.decision_source || "—"}
                  </p>
                )}
              </div>
            </div>

            {/* Reasoning */}
            <div className="bg-stone-50 border border-stone-100 rounded-lg p-4">
              <p className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-2">
                Reasoning
              </p>
              <p className="text-sm text-stone-700 leading-relaxed">
                {invoice.reasoning || "No reasoning recorded."}
              </p>
            </div>

            {/* Prediction outcome */}
            {prediction && prediction.actual_outcome && (
              <div className="mt-4 flex items-center gap-2">
                <span
                  className={`inline-block w-2 h-2 rounded-full ${
                    prediction.was_correct ? "bg-emerald-500" : "bg-red-500"
                  }`}
                />
                <span className="text-xs text-stone-500">
                  Prediction was{" "}
                  <span className="font-medium">
                    {prediction.was_correct ? "correct" : "incorrect"}
                  </span>
                  {" — "}actual outcome: {prediction.actual_outcome}
                </span>
              </div>
            )}
          </div>

          {/* Vendor Intelligence */}
          {vendorScore && (
            <div className="bg-white border border-stone-200 rounded-lg p-5">
              <h2 className="text-sm font-semibold text-stone-700 uppercase tracking-wider mb-3">
                Vendor Intelligence
              </h2>
              <div className="flex items-center gap-3 mb-4">
                <div
                  className={`text-3xl font-mono font-bold ${
                    vendorScore.reliability_score >= 70
                      ? "text-emerald-700"
                      : vendorScore.reliability_score >= 40
                      ? "text-amber-700"
                      : "text-red-700"
                  }`}
                >
                  {vendorScore.reliability_score}
                </div>
                <div>
                  <p className="text-sm text-stone-600">Reliability Score</p>
                  <p className="text-xs text-stone-400">
                    Based on {vendorScore.total_invoices || 0} invoices
                  </p>
                </div>
              </div>
              <InfoRow label="Approved">
                {vendorScore.total_approved || 0}
              </InfoRow>
              <InfoRow label="Rejected">
                {vendorScore.total_rejected || 0}
              </InfoRow>
              <InfoRow label="Avg Amount">
                <span className="font-mono">
                  {formatCurrency(vendorScore.avg_amount)}
                </span>
              </InfoRow>
              <InfoRow label="Dispute Rate">
                {vendorScore.dispute_rate != null
                  ? `${(vendorScore.dispute_rate * 100).toFixed(1)}%`
                  : "—"}
              </InfoRow>
              <InfoRow label="Last Updated">
                {formatDate(vendorScore.last_updated)}
              </InfoRow>
              <button
                onClick={() => router.push("/dashboard/vendors")}
                className="mt-3 text-xs text-stone-500 hover:text-stone-700 underline underline-offset-2"
              >
                View full vendor profile →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}