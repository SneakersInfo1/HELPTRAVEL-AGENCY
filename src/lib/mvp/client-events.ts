"use client";

export type UiEventType =
  | "planner_restored"
  | "saved_plan_clicked"
  | "destination_saved"
  | "comparison_selected"
  | "search_saved"
  | "hero_cta_clicked"
  | "planner_mode_selected"
  | "planner_submitted"
  | "destination_card_clicked"
  | "content_card_clicked"
  | "contact_submit";

export function sendClientEvent(eventType: UiEventType, payload: Record<string, unknown> = {}) {
  void fetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventType, payload }),
    keepalive: true,
  }).catch(() => undefined);
}
