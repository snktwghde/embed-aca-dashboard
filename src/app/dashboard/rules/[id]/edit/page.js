"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import RuleForm from "../../_components/RuleForm";

export default function EditRulePage() {
  const params = useParams();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [rule, setRule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchRule() {
      try {
        // Pull tenant from JWT for defense-in-depth scoping.
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const tenantId = user?.app_metadata?.tenant_id;

        if (!tenantId) {
          setError("Could not determine tenant from session. Try signing out and back in.");
          setLoading(false);
          return;
        }

        const { data, error: fetchError } = await supabase
          .from("tenant_rules")
          .select("*")
          .eq("id", params.id)
          .eq("tenant_id", tenantId)
          .single();

        // PGRST116 = "no rows returned" from .single().
        // 22P02 = invalid text representation (e.g. malformed UUID in URL).
        // Both get translated to a human message rather than raw PostgREST output.
        if (fetchError?.code === "PGRST116" || fetchError?.code === "22P02") {
          setError("Rule not found or you don't have access.");
        } else if (fetchError) {
          setError(fetchError.message);
        } else {
          setRule(data);
        }
      } catch (err) {
        setError(`Failed to load rule: ${err.message || "Unknown error"}`);
      } finally {
        setLoading(false);
      }
    }

    fetchRule();
  }, [params.id, supabase]);

  if (loading) {
    return (
      <div className="px-8 py-16 text-center text-stone-400 text-sm">
        Loading rule…
      </div>
    );
  }

  if (error || !rule) {
    return (
      <div className="px-8 py-16 max-w-3xl mx-auto">
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-800 mb-4">
          {error || "Rule not found"}
        </div>
        <button
          onClick={() => router.push("/dashboard/rules")}
          className="text-sm text-stone-500 hover:text-stone-900"
        >
          ← Back to rules
        </button>
      </div>
    );
  }

  return <RuleForm initialRule={rule} />;
}