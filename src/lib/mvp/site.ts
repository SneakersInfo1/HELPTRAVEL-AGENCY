export function getSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.VERCEL_URL?.trim();
  if (configured) {
    return configured.startsWith("http://") || configured.startsWith("https://")
      ? configured
      : `https://${configured}`;
  }

  return process.env.NODE_ENV === "development" ? "http://localhost:3000" : "https://example.com";
}
