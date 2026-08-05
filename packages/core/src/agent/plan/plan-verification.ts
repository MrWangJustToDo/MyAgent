/**
 * Plan Verification checklist parsing and complete_plan gating.
 */

export interface VerificationResultItem {
  item: string;
  passed: boolean;
  evidence: string;
}

export type GateCompletePlanResult = { ok: true } | { ok: false; error: string };

const VERIFICATION_HEADING = /^\*\*Verification:\*\*\s*$/i;
const LIST_ITEM = /^\s*(?:[-*]|\d+[.)])\s+(?:\[[ xX]\]\s*)?(.+)$/;

/**
 * Normalize a verification line for matching (trim, collapse space, strip list markers).
 */
export function normalizeVerificationItem(text: string): string {
  let t = text.trim();
  t = t.replace(/^[-*]\s+/, "");
  t = t.replace(/^\d+[.)]\s+/, "");
  t = t.replace(/^\[[ xX]\]\s+/, "");
  return t.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Parse checklist items from a raw verification string (tool input).
 * Accepts markdown list lines or non-empty newline-separated lines.
 */
export function parseVerificationItemsFromText(verification: string): string[] {
  const lines = verification.split(/\r?\n/);
  const items: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const listMatch = trimmed.match(LIST_ITEM);
    if (listMatch) {
      const body = listMatch[1].trim();
      if (body.length >= 3) items.push(body);
      continue;
    }
    // Plain paragraph line (single-block verification without bullets)
    if (trimmed.length >= 3 && !trimmed.startsWith("#") && !trimmed.startsWith("```")) {
      items.push(trimmed);
    }
  }
  return items;
}

/**
 * Extract Verification section body from plan markdown, then parse items.
 */
export function parseVerificationItemsFromPlanMarkdown(planMarkdown: string | null | undefined): string[] {
  if (!planMarkdown?.trim()) return [];

  const lines = planMarkdown.split(/\r?\n/);
  let inSection = false;
  const body: string[] = [];

  for (const line of lines) {
    if (VERIFICATION_HEADING.test(line.trim())) {
      inSection = true;
      continue;
    }
    if (inSection) {
      // Next bold section or top-level heading ends Verification
      if (/^\*\*[^*]+:\*\*\s*$/.test(line.trim()) || /^#{1,3}\s/.test(line.trim())) {
        break;
      }
      if (line.trim().startsWith("```")) {
        break;
      }
      body.push(line);
    }
  }

  return parseVerificationItemsFromText(body.join("\n"));
}

/**
 * Whether a verification string is usable for create/update_plan.
 */
export function isUsableVerification(verification: string | undefined | null): boolean {
  if (!verification?.trim()) return false;
  return parseVerificationItemsFromText(verification).length > 0;
}

/**
 * Gate complete_plan verificationResults against the current plan markdown.
 */
export function gateCompletePlanVerification(
  planMarkdown: string | null | undefined,
  results: VerificationResultItem[] | undefined
): GateCompletePlanResult {
  if (!results || results.length === 0) {
    return { ok: false, error: "complete_plan requires verificationResults (item, passed, evidence)" };
  }

  for (const r of results) {
    if (!r.evidence?.trim()) {
      return { ok: false, error: "Each verificationResult must include non-empty evidence" };
    }
  }

  const expected = parseVerificationItemsFromPlanMarkdown(planMarkdown);

  // Legacy plans with no Verification section: require one passing smoke/N/A result.
  if (expected.length === 0) {
    if (results.length !== 1) {
      return {
        ok: false,
        error:
          "Plan has no Verification checklist — provide exactly one verificationResult describing smoke checks run (N/A path)",
      };
    }
    if (!results[0].passed) {
      return { ok: false, error: "Legacy N/A verificationResult must have passed: true" };
    }
    return { ok: true };
  }

  if (results.some((r) => !r.passed)) {
    return { ok: false, error: "Cannot complete_plan while any verificationResult has passed: false" };
  }

  const resultNorms = new Map(results.map((r) => [normalizeVerificationItem(r.item), r]));

  for (const exp of expected) {
    const key = normalizeVerificationItem(exp);
    if (!resultNorms.has(key)) {
      // Allow match by substring either way for slight wording drift
      const found = [...resultNorms.keys()].some((k) => k.includes(key) || key.includes(k));
      if (!found) {
        return {
          ok: false,
          error: `Missing verificationResult for checklist item: "${exp}"`,
        };
      }
    }
  }

  return { ok: true };
}
