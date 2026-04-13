"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import RuleForm from "../../_components/RuleForm";

export default function EditRulePage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();

  const [rule, setRule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchRule() {
      const { data, error: fetchError } = await supabase
        .from("tenant_rules")
        .select("*")
        .eq("id", params.id)
        .single();

      if (fetchError) {
        setError(fetchError.message);
        setLoading(false);
        return;
      }

      setRule(data);
      setLoading(false);
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