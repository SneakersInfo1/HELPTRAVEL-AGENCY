"use client";

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
  booking: {
    id: "booking",
    label: "Booking.com",
    short: "B",
    chipClassName: "bg-[#0a5ad4] text-white",
    textClassName: "text-[#0a5ad4]",
    ringClassName: "ring-[#0a5ad4]/18",
  },
  cheapoair: {
    id: "cheapoair",
    label: "CheapOair",
    short: "C",
    chipClassName: "bg-[#173a8f] text-white",
    textClassName: "text-[#173a8f]",
    ringClassName: "ring-[#173a8f]/18",
  },
  expedia: {
    id: "expedia",
    label: "Expedia",
    short: "E",
    chipClassName: "bg-[#f8c636] text-slate-950",
    textClassName: "text-slate-950",
    ringClassName: "ring-[#f8c636]/30",
  },
  getrentacar: {
    id: "getrentacar",
    label: "GetRentacar",
    short: "G",
    chipClassName: "bg-[#df1b2f] text-white",
    textClassName: "text-[#df1b2f]",
    ringClassName: "ring-[#df1b2f]/18",
  },
  google: {
    id: "google",
    label: "Google",
    short: "G",
    chipClassName: "bg-slate-100 text-slate-700",
    textClassName: "text-slate-700",
    ringClassName: "ring-slate-900/10",
  },
  hotels: {
    id: "hotels",
    label: "Hotels.com",
    short: "H",
    chipClassName: "bg-[#d92b2b] text-white",
    textClassName: "text-[#d92b2b]",
    ringClassName: "ring-[#d92b2b]/20",
  },
  klook: {
    id: "klook",
    label: "Klook",
    short: "K",
    chipClassName: "bg-[#ff5b00] text-white",
    textClassName: "text-[#ff5b00]",
    ringClassName: "ring-[#ff5b00]/18",
  },
  localrent: {
    id: "localrent",
    label: "Localrent",
    short: "L",
    chipClassName: "bg-[#11a46f] text-white",
    textClassName: "text-[#0d6e4b]",
    ringClassName: "ring-[#11a46f]/18",
  },
  tiqets: {
    id: "tiqets",
    label: "Tiqets",
    short: "T",
    chipClassName: "bg-[#20c7c9] text-slate-950",
    textClassName: "text-[#147a7c]",
    ringClassName: "ring-[#20c7c9]/18",
  },
  travelpayouts: {
    id: "travelpayouts",
    label: "Travelpayouts",
    short: "TP",
    chipClassName: "bg-[#1b3df0] text-white",
    textClassName: "text-[#1b3df0]",
    ringClassName: "ring-[#1b3df0]/18",
  },
  vrbo: {
    id: "vrbo",
    label: "Vrbo",
    short: "V",
    chipClassName: "bg-[#0d5c70] text-white",
    textClassName: "text-[#0d5c70]",
    ringClassName: "ring-[#0d5c70]/18",
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

  if (brandId !== "generic") {
    return meta;
  }

  const label = fallbackLabel ?? getAffiliateBrandLabel(brand, "Partner");
  return {
    ...meta,
    label,
    short: label.slice(0, 2).toUpperCase(),
  };
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

export const TRUSTED_PARTNERS = [
  "Hotels.com",
  "Expedia",
  "Vrbo",
  "CheapOair",
  "Klook",
  "Tiqets",
  "Localrent",
] as const;
