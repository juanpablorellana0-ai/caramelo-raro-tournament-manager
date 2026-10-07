import PublicPollForm from "@/components/public-poll-form";

export function generateMetadata() {
  return {
    title: "Encuesta anónima | Caramelo Raro",
    description: "Indica en qué fechas y horarios puedes participar.",
  };
}

export default async function PublicPollPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return <PublicPollForm token={token} />;
}
