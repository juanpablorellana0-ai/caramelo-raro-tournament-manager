import Link from "next/link";
import OrganizerAvailability from "@/components/organizer-availability";

export default async function TournamentSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ tournamentId?: string }>;
}) {
  const { tournamentId } = await searchParams;

  if (!tournamentId) {
    return (
      <div className="page-stack">
        <section className="page-heading">
          <p className="eyebrow">ORGANIZACIÓN</p>
          <h1>Configurar disponibilidad</h1>
          <p className="lede">Selecciona un torneo para continuar.</p>
        </section>
        <Link className="button button-primary" href="/organizer">
          Ir al organizador
        </Link>
      </div>
    );
  }

  return <OrganizerAvailability tournamentId={tournamentId} />;
}
