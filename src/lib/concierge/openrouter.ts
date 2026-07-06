// Server-only HTTP client for OpenRouter Chat Completions API. Do not import from client components.

// Hard cost/abuse safeguards
export const MAX_TOOL_ROUNDS = 4;
export const MAX_HISTORY_MESSAGES = 20;
export const MAX_INPUT_CHARS = 1500;
export const MAX_TOKENS = 700;

interface ChatCompletionArgs {
  messages: Record<string, unknown>[];
  tools: Record<string, unknown>[];
  stream?: boolean;
}

export async function chatCompletion({
  messages,
  tools,
  stream = false,
}: ChatCompletionArgs): Promise<unknown | ReadableStream<unknown>> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY not configured");
  }

  const model = process.env.OPENROUTER_MODEL ?? "google/gemini-2.5-flash-lite";

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const body: Record<string, unknown> = {
      model,
      messages,
      temperature: 0.3,
      max_tokens: MAX_TOKENS,
      stream,
    };

    // Include tools only if the array is not empty
    if (tools.length > 0) {
      body.tools = tools;
      body.tool_choice = "auto";
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "HTTP-Referer": "https://helptravel.pl",
        "X-Title": "HelpTravel",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (stream && response.body) {
      return response.body;
    }

    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}
