// Canonical absolute URL for the site. Used for:
//   • Stripe / LiteAPI Payment widget `returnUrl` (CRITICAL — see below)
//   • OpenGraph / canonical SEO tags
//   • RSS / sitemap feeds
//
// CRITICAL — `VERCEL_URL` IS NOT SAFE AS A DEFAULT.
//
// `VERCEL_URL` is the **per-deployment** `*.vercel.app` host (changes on
// every push). If we use it as the booking widget's `returnUrl`, Stripe
// will redirect the paying user away from `helptravel.pl` to a
// per-deploy vercel.app URL that:
//   (a) may already have been replaced by a newer deployment,
//   (b) puts the user on a different cookie domain than they started on,
//   (c) generally 404s once that specific deployment is no longer the
//       currently-routed instance.
// We hit exactly this trap during real-card validation (2026-05-21):
// card charged at Stripe, browser redirected to a per-deploy URL that
// 404'd, `/api/booking/book` never ran, LiteAPI never received the book
// call, user saw "Tej strony już tu nie ma" while their card was debited.
//
// Resolution order (most → least specific):
//   1. `NEXT_PUBLIC_SITE_URL` — explicit operator override, always wins.
//   2. `VERCEL_PROJECT_PRODUCTION_URL` (only when `VERCEL_ENV=production`) —
//      Vercel's "always the shortest production custom domain" value,
//      e.g. `helptravel.pl`. Stable across deployments.
//   3. `VERCEL_BRANCH_URL` — stable per-branch URL (preview deploys), does
//      not rotate per-deploy. Better than `VERCEL_URL` for redirect targets.
//   4. `VERCEL_URL` — per-deploy fallback (still better than nothing on
//      preview if no branch URL is set).
//   5. Dev / fallback.

function withHttps(url: string): string {
  return url.startsWith("http://") || url.startsWith("https://")
    ? url
    : `https://${url}`;
}

export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return withHttps(explicit);

  if (process.env.VERCEL_ENV === "production") {
    const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
    if (prod) return withHttps(prod);
  }

  const branch = process.env.VERCEL_BRANCH_URL?.trim();
  if (branch) return withHttps(branch);

  const deploy = process.env.VERCEL_URL?.trim();
  if (deploy) return withHttps(deploy);

  return process.env.NODE_ENV === "development"
    ? "http://localhost:3000"
    : "https://example.com";
}
