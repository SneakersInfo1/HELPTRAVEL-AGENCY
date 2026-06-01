import Link from "next/link";

export function AffiliateDisclosure({ inline = false }: { inline?: boolean }) {
  if (inline) {
    return (
      <p className="text-[10px] uppercase tracking-[0.18em] text-emerald-700/70">
        Linki partnerskie —{" "}
        <Link href="/linki-partnerskie" className="underline hover:text-emerald-800">
          dowiedz się więcej
        </Link>
      </p>
    );
  }
  return (
    <div className="rounded-2xl border border-emerald-900/10 bg-emerald-50/72 px-4 py-3 text-xs leading-6 text-emerald-900/82">
      <strong className="font-semibold">Linki partnerskie:</strong> niektóre linki na tej stronie to linki afiliacyjne. Klikając
      w nie i dokonując zakupu, możesz wesprzeć HelpTravel — nie płacisz nic więcej, a my dostajemy niewielką prowizję.{" "}
      <Link href="/linki-partnerskie" className="underline">
        Pełna informacja
      </Link>
      .
    </div>
  );
}
