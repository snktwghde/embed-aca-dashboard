"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

const ACTIONS = [
  { value: "approve", label: "Auto-approve" },
  { value: "reject", label: "Auto-reject" },
  { value: "review", label: "Flag for review" },
];

const RULE_TYPES = [
  { value: "auto_approve", label: "Auto-approve" },
  { value: "auto_reject", label: "Auto-reject" },
  { value: "flag_review", label: "Flag review" },
];

/**
 * Builds the conditions JSONB from form state.
 * Critical: only checked fields are included. Phase 7's evaluateRules uses
 * `!== undefined` checks, so omitted keys MUST actually be absent from the
 * object — not set to null, not set to empty string. If a key is in the
 * object at all, the engine will try to match it.
 */
function buildConditions(c) {
  const out = {};
  if (c.vendor_enabled && c.vendor.trim()) out.vendor = c.vendor.trim();
  if (c.min_amount_enabled && c.min_amount !== "") out.min_amount = Number(c.min_amount);
  if (c.max_amount_enabled && c.max_amount !== "") out.max_amount = Number(c.max_amount);
  if (c.department_enabled && c.department.trim()) out.department = c.department.trim();
  if (c.is_known_vendor_enabled) out.is_known_vendor = true;
  if (c.vendor_score_min_enabled && c.vendor_score_min !== "") {
    out.vendor_score_min = Number(c.vendor_score_min);
  }
  if (c.is_duplicate_enabled) out.is_duplicate = true;
  return out;
}

