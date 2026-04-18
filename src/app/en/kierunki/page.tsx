import { getDestinationsIndexMetadata, DestinationsIndexPageView } from "@/app/kierunki/page";

export const revalidate = 86400;

export const metadata = getDestinationsIndexMetadata("en");

export default async function EnglishDestinationsIndexPage() {
  return DestinationsIndexPageView({ locale: "en" });
}
