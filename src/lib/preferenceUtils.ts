import type {
  ConditionalPreference,
  DomainManualUserPreferences,
  PendingPromotion,
  SessionPreference,
  UserPreference,
} from "@/lib/types";

export function emptyUserPreferences(): DomainManualUserPreferences {
  return { global: [], conditional: [], pending_promotions: [] };
}

export function readUserPreferences(
  domainManual: Record<string, unknown>,
): DomainManualUserPreferences {
  const up = domainManual.user_preferences;
  if (!up || typeof up !== "object" || Array.isArray(up)) {
    return emptyUserPreferences();
  }
  const o = up as Record<string, unknown>;
  return {
    global: Array.isArray(o.global) ? (o.global as UserPreference[]) : [],
    conditional: Array.isArray(o.conditional) ? (o.conditional as ConditionalPreference[]) : [],
    pending_promotions: Array.isArray(o.pending_promotions) ? (o.pending_promotions as PendingPromotion[]) : [],
  };
}

export function generatePreferenceId(): string {
  return `pref_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function buildPreferencesSummary(
  prefs: DomainManualUserPreferences,
  sessionPrefs: SessionPreference[],
  _objectiveHint: string,
): string {
  const lines: string[] = [];

  if (prefs.global.length) {
    lines.push("Global preferences (always apply):");
    for (const p of prefs.global) {
      lines.push(`  - ${p.rule}`);
    }
  }

  if (prefs.conditional.length) {
    lines.push("Conditional preferences (apply when condition matches):");
    for (const p of prefs.conditional) {
      lines.push(`  - When "${p.condition}": ${p.rule}`);
    }
  }

  if (sessionPrefs.length) {
    lines.push("Session preferences (this conversation only):");
    for (const p of sessionPrefs) {
      lines.push(`  - ${p.rule}`);
    }
  }

  return lines.length > 0 ? lines.join("\n") : "(No user preferences set.)";
}
