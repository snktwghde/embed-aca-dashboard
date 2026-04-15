"use client";

import { useEffect, useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
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
  "10k_50k": "₹10K–₹50K",
  "50k_100k": "₹50K–₹1L",
  "100k_500k": "₹1L–₹5L",
  over_500k: "over ₹5L",
};

/**
 * Overlap-based dedup — mirrors the check in vendors/[id]/page.js so that
 * direct navigation to /rules/new?from_pattern={id} (bookmark, second tab,
 * back button after save) doesn't let operators create duplicate rules.
 */
const patternIsAlreadyCovered = (pattern, rules) => {
  const bucket = bucketToAmountRange(pattern.amount_bucket);
  const patternMin = bucket.min_amount ?? 0;
  const patternMax = bucket.max_amount ?? Number.POSITIVE_INFINITY;
  const patternVendor = (pattern.vendor_name || "").toLowerCase();

  return rules.some((r) => {
    const c = r.conditions || {};
    if (typeof c.vendor !== "string") return false;
    if (c.vendor.toLowerCase() !== patternVendor) return false;
    const ruleMin = c.min_amount ?? 0;
    const ruleMax = c.max_amount ?? Number.POSITIVE_INFINITY;
    return ruleMin <= patternMax && ruleMax >= patternMin;
  });
};

/**
 * Transforms an approval_patterns row into the initialRule shape RuleForm expects.
 * Mirrors the Phase 7 backend generateRuleSuggestions logic: vendor exact match,
 * amount range from bucket, is_known_vendor=true, vendor_score_min=60.
 * Priority 50 matches the backend default.
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
  const supabase = useMemo(() => createClient(), []);

  const [prefill, setPrefill] = useState(null);
  const [prefillMeta, setPrefillMeta] = useState(null);
  const [alreadyCovered, setAlreadyCovered] = useState(false);
  const [loading, setLoading] = useState(!!fromPatternId);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!fromPatternId) {
      setLoading(false);
      return;
    }

    const fetchPatternAndDedup = async () => {
      try {
        // 1. Fetch the pattern (RLS-gated to this tenant)
        const { data: patternData, error: patternErr } = await supabase
          .from("approval_patterns")
          .select(
            "id, approver_email, vendor_name, amount_bucket, decision, occurrence_count, confidence"
          )
          .eq("id", fromPatternId)
          .single();

        if (patternErr || !patternData) {
          setError(
            "Could not load the approval pattern. It may have been deleted or you may not have access."
          );
          setLoading(false);
          return;
        }

        // 2. Fetch active rules to run dedup backstop
        const { data: ruleRows, error: rulesErr } = await supabase
          .from("tenant_rules")
          .select("conditions")
          .eq("is_active", true)
          .limit(200);

        if (rulesErr) {
          // Non-fatal — proceed without dedup. Operator can still catch duplicates
          // manually, and vendor detail page had its own check. Log and continue.
          console.warn("Rules fetch for dedup failed:", rulesErr);
        }

        const covered = (ruleRows || []).length > 0
          ? patternIsAlreadyCovered(patternData, ruleRows)
          : false;

        setAlreadyCovered(covered);
        setPrefill(patternToInitialRule(patternData));
        setPrefillMeta({
          approver: patternData.approver_email,
          occurrences: patternData.occurrence_count,
          confidence: Math.round(Number(patternData.confidence) * 100),
          vendor: patternData.vendor_name,
        });
      } catch (err) {
        setError(`Failed to load pattern: ${err.message || "Unknown error"}`);
      } finally {
        setLoading(false);
      }
    };

    fetchPatternAndDedup();
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
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-800 mb-4">
          {error}
        </div>
        <Link
          href="/dashboard/rules"
          className="text-sm text-stone-500 hover:text-stone-900"
        >
          ← Back to rules
        </Link>
      </div>
    );
  }

  // Dedup hit — an active rule already covers this pattern. Block creation
  // rather than letting the operator build a duplicate they'll have to
  // untangle later.
  if (alreadyCovered) {
    return (
      <div className="px-8 py-16 max-w-3xl mx-auto">
        <div className="px-4 py-4 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-900 mb-4">
          <div className="font-medium mb-1">A rule already covers this pattern</div>
          <div className="text-xs text-amber-800">
            An active rule for <strong>{prefillMeta?.vendor}</strong> already
            matches this amount range. Creating another would cause unpredictable
            priority conflicts. Edit the existing rule if you need to change its
            behavior.
          </div>
        </div>
        <div className="flex gap-3">
          <Link
            href="/dashboard/rules"
            className="text-sm px-4 py-2 border border-stone-200 rounded-md hover:bg-stone-50"
          >
            View rules
          </Link>
          <Link
            href="/dashboard/vendors"
            className="text-sm px-4 py-2 border border-stone-200 rounded-md hover:bg-stone-50"
          >
            Back to vendors
          </Link>
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