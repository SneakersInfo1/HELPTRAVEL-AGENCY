import { permanentRedirect } from "next/navigation";

interface LegacyInspirationPageProps {
  params: Promise<{ slug: string }>;
}

export default async function LegacyInspirationPage({ params }: LegacyInspirationPageProps) {
  const { slug } = await params;
  permanentRedirect(`/inspiracje/${slug}`);
}
