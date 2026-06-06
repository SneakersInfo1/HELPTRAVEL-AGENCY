import Image from "next/image";
import Link from "next/link";

import { defaultAuthor, type Author } from "@/lib/mvp/authors";

// Visible author byline (E-E-A-T). Pairs with the `Person` JSON-LD node so a
// real, named human is attributed both to readers and to Google. Server
// component — links only.
//
// Note: the global `a { color: inherit }` rule (unlayered, beats Tailwind
// `text-*` utilities) means we must color a <span> INSIDE the link, never the
// <a> itself — otherwise the name renders in the inherited body color.
export function AuthorByline({
  author = defaultAuthor,
  updatedISO,
  className = "",
}: {
  author?: Author;
  updatedISO?: string;
  className?: string;
}) {
  const updated = updatedISO
    ? new Date(updatedISO).toLocaleDateString("pl-PL", { year: "numeric", month: "long", day: "numeric" })
    : null;

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-700 text-sm font-bold text-white">
        {author.image ? (
          <Image
            src={author.image}
            alt={author.name}
            width={40}
            height={40}
            className="h-10 w-10 rounded-full object-cover"
          />
        ) : (
          author.name.charAt(0).toUpperCase()
        )}
      </span>
      <div className="text-xs leading-tight">
        <Link href={author.url} className="font-semibold underline-offset-2 hover:underline">
          <span className="text-emerald-800">{author.name}</span>
        </Link>
        <p className="mt-0.5 text-emerald-900/60">
          {author.role}
          {updated ? ` · Zaktualizowano ${updated}` : ""}
        </p>
      </div>
    </div>
  );
}