function conditionsToFormState(conditions) {
  const c = conditions || {};
  return {
    vendor_enabled: c.vendor !== undefined,
    vendor: c.vendor || "",
    min_amount_enabled: c.min_amount !== undefined,
    min_amount: c.min_amount !== undefined ? String(c.min_amount) : "",
    max_amount_enabled: c.max_amount !== undefined,
    max_amount: c.max_amount !== undefined ? String(c.max_amount) : "",
    department_enabled: c.department !== undefined,
    department: c.department || "",
    is_known_vendor_enabled: c.is_known_vendor === true,
    vendor_score_min_enabled: c.vendor_score_min !== undefined,
    vendor_score_min: c.vendor_score_min !== undefined ? String(c.vendor_score_min) : "",
    is_duplicate_enabled: c.is_duplicate === true,
  };
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function RuleForm({ initialRule = null, prefillBanner = null }) {
  const router = useRouter();
  // Memoized once per mount — prevents re-creating client on every render.
  const supabase = useMemo(() => createClient(), []);

  // Robust isEdit: explicit null check AND presence of id. Prevents a partial
  // prefill object (from a future entry point) from accidentally triggering UPDATE.
  const isEdit = initialRule !== null && initialRule.id !== undefined;

  const [ruleName, setRuleName] = useState(initialRule?.rule_name || "");
  const [ruleType, setRuleType] = useState(initialRule?.rule_type || "auto_approve");
  const [action, setAction] = useState(initialRule?.action || "approve");
  const [priority, setPriority] = useState(
    initialRule?.priority !== undefined ? String(initialRule.priority) : "50"
  );
  const [isActive, setIsActive] = useState(
    initialRule?.is_active !== undefined ? initialRule.is_active : true
  );
  const [conditions, setConditions] = useState(
    conditionsToFormState(initialRule?.conditions)
  );

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Refs for focus management on modal open
  const deleteModalCancelRef = useRef(null);

  function updateCondition(field, value) {
    setConditions((prev) => ({ ...prev, [field]: value }));
  }

  // Inline min/max cross-field validation (UX-RF-001).
  // Surfaces the error the moment both fields are filled, not only at save.
  const liveMinMaxError = useMemo(() => {
    if (!conditions.min_amount_enabled || !conditions.max_amount_enabled) return null;
    if (conditions.min_amount === "" || conditions.max_amount === "") return null;
    const minV = Number(conditions.min_amount);
    const maxV = Number(conditions.max_amount);
    if (isNaN(minV) || isNaN(maxV)) return null;
    if (minV >= maxV) return "Must be greater than min amount";
    return null;
  }, [
    conditions.min_amount_enabled,
    conditions.max_amount_enabled,
    conditions.min_amount,
    conditions.max_amount,
  ]);

  function validate() {
    const errs = {};

    if (!ruleName.trim()) {
      errs.ruleName = "Required";
    } else if (ruleName.trim().length > 200) {
      errs.ruleName = "Max 200 characters";
    }

    const p = Number(priority);
    if (!priority || !Number.isInteger(p) || p < 1 || p > 999) {
      errs.priority = "Integer between 1 and 999";
    }

    if (!ACTIONS.find((a) => a.value === action)) {
      errs.action = "Invalid action";
    }

    if (!RULE_TYPES.find((t) => t.value === ruleType)) {
      errs.ruleType = "Invalid type";
    }

    const built = buildConditions(conditions);
    const conditionCount = Object.keys(built).length;

    if (conditionCount === 0) {
      errs.conditions =
        "At least one condition is required. A rule with no conditions matches every invoice.";
    }

    if (conditions.vendor_enabled && !conditions.vendor.trim()) {
      errs.vendor = "Vendor name required";
    }

    if (conditions.min_amount_enabled) {
      const v = Number(conditions.min_amount);
      if (conditions.min_amount === "" || isNaN(v) || v < 0) {
        errs.min_amount = "Non-negative number required";
      }
    }

    if (conditions.max_amount_enabled) {
      const v = Number(conditions.max_amount);
      if (conditions.max_amount === "" || isNaN(v) || v < 0) {
        errs.max_amount = "Non-negative number required";
      }
    }

    if (
      conditions.min_amount_enabled &&
      conditions.max_amount_enabled &&
      !errs.min_amount &&
      !errs.max_amount
    ) {
      if (Number(conditions.min_amount) >= Number(conditions.max_amount)) {
        errs.max_amount = "Must be greater than min amount";
      }
    }

    if (conditions.department_enabled && !conditions.department.trim()) {
      errs.department = "Department required";
    }

    if (conditions.vendor_score_min_enabled) {
      const v = Number(conditions.vendor_score_min);
      if (
        conditions.vendor_score_min === "" ||
        !Number.isInteger(v) ||
        v < 0 ||
        v > 100
      ) {
        errs.vendor_score_min = "Integer between 0 and 100";
      }
    }

    return errs;
  }

  async function handleSave(e) {
    e.preventDefault();
    if (saving) return; // Double-submit guard
    setError(null);
    setFieldErrors({});

    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      setError("Fix the errors below before saving.");
      return;
    }

    setSaving(true);

    try {
      // Tenant id pulled from JWT app_metadata. Used as INSERT payload and
      // as UPDATE/DELETE scope (defense-in-depth; RLS is the real gate).
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const tenantId = user?.app_metadata?.tenant_id;

      if (!tenantId) {
        setError("Could not determine tenant from session. Try signing out and back in.");
        return;
      }

      const payload = {
        rule_name: ruleName.trim(),
        rule_type: ruleType,
        action,
        priority: Number(priority),
        is_active: isActive,
        conditions: buildConditions(conditions),
        updated_at: new Date().toISOString(),
      };

      let result;
      if (isEdit) {
        result = await supabase
          .from("tenant_rules")
          .update(payload)
          .eq("id", initialRule.id)
          .eq("tenant_id", tenantId);
      } else {
        result = await supabase.from("tenant_rules").insert({
          ...payload,
          tenant_id: tenantId,
        });
      }

      if (result.error) {
        setError(`Save failed: ${result.error.message}`);
        return;
      }

      router.push("/dashboard/rules");
    } catch (err) {
      setError(`Save failed: ${err.message || "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (deleting) return; // Double-click guard
    setDeleting(true);
    setError(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const tenantId = user?.app_metadata?.tenant_id;

      if (!tenantId) {
        setError("Could not determine tenant from session.");
        setShowDeleteConfirm(false);
        return;
      }

      const { error: delError } = await supabase
        .from("tenant_rules")
        .delete()
        .eq("id", initialRule.id)
        .eq("tenant_id", tenantId);

      if (delError) {
        setError(`Delete failed: ${delError.message}`);
        setShowDeleteConfirm(false);
        return;
      }

      router.push("/dashboard/rules");
    } catch (err) {
      setError(`Delete failed: ${err.message || "Unknown error"}`);
      setShowDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  }

  // Focus the Cancel button when delete modal opens (accessibility).
  useEffect(() => {
    if (showDeleteConfirm && deleteModalCancelRef.current) {
      deleteModalCancelRef.current.focus();
    }
  }, [showDeleteConfirm]);

  // Esc closes delete modal
  useEffect(() => {
    if (!showDeleteConfirm) return;
    const onKey = (e) => {
      if (e.key === "Escape" && !deleting) setShowDeleteConfirm(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showDeleteConfirm, deleting]);

  return (
    <div className="px-8 py-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => router.push("/dashboard/rules")}
          className="text-sm text-stone-500 hover:text-stone-900 mb-4 inline-flex items-center gap-1"
        >
          ← Back to rules
        </button>
        <h1 className="text-3xl font-semibold text-stone-900 tracking-tight">
          {isEdit ? "Edit rule" : "New rule"}
        </h1>
        <p className="mt-2 text-sm text-stone-500">
          {isEdit
            ? "Changes take effect immediately for the next invoice processed."
            : "Rules run before the AI in priority order. The first matching rule decides the invoice."}
        </p>
      </div>

      {/* Prefill banner (from Convert Pattern to Rule flow) */}
      {prefillBanner && <div className="mb-6">{prefillBanner}</div>}

      {error && (
        <div className="mb-6 px-4 py-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">
          {error}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-8">
        {/* Basic info section */}
        <section className="bg-white border border-stone-200 rounded-lg p-6 space-y-5">
          <h2 className="text-xs font-medium text-stone-500 uppercase tracking-wide">
            Basic info
          </h2>

          <div>
            <label
              htmlFor="rule-name"
              className="block text-sm font-medium text-stone-700 mb-1.5"
            >
              Rule name
            </label>
            <input
              id="rule-name"
              type="text"
              value={ruleName}
              onChange={(e) => setRuleName(e.target.value)}
              placeholder="e.g. Auto-approve trusted small invoices"
              aria-invalid={!!fieldErrors.ruleName}
              aria-describedby={fieldErrors.ruleName ? "rule-name-error" : undefined}
              className={`w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-stone-900 focus:border-stone-900 ${
                fieldErrors.ruleName ? "border-red-300" : "border-stone-300"
              }`}
            />
            {fieldErrors.ruleName && (
              <p id="rule-name-error" className="mt-1 text-xs text-red-600">
                {fieldErrors.ruleName}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div>
              <label
                htmlFor="rule-type"
                className="block text-sm font-medium text-stone-700 mb-1.5"
              >
                Rule type
              </label>
              <select
                id="rule-type"
                value={ruleType}
                onChange={(e) => setRuleType(e.target.value)}
                className="w-full px-3 py-2 border border-stone-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-stone-900 focus:border-stone-900"
              >
                {RULE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-stone-400">
                Label only — does not affect engine behavior
              </p>
            </div>

            <div>
              <label
                htmlFor="rule-priority"
                className="block text-sm font-medium text-stone-700 mb-1.5"
              >
                Priority
              </label>
              <input
                id="rule-priority"
                type="number"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                min="1"
                max="999"
                aria-invalid={!!fieldErrors.priority}
                aria-describedby={fieldErrors.priority ? "rule-priority-error" : undefined}
                className={`w-full px-3 py-2 border rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-stone-900 focus:border-stone-900 ${
                  fieldErrors.priority ? "border-red-300" : "border-stone-300"
                }`}
              />
              <p className="mt-1 text-xs text-stone-400">
                Lower runs first (1 = highest)
              </p>
              {fieldErrors.priority && (
                <p id="rule-priority-error" className="mt-1 text-xs text-red-600">
                  {fieldErrors.priority}
                </p>
              )}
            </div>
          </div>

          <div>
            <div
              className="block text-sm font-medium text-stone-700 mb-1.5"
              id="action-group-label"
            >
              Action when matched
            </div>
            <div
              role="radiogroup"
              aria-labelledby="action-group-label"
              className="grid grid-cols-3 gap-2"
            >
              {ACTIONS.map((a) => (
                <button
                  key={a.value}
                  type="button"
                  role="radio"
                  aria-checked={action === a.value}
                  onClick={() => setAction(a.value)}
                  className={`px-3 py-2 text-sm font-medium border rounded-md transition-colors ${
                    action === a.value
                      ? "bg-stone-900 text-white border-stone-900"
                      : "bg-white text-stone-700 border-stone-300 hover:border-stone-400"
                  }`}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Conditions section */}
        <section className="bg-white border border-stone-200 rounded-lg p-6 space-y-5">
          <div>
            <h2 className="text-xs font-medium text-stone-500 uppercase tracking-wide">
              Conditions
            </h2>
            <p className="text-xs text-stone-400 mt-1">
              ALL checked conditions must be true for the rule to fire. Unchecked
              fields are ignored.
            </p>
          </div>

          {fieldErrors.conditions && (
            <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-800">
              {fieldErrors.conditions}
            </div>
          )}

          <ConditionRow
            checked={conditions.vendor_enabled}
            onToggle={(v) => updateCondition("vendor_enabled", v)}
            label="Vendor exact match"
            description="Case-insensitive"
          >
            <input
              type="text"
              value={conditions.vendor}
              onChange={(e) => updateCondition("vendor", e.target.value)}
              disabled={!conditions.vendor_enabled}
              placeholder="e.g. BigCorp"
              className={`w-full px-3 py-1.5 border rounded-md text-sm disabled:bg-stone-50 disabled:text-stone-400 ${
                fieldErrors.vendor ? "border-red-300" : "border-stone-300"
              }`}
            />
            {fieldErrors.vendor && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.vendor}</p>
            )}
          </ConditionRow>

          <ConditionRow
            checked={conditions.min_amount_enabled}
            onToggle={(v) => updateCondition("min_amount_enabled", v)}
            label="Minimum amount (₹)"
          >
            <input
              type="number"
              value={conditions.min_amount}
              onChange={(e) => updateCondition("min_amount", e.target.value)}
              disabled={!conditions.min_amount_enabled}
              min="0"
              placeholder="0"
              className={`w-full px-3 py-1.5 border rounded-md text-sm font-mono disabled:bg-stone-50 disabled:text-stone-400 ${
                fieldErrors.min_amount ? "border-red-300" : "border-stone-300"
              }`}
            />
            {fieldErrors.min_amount && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.min_amount}</p>
            )}
          </ConditionRow>

          <ConditionRow
            checked={conditions.max_amount_enabled}
            onToggle={(v) => updateCondition("max_amount_enabled", v)}
            label="Maximum amount (₹)"
          >
            <input
              type="number"
              value={conditions.max_amount}
              onChange={(e) => updateCondition("max_amount", e.target.value)}
              disabled={!conditions.max_amount_enabled}
              min="0"
              placeholder="50000"
              className={`w-full px-3 py-1.5 border rounded-md text-sm font-mono disabled:bg-stone-50 disabled:text-stone-400 ${
                fieldErrors.max_amount || liveMinMaxError
                  ? "border-red-300"
                  : "border-stone-300"
              }`}
            />
            {/* Show server-side validation error first, fall back to live inline error */}
            {fieldErrors.max_amount ? (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.max_amount}</p>
            ) : liveMinMaxError ? (
              <p className="mt-1 text-xs text-red-600">{liveMinMaxError}</p>
            ) : null}
          </ConditionRow>

          <ConditionRow
            checked={conditions.department_enabled}
            onToggle={(v) => updateCondition("department_enabled", v)}
            label="Department"
            description="Case-insensitive exact match"
          >
            <input
              type="text"
              value={conditions.department}
              onChange={(e) => updateCondition("department", e.target.value)}
              disabled={!conditions.department_enabled}
              placeholder="e.g. Engineering"
              className={`w-full px-3 py-1.5 border rounded-md text-sm disabled:bg-stone-50 disabled:text-stone-400 ${
                fieldErrors.department ? "border-red-300" : "border-stone-300"
              }`}
            />
            {fieldErrors.department && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.department}</p>
            )}
          </ConditionRow>

          <ConditionRow
            checked={conditions.is_known_vendor_enabled}
            onToggle={(v) => updateCondition("is_known_vendor_enabled", v)}
            label="Vendor must be known"
            description="Vendor exists in vendor_scores with at least one prior invoice"
          />

          <ConditionRow
            checked={conditions.vendor_score_min_enabled}
            onToggle={(v) => updateCondition("vendor_score_min_enabled", v)}
            label="Minimum reliability score"
            description="0–100"
          >
            <input
              type="number"
              value={conditions.vendor_score_min}
              onChange={(e) => updateCondition("vendor_score_min", e.target.value)}
              disabled={!conditions.vendor_score_min_enabled}
              min="0"
              max="100"
              placeholder="75"
              className={`w-full px-3 py-1.5 border rounded-md text-sm font-mono disabled:bg-stone-50 disabled:text-stone-400 ${
                fieldErrors.vendor_score_min ? "border-red-300" : "border-stone-300"
              }`}
            />
            {fieldErrors.vendor_score_min && (
              <p className="mt-1 text-xs text-red-600">{fieldErrors.vendor_score_min}</p>
            )}
          </ConditionRow>

          <ConditionRow
            checked={conditions.is_duplicate_enabled}
            onToggle={(v) => updateCondition("is_duplicate_enabled", v)}
            label="Only on suspected duplicates"
            description="Use with auto-reject to block duplicates before they reach the AI"
          />
        </section>

        {/* Status section */}
        <section className="bg-white border border-stone-200 rounded-lg p-6">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-stone-300 text-stone-900 focus:ring-stone-900"
            />
            <div>
              <div className="text-sm font-medium text-stone-900">Active</div>
              <div className="text-xs text-stone-400 mt-0.5">
                Inactive rules are stored but skipped by the engine
              </div>
            </div>
          </label>
        </section>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2">
          <div>
            {isEdit && (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="text-sm text-red-600 hover:text-red-800 font-medium"
              >
                Delete rule
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push("/dashboard/rules")}
              className="px-4 py-2 text-sm font-medium text-stone-700 hover:text-stone-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-stone-900 text-white text-sm font-medium rounded-md hover:bg-stone-800 disabled:opacity-50 disabled:cursor-wait transition-colors"
            >
              {saving ? "Saving…" : isEdit ? "Save changes" : "Create rule"}
            </button>
          </div>
        </div>

        {/* Metadata footer (edit mode only) */}
        {isEdit && (
          <div className="pt-4 mt-4 border-t border-stone-100 text-xs text-stone-400 font-mono">
            Created {formatDate(initialRule.created_at)} · ID {initialRule.id}
          </div>
        )}
      </form>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 bg-stone-900/50 flex items-center justify-center z-50 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
        >
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 id="delete-modal-title" className="text-lg font-semibold text-stone-900 mb-2">
              Delete this rule?
            </h3>
            <p className="text-sm text-stone-600 mb-6">
              <span className="font-medium text-stone-900">{initialRule?.rule_name}</span>{" "}
              will be permanently deleted. This cannot be undone. Future invoices that
              would have matched this rule will fall through to the AI instead.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                ref={deleteModalCancelRef}
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="px-4 py-2 text-sm font-medium text-stone-700 hover:text-stone-900 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-wait"
              >
                {deleting ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ConditionRow({ checked, onToggle, label, description, children }) {
  return (
    <div className="flex items-start gap-4">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onToggle(e.target.checked)}
        className="mt-1 h-4 w-4 rounded border-stone-300 text-stone-900 focus:ring-stone-900 flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <label
          className="block text-sm font-medium text-stone-700 cursor-pointer"
          onClick={() => onToggle(!checked)}
        >
          {label}
        </label>
        {description && (
          <p className="text-xs text-stone-400 mt-0.5 mb-2">{description}</p>
        )}
        {children && <div className="mt-2">{children}</div>}
      </div>
    </div>
  );
}