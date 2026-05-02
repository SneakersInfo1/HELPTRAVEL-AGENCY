"use client";

// Phase 1: TRUSTED_PARTNERS reduced to Aviasales only (flights). Hotels are
// served internally via LiteAPI (no third-party brand surfaced).
// All other partner brand metadata removed per master spec section 2.

import { getAffiliateBrandId, getAffiliateBrandLabel, type AffiliateBrandId } from "@/lib/mvp/affiliate-brand";

type LogoSize = "sm" | "md" | "lg";
type LogoVariant = "brand" | "contrast" | "neutral";

type BrandMeta = {
  id: AffiliateBrandId;
  label: string;
  short: string;
  chipClassName: string;
  textClassName: string;
  ringClassName: string;
};

const BRAND_META: Record<AffiliateBrandId, BrandMeta> = {
  aviasales: {
    id: "aviasales",
    label: "Aviasales",
    short: "A",
    chipClassName: "bg-[#0d6efd] text-white",
    textClassName: "text-[#0d6efd]",
    ringClassName: "ring-[#0d6efd]/18",
  },
  helptravel: {
    id: "helptravel",
    label: "HelpTravel",
    short: "HT",
    chipClassName: "bg-emerald-700 text-white",
    textClassName: "text-emerald-800",
    ringClassName: "ring-emerald-700/18",
  },
  generic: {
    id: "generic",
    label: "Partner",
    short: "P",
    chipClassName: "bg-emerald-100 text-emerald-950",
    textClassName: "text-emerald-950",
    ringClassName: "ring-emerald-900/10",
  },
};

const SIZE_CLASS_NAME: Record<LogoSize, string> = {
  sm: "h-6 min-w-6 px-2 text-[10px]",
  md: "h-8 min-w-8 px-2.5 text-[11px]",
  lg: "h-10 min-w-10 px-3 text-xs",
};

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function getBrandMeta(brand?: string, fallbackLabel?: string): BrandMeta {
  const brandId = getAffiliateBrandId(brand);
  const meta = BRAND_META[brandId];
  if (brandId !== "generic") return meta;
  const label = fallbackLabel ?? getAffiliateBrandLabel(brand, "Partner");
  return { ...meta, label, short: label.slice(0, 2).toUpperCase() };
}

export function PartnerLogoMark(props: {
  brand?: string;
  fallbackLabel?: string;
  size?: LogoSize;
  variant?: LogoVariant;
  className?: string;
}) {
  const { brand, fallbackLabel, size = "sm", variant = "brand", className } = props;
  const meta = getBrandMeta(brand, fallbackLabel);
  const variantClassName =
    variant === "contrast"
      ? "bg-white/16 text-white"
      : variant === "neutral"
        ? "bg-emerald-950/8 text-current"
        : meta.chipClassName;
  return (
    <span
      aria-hidden="true"
      className={cx(
        "inline-flex items-center justify-center rounded-full font-black tracking-[0.08em]",
        SIZE_CLASS_NAME[size],
        variantClassName,
        className,
      )}
    >
      {meta.short}
    </span>
  );
}

export function PartnerLogoWordmark(props: {
  brand?: string;
  fallbackLabel?: string;
  size?: LogoSize;
  className?: string;
}) {
  const { brand, fallbackLabel, size = "md", className } = props;
  const meta = getBrandMeta(brand, fallbackLabel);
  return (
    <span
      className={cx(
        "inline-flex items-center gap-2 rounded-full bg-white/92 px-3 py-2 shadow-sm ring-1",
        meta.ringClassName,
        className,
      )}
    >
      <PartnerLogoMark brand={meta.id} fallbackLabel={meta.label} size={size} />
      <span className={cx("text-sm font-semibold", meta.textClassName)}>{meta.label}</span>
    </span>
  );
}

// Aviasales is the only outbound affiliate brand we surface in the footer
// "Partnerzy rezerwacyjni". Hotels run internally via LiteAPI.
export const TRUSTED_PARTNERS = ["Aviasales"] as const;
