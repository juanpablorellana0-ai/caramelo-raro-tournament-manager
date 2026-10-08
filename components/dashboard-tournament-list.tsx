"use client";

import Link from "next/link";
import { useState } from "react";
import { updateCandyEdge } from "@/components/candy-edge";
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

const STATUS_LABELS: Record<TournamentStatus, { label: string; icon: string }> = {
  draft: { label: "Borrador", icon: "○" },
  collecting_availability: { label: "Recopilando disponibilidad", icon: "◌" },
  schedule_approved: { label: "Horario aprobado", icon: "✓" },
  announced: { label: "Anunciado", icon: "◉" },
  completed: { label: "Completado", icon: "■" },
  cancelled: { label: "Cancelado", icon: "×" },
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
      <div
        className="dashboard-grid"
        aria-label="Torneos del organizador"
        onPointerMove={updateCandyEdge}
      >
        {visibleTournaments.map((tournament, index) => (
          <article
            className={`summary-panel tournament-card candy-edge${index === 0 ? " tournament-card-featured" : ""}`}
            key={tournament.id}
          >
            <div className="tournament-card-heading">
              <span
                className={`tournament-status tournament-status-${tournament.status}`}
                role="status"
              >
                <span aria-hidden="true">{STATUS_LABELS[tournament.status].icon}</span>
                {STATUS_LABELS[tournament.status].label}
              </span>
              {index === 0 && (
                <span className="tournament-latest-label">Más reciente</span>
              )}
            </div>
            <div className="tournament-card-content">
              <h3>{tournament.title}</h3>
              <p className="tournament-card-meta">
                {tournament.weeklyNumber !== null && (
                  <span>#{String(tournament.weeklyNumber).padStart(3, "0")}</span>
                )}
                {[tournament.game, tournament.format].filter(Boolean).join(" · ") ||
                  "Formato no disponible"}
              </p>
              {tournament.approvedDate && (
                <p className="tournament-approved-date">
                  <span aria-hidden="true">◷</span>
                  {tournament.approvedDate}
                </p>
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
            </div>
            <div className="dashboard-tournament-actions">
              <Link
                className="tournament-open-link"
                href={`/organizer/tournament?tournamentId=${tournament.id}`}
              >
                Abrir torneo <span aria-hidden="true">→</span>
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
