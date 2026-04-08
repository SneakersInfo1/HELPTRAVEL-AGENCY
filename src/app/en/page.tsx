import type { Metadata } from "next";

import { getHomeMetadata, HomePageView } from "@/app/page";

export const metadata: Metadata = getHomeMetadata("en");

export default async function EnglishHomePage() {
  return HomePageView({ locale: "en" });
}
