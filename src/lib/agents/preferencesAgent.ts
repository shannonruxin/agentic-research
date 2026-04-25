import { generateObject } from "ai";
import { z } from "zod";
import { createBedrockLanguageModel } from "@/lib/bedrockModel";
import { readWorkspaceText, writeWorkspaceText } from "@/lib/workspaceNode";
import {
  readUserPreferences,
  generatePreferenceId,
  buildPreferencesSummary,
} from "@/lib/preferenceUtils";
import type {
  ConditionalPreference,
  DomainManualUserPreferences,
  PendingPromotion,
  PreferencesAgentOutput,
  SessionPreference,
  UserPreference,
} from "@/lib/types";

const preferencesAgentSchema = z.object({
  scope: z.enum(["session", "conditional_global", "global"]),
  notification: z
    .string()
    .min(1)
    .describe('Format: "When [condition]: focus on [what] because [reasoning]"'),
  rule: z.string().min(1).describe("The preference rule to store"),
  condition: z
    .string()
    .optional()
    .describe("Required when scope is conditional_global"),
  pattern_for_promotion: z
    .string()
    .optional()
    .describe("When scope is session, a pattern to track for promotion to global"),
});

const PREFERENCES_SYSTEM = `You analyze user messages for preference signals about how research should be conducted, and classify them into scopes.

You receive:
- user_message: the user's latest message.
- conversation_context: summary of the conversation so far.
- current_preferences: existing user_preferences from the domain manual.
- objective_context: what kind of research is being done.

Classify into one of three scopes:
1. "session" — applies only to this conversation. DEFAULT assumption. Use when:
   - Preference is clearly about this specific query ("for this analysis, focus on...")
   - No permanence signal ("always", "from now on", "in general")
   - First time seeing this preference pattern

2. "conditional_global" — persisted, applies when a condition matches. Use when:
   - Clear permanence signal AND the preference is context-dependent
   - Example: "when analyzing SaaS companies, always include NRR" -> condition: "target is SaaS"

3. "global" — persisted, always applies. Use when:
   - Clear permanence signal AND the preference is universal
   - Example: "never use Wikipedia as a source"

Rules:
- Default to "session" when uncertain — conservative is safer.
- notification format:
  Global: "Always: [what changes] because [reasoning]"
  Conditional: "When [condition]: [what changes] because [reasoning]"
  Session: "For this session: [what changes] because [reasoning]"
- rule: the actual preference rule to store (concise, actionable)
- condition: only for conditional_global
- pattern_for_promotion: for session prefs, describe the pattern so it can be tracked across conversations`;

export async function runPreferencesAgent(input: {
  user_message: string;
  conversation_context: string;
  current_preferences: DomainManualUserPreferences;
  objective_context: string;
}): Promise<PreferencesAgentOutput> {
  const model = createBedrockLanguageModel();

  const prompt = [
    `user_message: "${input.user_message}"`,
    "",
    `objective_context: ${input.objective_context}`,
    "",
    `current_preferences:\n${JSON.stringify(input.current_preferences, null, 2)}`,
    "",
    input.conversation_context.trim()
      ? `conversation_context:\n${input.conversation_context}`
      : "conversation_context: (first message)",
  ].join("\n");

  const { object } = await generateObject({
    model,
    schema: preferencesAgentSchema,
    schemaName: "PreferencesAgent",
    system: PREFERENCES_SYSTEM,
    prompt,
    maxRetries: 1,
    temperature: 0.1,
    maxOutputTokens: 1024,
  });

  const now = new Date().toISOString().slice(0, 10);
  const id = generatePreferenceId();

  const output: PreferencesAgentOutput = {
    scope: object.scope,
    notification: object.notification.trim(),
  };

  if (object.scope === "global") {
    const pref: UserPreference = {
      id,
      rule: object.rule.trim(),
      source: "explicit statement",
      added: now,
      context_when_stated: input.objective_context.slice(0, 200),
    };
    output.domain_manual_patch = { add_global: [pref] };
  } else if (object.scope === "conditional_global") {
    const pref: ConditionalPreference = {
      id,
      rule: object.rule.trim(),
      condition: object.condition?.trim() ?? "unknown condition",
      source: "explicit statement",
      added: now,
      context_when_stated: input.objective_context.slice(0, 200),
    };
    output.domain_manual_patch = { add_conditional: [pref] };
  } else {
    output.session_preference = {
      rule: object.rule.trim(),
      source: "session preference",
      added: now,
    };
    if (object.pattern_for_promotion?.trim()) {
      const pp: PendingPromotion = {
        pattern: object.pattern_for_promotion.trim(),
        occurrences: [{ date: now, context: input.objective_context.slice(0, 200) }],
        times_seen: 1,
        promote_threshold: 3,
        candidate_rule: object.rule.trim(),
        candidate_scope: "global",
      };
      output.domain_manual_patch = { add_pending_promotion: [pp] };
    }
  }

  return output;
}

export function checkPendingPromotions(prefs: DomainManualUserPreferences): {
  promoted: UserPreference[];
  updatedPending: PendingPromotion[];
} {
  const promoted: UserPreference[] = [];
  const remaining: PendingPromotion[] = [];

  for (const pp of prefs.pending_promotions) {
    if (pp.times_seen >= pp.promote_threshold) {
      promoted.push({
        id: generatePreferenceId(),
        rule: pp.candidate_rule,
        source: `promoted from pattern (seen ${pp.times_seen} times)`,
        added: new Date().toISOString().slice(0, 10),
        context_when_stated: pp.occurrences.map((o) => `${o.date}: ${o.context}`).join("; "),
      });
    } else {
      remaining.push(pp);
    }
  }

  return { promoted, updatedPending: remaining };
}

export async function applyPreferencePatch(
  output: PreferencesAgentOutput,
  domainManualPath: string,
): Promise<void> {
  const raw = await readWorkspaceText(domainManualPath);
  let manual: Record<string, unknown>;
  try {
    manual = raw.trim() ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    manual = {};
  }

  const prefs = readUserPreferences(manual);

  if (output.scope === "session") {
    if (output.domain_manual_patch?.add_pending_promotion) {
      for (const pp of output.domain_manual_patch.add_pending_promotion) {
        const existing = prefs.pending_promotions.find((p) => p.pattern === pp.pattern);
        if (existing) {
          existing.times_seen += 1;
          existing.occurrences.push(...pp.occurrences);
        } else {
          prefs.pending_promotions.push(pp);
        }
      }
      const { promoted, updatedPending } = checkPendingPromotions(prefs);
      prefs.pending_promotions = updatedPending;
      for (const p of promoted) {
        prefs.global.push(p);
      }
      manual.user_preferences = prefs;
      await writeWorkspaceText(domainManualPath, JSON.stringify(manual, null, 2) + "\n");
    }
    return;
  }

  if (output.scope === "global" && output.domain_manual_patch?.add_global) {
    prefs.global.push(...output.domain_manual_patch.add_global);
  }

  if (output.scope === "conditional_global" && output.domain_manual_patch?.add_conditional) {
    prefs.conditional.push(...output.domain_manual_patch.add_conditional);
  }

  manual.user_preferences = prefs;
  await writeWorkspaceText(domainManualPath, JSON.stringify(manual, null, 2) + "\n");
}

export function extractApplicablePreferences(
  prefs: DomainManualUserPreferences,
  objectiveContext: string,
  sessionPrefs: SessionPreference[],
): string {
  return buildPreferencesSummary(prefs, sessionPrefs, objectiveContext);
}
