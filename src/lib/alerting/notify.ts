// Lightweight critical-event alerter — Slack / Discord webhook.
//
// Why not Sentry: at our scale Sentry's value is dwarfed by its setup cost
// (~30KB client bundle, separate dashboard, Turbopack-Next 16 support is
// still experimental). For pre-launch and early-traffic we just need to
// know IMMEDIATELY when something [CRITICAL] happens — payment-without-
// booking, webhook auth failures, Redis outages.
//
// Routing strategy:
//   1. Always console.error  — Vercel logs ingest these and you can search
//      them in the dashboard.
//   2. If ALERT_WEBHOOK_URL is set (Slack incoming webhook or Discord
//      webhook), POST a compact JSON payload to it. We auto-detect the
//      provider by URL pattern and format accordingly.
//   3. Best-effort: a webhook failure does NOT throw, does NOT block the
//      caller. The original log line is the source of truth.
//
// Setup:
//   • Slack: workspace settings → Apps → Incoming Webhooks → Add new →
//     pick channel → copy URL → set ALERT_WEBHOOK_URL on Vercel.
//   • Discord: server settings → Integrations → Webhooks → New → copy URL
//     → set ALERT_WEBHOOK_URL on Vercel.
//
// Usage:
//   await notifyCritical({
//     title: "Booking failed after payment",
//     fields: { sessionId, prebookId, paymentIntentId },
//     level: "critical",
//   });

export type AlertLevel = "info" | "warning" | "critical";

export interface AlertInput {
  /** Short title — becomes Slack message header. */
  title: string;
  /** Optional longer body — appears under the title. */
  body?: string;
  /** Key/value detail rows. Stringified at the boundary. */
  fields?: Record<string, string | number | boolean | undefined | null>;
  level?: AlertLevel;
  /** Source identifier for filtering — e.g. "booking", "webhook". */
  source?: string;
}

const ENV_WEBHOOK = "ALERT_WEBHOOK_URL";
// 3s — alerter is best-effort; never block the request path for long.
const WEBHOOK_TIMEOUT_MS = 3000;

function fmtFields(fields: AlertInput["fields"]): string {
  if (!fields) return "";
  return Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `• *${k}*: \`${String(v)}\``)
    .join("\n");
}

function detectProvider(url: string): "slack" | "discord" | "generic" {
  const u = url.toLowerCase();
  if (u.includes("hooks.slack.com")) return "slack";
  if (u.includes("discord.com/api/webhooks") || u.includes("discordapp.com/api/webhooks")) return "discord";
  return "generic";
}

function levelEmoji(level: AlertLevel): string {
  return level === "critical" ? "🚨" : level === "warning" ? "⚠️" : "ℹ️";
}

function levelDiscordColor(level: AlertLevel): number {
  // Discord embed color (decimal). Red / amber / blue.
  return level === "critical" ? 15548997 : level === "warning" ? 15844367 : 3447003;
}

function buildSlackPayload(input: AlertInput, env: string): object {
  const level = input.level ?? "info";
  const emoji = levelEmoji(level);
  const fieldsText = fmtFields(input.fields);
  return {
    text: `${emoji} *${input.title}*${input.source ? ` _(${input.source})_` : ""} _[${env}]_`,
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: `${emoji} *${input.title}*${input.source ? ` _(${input.source})_` : ""}` },
      },
      ...(input.body
        ? [{ type: "section", text: { type: "mrkdwn", text: input.body } }]
        : []),
      ...(fieldsText
        ? [{ type: "section", text: { type: "mrkdwn", text: fieldsText } }]
        : []),
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: `env: \`${env}\` · level: \`${level}\` · ${new Date().toISOString()}` }],
      },
    ],
  };
}

function buildDiscordPayload(input: AlertInput, env: string): object {
  const level = input.level ?? "info";
  const fieldsText = fmtFields(input.fields);
  return {
    embeds: [
      {
        title: `${levelEmoji(level)} ${input.title}`,
        description: [input.body, fieldsText].filter(Boolean).join("\n\n") || undefined,
        color: levelDiscordColor(level),
        footer: { text: `env: ${env} · level: ${level}` },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

function buildGenericPayload(input: AlertInput, env: string): object {
  return {
    title: input.title,
    body: input.body,
    fields: input.fields ?? {},
    level: input.level ?? "info",
    source: input.source,
    env,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Fire-and-forget critical alert. Logs to console always, and posts to the
 * configured webhook if one is set. Never throws.
 */
export async function notify(input: AlertInput): Promise<void> {
  const level = input.level ?? "info";
  const env = process.env.VERCEL_ENV || process.env.NODE_ENV || "unknown";

  // Console log — always.
  const fieldsLine = fmtFields(input.fields).replace(/\n/g, " ");
  const logFn =
    level === "critical" ? console.error : level === "warning" ? console.warn : console.log;
  logFn(
    `[alert][${level}]${input.source ? `[${input.source}]` : ""} ${input.title}${input.body ? ` — ${input.body}` : ""}${fieldsLine ? ` ${fieldsLine}` : ""}`,
  );

  const webhookUrl = process.env[ENV_WEBHOOK]?.trim();
  if (!webhookUrl) return;

  const provider = detectProvider(webhookUrl);
  const payload =
    provider === "slack"
      ? buildSlackPayload(input, env)
      : provider === "discord"
        ? buildDiscordPayload(input, env)
        : buildGenericPayload(input, env);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

  try {
    const resp = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!resp.ok) {
      console.warn(
        `[alert] webhook returned ${resp.status} — payload dropped (provider=${provider})`,
      );
    }
  } catch (err) {
    // Best-effort; the console.log above is the source of truth.
    console.warn(
      `[alert] webhook POST failed: ${err instanceof Error ? err.message : String(err)} (provider=${provider})`,
    );
  } finally {
    clearTimeout(timeout);
  }
}

/** Convenience: critical-level shortcut. */
export function notifyCritical(input: Omit<AlertInput, "level">): Promise<void> {
  return notify({ ...input, level: "critical" });
}

/** Convenience: warning-level shortcut. */
export function notifyWarning(input: Omit<AlertInput, "level">): Promise<void> {
  return notify({ ...input, level: "warning" });
}
