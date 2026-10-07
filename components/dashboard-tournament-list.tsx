"use client";

import Link from "next/link";
import { useState } from "react";
import type { TournamentStatus } from "@/types/tournament";

export type DashboardTournament = {
  id: string;
  title: string;
  weeklyNumber: number | null;
  game: string;
  format: string;
  status: TournamentStatus;
  approvedDate: string | null;
  taskSummary: {
    pendingCount: number;
    hasTasks: boolean;
  } | null;
};

const STATUS_LABELS: Record<TournamentStatus, string> = {
  draft: "Borrador",
  collecting_availability: "Recopilando disponibilidad",
  schedule_approved: "Horario aprobado",
  announced: "Anunciado",
  completed: "Completado",
  cancelled: "Cancelado",
};

function isDeleteSuccess(value: unknown, tournamentId: string) {
  return (
    !!value &&
    typeof value === "object" &&
    "id" in value &&
    value.id === tournamentId &&
    "deleted" in value &&
    value.deleted === true
  );
}

function getErrorMessage(value: unknown) {
  if (
    value &&
    typeof value === "object" &&
    "error" in value &&
    typeof value.error === "string"
  ) {
    return value.error;
  }
  return "No fue posible eliminar el torneo.";
}

export default function DashboardTournamentList({
  tournaments,
}: {
  tournaments: DashboardTournament[];
}) {
  const [visibleTournaments, setVisibleTournaments] = useState(tournaments);
  const [pendingTournament, setPendingTournament] =
    useState<DashboardTournament | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function deleteTournament() {
    if (!pendingTournament) return;

    setDeleting(true);
    setError("");
    try {
      const response = await fetch(
        `/api/tournaments/${pendingTournament.id}/delete`,
        { method: "DELETE" },
      );
      const result: unknown = await response.json();

      if (!response.ok) {
        setError(getErrorMessage(result));
        return;
      }

      if (!isDeleteSuccess(result, pendingTournament.id)) {
        setError("El servidor no confirmó la eliminación del torneo.");
        return;
      }

      setVisibleTournaments((current) =>
        current.filter((tournament) => tournament.id !== pendingTournament.id),
      );
      setPendingTournament(null);
    } catch {
      setError("No fue posible conectar con el servidor.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="dashboard-grid" aria-label="Torneos del organizador">
        {visibleTournaments.map((tournament) => (
          <article className="summary-panel" key={tournament.id}>
            <div className="panel-heading">
              <p className="eyebrow">{STATUS_LABELS[tournament.status]}</p>
              <span className="status-dot" aria-hidden="true" />
            </div>
            <h2>{tournament.title}</h2>
            {tournament.weeklyNumber !== null && (
              <p>Weekly #{tournament.weeklyNumber}</p>
            )}
            <p>
              {[tournament.game, tournament.format].filter(Boolean).join(" · ") ||
                "Formato no disponible"}
            </p>
            {tournament.approvedDate && (
              <p>Horario aprobado: {tournament.approvedDate}</p>
            )}
            <p className="dashboard-task-summary">
              {tournament.taskSummary === null
                ? "Resumen de tareas no disponible"
                : tournament.taskSummary.pendingCount > 0
                  ? `${tournament.taskSummary.pendingCount} tarea${tournament.taskSummary.pendingCount === 1 ? "" : "s"} pendiente${tournament.taskSummary.pendingCount === 1 ? "" : "s"}`
                  : tournament.taskSummary.hasTasks
                    ? "Todas las tareas completadas"
                    : "Sin tareas todavía"}
            </p>
            <div className="dashboard-tournament-actions">
              <Link
                className="button button-secondary"
                href={`/organizer/tournament?tournamentId=${tournament.id}`}
              >
                Abrir torneo
              </Link>
              {(tournament.status === "draft" ||
                tournament.status === "collecting_availability") && (
                <button
                  type="button"
                  className="button button-danger"
                  onClick={() => {
                    setError("");
                    setPendingTournament(tournament);
                  }}
                >
                  Eliminar
                </button>
              )}
            </div>
          </article>
        ))}
      </div>

      {visibleTournaments.length === 0 && (
        <section className="quiet-strip" aria-live="polite">
          <span>Ya no quedan torneos en el panel.</span>
        </section>
      )}

      {pendingTournament && (
        <div className="delete-dialog-backdrop">
          <section
            className="delete-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-tournament-title"
            aria-describedby="delete-tournament-description"
          >
            <p className="eyebrow">ELIMINACIÓN PERMANENTE</p>
            <h2 id="delete-tournament-title">
              ¿Eliminar “{pendingTournament.title}”?
            </h2>
            <p id="delete-tournament-description">
              Se eliminarán permanentemente el torneo y sus datos asociados,
              incluyendo la encuesta, respuestas, disponibilidad, drafts,
              tareas asociadas y eventos del torneo.
            </p>
            <p className="delete-dialog-warning">
              Esta acción no se puede deshacer.
            </p>
            {error && (
              <p className="poll-error" role="alert">
                {error}
              </p>
            )}
            <div className="dashboard-tournament-actions">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => {
                  setPendingTournament(null);
                  setError("");
                }}
                disabled={deleting}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="button button-danger"
                onClick={deleteTournament}
                disabled={deleting}
              >
                {deleting ? "Eliminando…" : "Eliminar torneo"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
