// Wspólne metadane społecznościowe stron treści.
//
// Dwa błędy, które ten moduł zamyka (crawl produkcji 13.11.2026):
//  • strona z własnym `openGraph` traciła obraz z głównego layoutu — 54 strony
//    (huby /wyjazdy, /hotele/w, /porownanie, strony informacyjne) nie miały
//    `og:image` wcale. Next scala metadane PŁYTKO: obiekt `openGraph` dziecka
//    zastępuje obiekt rodzica razem z obrazami;
//  • strony bez własnego `twitter` dziedziczyły tytuł i opis serwisu
//    („HelpTravel — hotele i loty w jednym miejscu") zamiast własnych.
//
// Strona z plikiem `opengraph-image.tsx` w swoim segmencie przekazuje
// `ownImage: true` — obraz dokłada wtedy konwencja plików Nexta.

import type { Metadata } from "next";

import { getSiteUrl } from "@/lib/mvp/site";

/** Obraz domyślny serwisu: app/opengraph-image.tsx. */
export const DEFAULT_OG_IMAGE = { url: "/opengraph-image", width: 1200, height: 630, alt: "HelpTravel — hotele i loty w jednym miejscu" } as const;

export interface SocialMetaInput {
  title: string;
  description: string;
  /** Ścieżka kanoniczna zaczynająca się od „/". */
  path: string;
  type?: "website" | "article";
  /** Segment ma własny plik opengraph-image — nie dokładaj obrazu domyślnego. */
  ownImage?: boolean;
  /** Data materialnej zmiany treści (ISO) — tylko gdy ma źródło prawdy. */
  modifiedTime?: string | null;
}

export function socialMeta(input: SocialMetaInput): Pick<Metadata, "openGraph" | "twitter"> {
  const images = input.ownImage ? undefined : [DEFAULT_OG_IMAGE];
  return {
    openGraph: {
      title: input.title,
      description: input.description,
      url: `${getSiteUrl()}${input.path}`,
      siteName: "HelpTravel",
      locale: "pl_PL",
      type: input.type ?? "website",
      ...(images ? { images } : {}),
      ...(input.type === "article" && input.modifiedTime ? { modifiedTime: input.modifiedTime } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: input.title,
      description: input.description,
      ...(images ? { images: [DEFAULT_OG_IMAGE.url] } : {}),
    },
  };
}
