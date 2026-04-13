"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import RuleForm from "../_components/RuleForm";

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

const BUCKET_LABELS = {
  under_10k: "under ₹10K",
  "10k_50k: ₹10K–₹50K": "₹10K–₹50K",
  "10k_50k": "₹10K–₹50K",
  "50k_100k": "₹50K–₹1L",
  "100k_500k": "₹1L–₹5L",
  over_500k: "over ₹5L",
};

/**
 * Transforms an approval_patterns row into the initialRule shape the
 * RuleForm expects. Mirrors the Phase 7 backend generateRuleSuggestions
 * logic: vendor exact match, amount range from bucket, is_known_vendor=true,
 * vendor_score_min=60. Priority 50 matches the backend default.
 */
function patternToInitialRule(pattern) {
  const amountRange = bucketToAmountRange(pattern.amount_bucket);
  const bucketLabel = BUCKET_LABELS[pattern.amount_bucket] || pattern.amount_bucket;

  return {
    // No id — this is create mode, not edit mode. RuleForm decides on
    // create-vs-edit by whether initialRule.id exists.
    rule_name: `Auto-approve ${pattern.vendor_name} (${bucketLabel})`,
    rule_type: "auto_approve",
    action: "approve",
    priority: 50,
    is_active: true,
    conditions: {
      vendor: pattern.vendor_name,
      ...amountRange,
      is_known_vendor: true,
      vendor_score_min: 60,
    },
  };
}

export default function NewRulePage() {
  const searchParams = useSearchParams();
  const fromPatternId = searchParams.get("from_pattern");
  const supabase = createClient();

  const [prefill, setPrefill] = useState(null);
  const [prefillMeta, setPrefillMeta] = useState(null);
  const [loading, setLoading] = useState(!!fromPatternId);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!fromPatternId) {
      setLoading(false);
      return;
    }

    const fetchPattern = async () => {
      const { data, error: fetchError } = await supabase
        .from("approval_patterns")
        .select(
          "id, approver_email, vendor_name, amount_bucket, decision, occurrence_count, confidence"
        )
        .eq("id", fromPatternId)
        .single();

      if (fetchError || !data) {
        setError(
          "Could not load the approval pattern. It may have been deleted or you may not have access."
        );
        setLoading(false);
        return;
      }

      setPrefill(patternToInitialRule(data));
      setPrefillMeta({
        approver: data.approver_email,
        occurrences: data.occurrence_count,
        confidence: Math.round(Number(data.confidence) * 100),
        vendor: data.vendor_name,
      });
      setLoading(false);
    };

    fetchPattern();
  }, [fromPatternId, supabase]);

  if (loading) {
    return (
      <div className="px-8 py-16 text-center text-stone-400 text-sm">
        Loading pattern…
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-8 py-16 max-w-3xl mx-auto">
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">
          {error}
        </div>
      </div>
    );
  }

  const banner = prefillMeta ? (
    <div className="px-4 py-3 bg-stone-50 border border-stone-200 rounded-md text-sm text-stone-700">
      <div className="font-medium text-stone-900 mb-0.5">
        Prefilled from approval pattern
      </div>
      <div className="text-xs text-stone-600">
        {prefillMeta.approver} has approved {prefillMeta.occurrences} invoices
        from {prefillMeta.vendor} at {prefillMeta.confidence}% consistency.
        Review the fields below and adjust anything before saving.
      </div>
    </div>
  ) : null;

  return <RuleForm initialRule={prefill} prefillBanner={banner} />;
}