import { z } from "zod";

import type { DestinationProfile, DiscoveryPreferences } from "./types";

const AiPreferencesSchema = z.object({
  budgetMaxPln: z.number().min(600).max(20000).optional(),
  durationMinDays: z.number().min(2).max(14).optional(),
  durationMaxDays: z.number().min(2).max(14).optional(),
  travelers: z.number().min(1).max(8).optional(),
  temperaturePreference: z.enum(["any", "warm", "hot"]).optional(),
  visaPreference: z.enum(["any", "visa_free"]).optional(),
  maxTransfers: z.number().min(0).max(3).optional(),
  mustTags: z.array(z.string()).max(10).optional(),
  niceTags: z.array(z.string()).max(10).optional(),
});

const AiItinerarySchema = z.object({
  summary: z.string().min(20).max(600),
  plan: z
    .array(
      z.object({
        day: z.number().int().min(1).max(10),
        title: z.string().min(2).max(120),
        description: z.string().min(10).max(300),
      }),
    )
    .min(2)
    .max(7),
});

type AiPrefsPatch = z.infer<typeof AiPreferencesSchema>;

interface OpenAiChatResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
}

async function openAiChat(prompt: string): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }

  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: "You are a travel planner assistant. Always return only valid JSON without markdown.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed: ${response.status}`);
  }

  const data = (await response.json()) as OpenAiChatResponse;
  return data.choices?.[0]?.message?.content ?? null;
}

export async function refinePreferencesWithAI(
  rawQuery: string,
  parsed: DiscoveryPreferences,
): Promise<DiscoveryPreferences> {
  if (!process.env.OPENAI_API_KEY || parsed.confidence >= 0.72) {
    return parsed;
  }

  try {
    const prompt = [
      "Extract structured travel preference patch from user input.",
      "Return JSON object only with keys that are clearly inferable.",
      "Allowed keys: budgetMaxPln, durationMinDays, durationMaxDays, travelers, temperaturePreference, visaPreference, maxTransfers, mustTags, niceTags.",
      `Input query: ${rawQuery}`,
      `Current parsed object: ${JSON.stringify(parsed)}`,
    ].join("\n");

    const content = await openAiChat(prompt);
    if (!content) return parsed;

    const jsonPatch = AiPreferencesSchema.parse(JSON.parse(content)) as AiPrefsPatch;

    return {
      ...parsed,
      budgetMaxPln: jsonPatch.budgetMaxPln ?? parsed.budgetMaxPln,
      durationMinDays: jsonPatch.durationMinDays ?? parsed.durationMinDays,
      durationMaxDays: jsonPatch.durationMaxDays ?? parsed.durationMaxDays,
      travelers: jsonPatch.travelers ?? parsed.travelers,
      temperaturePreference: jsonPatch.temperaturePreference ?? parsed.temperaturePreference,
      visaPreference: jsonPatch.visaPreference ?? parsed.visaPreference,
      maxTransfers: jsonPatch.maxTransfers ?? parsed.maxTransfers,
      mustTags: jsonPatch.mustTags ?? parsed.mustTags,
      niceTags: jsonPatch.niceTags ?? parsed.niceTags,
      confidence: Math.min(0.95, parsed.confidence + 0.12),
    };
  } catch {
    return parsed;
  }
}

export function fallbackSummary(
  destination: DestinationProfile,
  reasons: string[],
  tradeoffs: string[],
): string {
  const coreReasons = reasons.length > 0 ? reasons.join(" ") : "Dobrze laczy koszt, atrakcje i wygodny dojazd.";
  const tradeoffNote = tradeoffs[0] ? ` Uwaga: ${tradeoffs[0]}` : "";
  return `${destination.city} to mocna opcja na city break. ${coreReasons}${tradeoffNote}`;
}

export function fallbackPlan(
  destination: DestinationProfile,
  days: number,
  estimatedBudgetMin: number,
): Array<{ day: number; title: string; description: string; estimatedDailyCost: number }> {
  const itineraryDays = Math.min(5, Math.max(2, days));
  const daily = Math.max(180, Math.round(estimatedBudgetMin / itineraryDays));

  const templates = [
    {
      title: "Przylot i pierwszy spacer",
      description: `Przylot do ${destination.city}, check-in, wieczorny spacer i lokalna kolacja w centrum.`,
    },
    {
      title: "Glowny dzien zwiedzania",
      description: "Najwazniejsze atrakcje, punkt widokowy i wieczor w dzielnicy z klimatem.",
    },
    {
      title: "Dzien lokalny",
      description: "Mniej oczywiste miejsca, kawa, street food i spokojne tempo z czasem na odpoczynek.",
    },
    {
      title: "Wycieczka tematyczna",
      description: "Opcjonalny wypad poza centrum lub plaza i aktywnosci dopasowane do stylu wyjazdu.",
    },
    {
      title: "Final i powrot",
      description: "Lekki poranek, ostatnie zakupy i transfer na lotnisko.",
    },
  ];

  return Array.from({ length: itineraryDays }).map((_, index) => ({
    day: index + 1,
    title: templates[index].title,
    description: templates[index].description,
    estimatedDailyCost: daily,
  }));
}

export async function generateSummaryAndPlan(input: {
  rawQuery: string;
  preferences: DiscoveryPreferences;
  destination: DestinationProfile;
  reasons: string[];
  tradeoffs: string[];
  estimatedBudgetMin: number;
  estimatedBudgetMax: number;
}): Promise<{
  summary: string;
  plan: Array<{ day: number; title: string; description: string; estimatedDailyCost: number }>;
}> {
  const days = Math.max(2, Math.round((input.preferences.durationMinDays + input.preferences.durationMaxDays) / 2));
  const fallback = {
    summary: fallbackSummary(input.destination, input.reasons, input.tradeoffs),
    plan: fallbackPlan(input.destination, days, input.estimatedBudgetMin),
  };

  if (!process.env.OPENAI_API_KEY) {
    return fallback;
  }

  try {
    const prompt = [
      "You are generating output for an AI Travel Planner MVP.",
      "Return JSON with keys: summary (string), plan (array of day,title,description).",
      "No markdown. No prices invented beyond rough range.",
      `User query: ${input.rawQuery}`,
      `Destination: ${input.destination.city}, ${input.destination.country}`,
      `Reasons: ${input.reasons.join("; ")}`,
      `Tradeoffs: ${input.tradeoffs.join("; ")}`,
      `Budget range PLN: ${input.estimatedBudgetMin}-${input.estimatedBudgetMax}`,
      `Trip length target days: ${days}`,
    ].join("\n");

    const content = await openAiChat(prompt);
    if (!content) return fallback;

    const parsed = AiItinerarySchema.parse(JSON.parse(content));
    const safePlan = parsed.plan
      .slice(0, Math.min(5, days))
      .map((item, index) => ({
        day: index + 1,
        title: item.title,
        description: item.description,
        estimatedDailyCost: Math.max(160, Math.round(input.estimatedBudgetMin / Math.max(2, days))),
      }));

    return {
      summary: parsed.summary,
      plan: safePlan,
    };
  } catch {
    return fallback;
  }
}

