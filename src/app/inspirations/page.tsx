import { permanentRedirect } from "next/navigation";

export default function LegacyInspirationsIndexPage() {
  permanentRedirect("/inspiracje");
}
