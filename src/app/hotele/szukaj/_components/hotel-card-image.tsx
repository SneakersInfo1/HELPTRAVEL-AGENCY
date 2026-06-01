"use client";

// Hotel thumbnail with a graceful fallback. LiteAPI/Cupid image URLs sometimes
// 404 / expire, and a bare <Image> then renders the browser's broken-image box
// with the alt text on top (the "always show a picture" bug, 2026-06). This
// component swaps to a branded gradient placeholder the moment the image fails
// (onError) OR when no URL was provided — so a result card NEVER shows a broken
// image. Client component because onError state needs a hook.

import Image from "next/image";
import { useState } from "react";

import { localizeCountry } from "@/lib/mvp/i18n-geo";

export function HotelCardImage({
  thumbnailUrl,
  name,
  city,
  country,
  priority = false,
}: {
  thumbnailUrl?: string;
  name: string;
  city: string;
  country?: string;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(thumbnailUrl) && !failed;

  if (showImage) {
    return (
      <Image
        src={thumbnailUrl as string}
        alt={name}
        fill
        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
        priority={priority}
        fetchPriority={priority ? "high" : undefined}
        loading={priority ? undefined : "lazy"}
        onError={() => setFailed(true)}
        className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
      />
    );
  }

  // Branded fallback — never a broken-image icon.
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-emerald-600 via-emerald-700 to-emerald-900 p-4 text-center text-white">
      <span aria-hidden className="text-2xl opacity-90">🏨</span>
      <span className="line-clamp-2 text-sm font-semibold leading-tight">{name}</span>
      <span className="text-[11px] font-medium text-emerald-100/80">
        {city}
        {country ? `, ${localizeCountry(country)}` : ""}
      </span>
    </div>
  );
}
