import Link from "next/link";

export function AffiliateDisclosure({ inline = false }: { inline?: boolean }) {
  if (inline) {
    return (
      <p className="text-[10px] uppercase tracking-[0.18em] text-emerald-700/70">
        Linki partnerskie —{" "}
        <Link href="/linki-partnerskie" className="underline hover:text-emerald-800">
          dowiedz sie wiecej
        </Link>
      </p>
    );
  }
  return (
    <div className="rounded-2xl border border-emerald-900/10 bg-emerald-50/72 px-4 py-3 text-xs leading-6 text-emerald-900/82">
      <strong className="font-semibold">Linki partnerskie:</strong> niektore linki na tej stronie to linki afiliacyjne. Klikajac
      w nie i dokonujac zakupu, mozesz wesprzec HelpTravel — nie placisz nic wiecej, a my dostajemy niewielka prowizje.{" "}
      <Link href="/linki-partnerskie" className="underline">
        Pelna informacja
      </Link>
      .
    </div>
  );
}
