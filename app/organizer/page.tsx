import Link from "next/link";

export default function OrganizerPage() {
  return (
    <div className="page-stack">
      <section className="page-heading">
        <p className="eyebrow">ORGANIZACIÓN</p>

        <h1>Prepara tu próximo torneo</h1>

        <p className="lede">
          Define los datos esenciales. El sistema propondrá automáticamente el
          próximo sábado, domingo y sus horarios.
        </p>
      </section>

      <section className="empty-state">
        <span className="empty-mark" aria-hidden="true">
          +
        </span>

        <h2>Comienza con lo esencial</h2>

        <p>
          Después de crear el torneo, prepararemos la encuesta de disponibilidad
          sin que tengas que calcular fechas ni escribir horarios.
        </p>

        <Link className="button button-primary" href="/organizer/new">
          Crear torneo <span aria-hidden="true">→</span>
        </Link>
      </section>
    </div>
  );
}