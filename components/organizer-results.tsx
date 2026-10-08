"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AvailabilityRankingEntry,
  AvailabilityRecommendation,
} from "@/lib/availability-recommendation";
import OrganizerAnnouncement from "@/components/organizer-announcement";
import OrganizerLimitlessDescription from "@/components/organizer-limitless-description";

type ResultsData = AvailabilityRecommendation & {
  tournament: {
    title: string;
    game: string;
    format: string;
    rules: string;
    timeZone: string;
    status: string;
    approvedOptionId: string | null;
    approvedAt: string | null;
    announcedAt: string | null;
  };
  approvedOption: {
    optionId: string;
    startsAt: string;
  } | null;
};

function isResultsData(value: unknown): value is ResultsData {
  if (!value || typeof value !== "object") return false;

  const result = value as Partial<ResultsData>;

  return (
    !!result.tournament &&
    typeof result.tournament.title === "string" &&
    typeof result.tournament.timeZone === "string" &&
    typeof result.tournament.status === "string" &&
    (result.tournament.announcedAt === null ||
      typeof result.tournament.announcedAt === "string") &&
    Array.isArray(result.ranking) &&
    typeof result.totalResponses === "number" &&
    typeof result.recommendationStatus === "string"
  );
}

function AvailabilityOptionCard({
  entry,
  totalResponses,
  recommendedOptionId,
  isTie,
  recommendedCount,
}: {
  entry: AvailabilityRankingEntry;
  totalResponses: number;
  recommendedOptionId: string | null;
  isTie: boolean;
  recommendedCount: number | null;
}) {
  const isRecommended = entry.optionId === recommendedOptionId;
  const isTied = isTie && entry.responseCount === recommendedCount;
  const barWidth =
    totalResponses > 0
      ? (entry.responseCount / totalResponses) * 100
      : 0;

  return (
    <article
      className={`result-option candy-edge${isRecommended ? " is-recommended" : ""}${isTied ? " is-tied" : ""}`}
    >
      <div className="result-option-heading">
        <div>
          <strong>{entry.dayLabel}, {entry.dateLabel}</strong>
          <span>{entry.timeLabel}</span>
        </div>
        <div className="result-option-badges">
          {isRecommended && <span className="option-state option-state-recommended">RECOMENDADO</span>}
          {isTied && <span className="option-state option-state-tied">EMPATE</span>}
        </div>
      </div>
      <div className="result-option-stats">
        <strong>{entry.responseCount} / {totalResponses} disponibles</strong>
        <strong>{entry.responsePercentage}%</strong>
      </div>
      <div
        className="result-bar-track"
        role="img"
        aria-label={`${entry.responseCount} de ${totalResponses} participantes disponibles, ${entry.responsePercentage}%`}
      >
        <div className="result-bar" style={{ width: `${barWidth}%` }} />
      </div>
    </article>
  );
}

export default function OrganizerResults({
  tournamentId,
  pollStatus,
  optionCount,
}: {
  tournamentId: string;
  pollStatus: "open" | "closed" | null;
  optionCount: number;
}) {
  const [results, setResults] = useState<ResultsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [approving, setApproving] = useState(false);
  const [markingAnnounced, setMarkingAnnounced] = useState(false);
  const [choosingAnother, setChoosingAnother] = useState(false);
  const [selectedOptionId, setSelectedOptionId] = useState("");
  const selectedManuallyRef = useRef(false);
  const [pendingApprovalId, setPendingApprovalId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadResults = useCallback(async () => {
    setError("");
    setRefreshing(true);

    try {
      const response = await fetch(
        `/api/tournaments/${tournamentId}/results`,
        { cache: "no-store" },
      );

      const data: unknown = await response.json();

      if (!response.ok || !isResultsData(data)) {
        const message =
          data &&
          typeof data === "object" &&
          "error" in data &&
          typeof data.error === "string"
            ? data.error
            : "No fue posible cargar los resultados.";

        setError(message);
        return;
      }

      setResults(data);
      if (!data.hasTie) selectedManuallyRef.current = false;

      setSelectedOptionId((current) => {
        if (data.hasTie) {
          if (!selectedManuallyRef.current) return "";
          const tiedOptionIds = new Set(
            data.ranking
              .filter((entry) => entry.responseCount === data.recommendedCount)
              .map((entry) => entry.optionId),
          );
          return current && tiedOptionIds.has(current) ? current : "";
        }
        return current && data.ranking.some((entry) => entry.optionId === current)
          ? current
          : data.recommendedOptionId ?? "";
      });
    } catch {
      setError("No fue posible conectar con el servidor.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tournamentId]);

  useEffect(() => {
    void loadResults();
  }, [loadResults]);

  useEffect(() => {
    if (!pendingApprovalId || approving) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPendingApprovalId(null);
        setError("");
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [approving, pendingApprovalId]);

  async function approveOption(optionId: string) {
    if (!optionId) return;

    setError("");
    setNotice("");
    setApproving(true);

    try {
      const response = await fetch(
        `/api/tournaments/${tournamentId}/results`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ optionId }),
        },
      );

      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(data.error ?? "No fue posible aprobar este horario.");
        return;
      }

      setChoosingAnother(false);
      setPendingApprovalId(null);
      setNotice("Horario aprobado. El torneo no se ha anunciado.");

      await loadResults();
    } catch {
      setError("No fue posible conectar con el servidor.");
    } finally {
      setApproving(false);
    }
  }

  function requestApproval(optionId: string) {
    if (
      !canApprove ||
      !results?.ranking.some((entry) => entry.optionId === optionId)
    ) {
      return;
    }
    setError("");
    setPendingApprovalId(optionId);
  }

  async function markAsAnnounced() {
    if (!window.confirm("¿Ya publicaste el anuncio del torneo?")) return;

    setError("");
    setNotice("");
    setMarkingAnnounced(true);

    try {
      const response = await fetch(
        `/api/tournaments/${tournamentId}/announcement-status`,
        { method: "POST" },
      );

      const data: unknown = await response.json();

      if (!response.ok) {
        const message =
          data &&
          typeof data === "object" &&
          "error" in data &&
          typeof data.error === "string"
            ? data.error
            : "No fue posible marcar el torneo como anunciado.";

        setError(message);
        return;
      }

      if (
        !data ||
        typeof data !== "object" ||
        !("id" in data) ||
        data.id !== tournamentId ||
        !("status" in data) ||
        data.status !== "announced" ||
        !("announced_at" in data) ||
        typeof data.announced_at !== "string"
      ) {
        setError("El servidor no confirmó el estado actualizado del torneo.");
        return;
      }

      const announcedAt = data.announced_at;

      setResults((current) =>
        current
          ? {
              ...current,
              tournament: {
                ...current.tournament,
                status: "announced",
                announcedAt,
              },
            }
          : current,
      );

      setNotice("El torneo quedó marcado como anunciado.");

      await loadResults();
    } catch {
      setError("No fue posible conectar con el servidor.");
    } finally {
      setMarkingAnnounced(false);
    }
  }

  if (loading) {
    return (
      <section className="summary-panel" aria-live="polite">
        <p className="eyebrow">RESULTADOS</p>
        <p className="poll-muted">
          Cargando resultados de disponibilidad…
        </p>
      </section>
    );
  }

  if (!results) {
    return (
      <section className="summary-panel">
        <p className="eyebrow">RESULTADOS</p>
        <h2>No pudimos cargar los resultados</h2>

        {error && (
          <p className="poll-error" role="alert">
            {error}
          </p>
        )}

        <button
          type="button"
          className="button button-secondary"
          onClick={loadResults}
          disabled={refreshing}
        >
          Reintentar
        </button>
      </section>
    );
  }

  const approvedEntry = results.approvedOption
    ? results.ranking.find(
        (entry) => entry.optionId === results.approvedOption?.optionId,
      )
    : undefined;

  const isScheduleApproved =
    results.tournament.status === "schedule_approved";

  const isAnnounced = results.tournament.status === "announced";

  const hasApprovedSchedule = isScheduleApproved || isAnnounced;

  const canApprove =
    results.tournament.status === "collecting_availability" &&
    results.recommendationStatus === "recommended";

  const isTie = results.hasTie && results.tieCount > 1;

  const tiedOptions = isTie
    ? results.ranking.filter(
        (entry) => entry.responseCount === results.recommendedCount,
      )
    : [];
  const pendingApproval = pendingApprovalId
    ? results.ranking.find((entry) => entry.optionId === pendingApprovalId)
    : undefined;

  const availabilityState = hasApprovedSchedule
    ? "Cerrada"
    : pollStatus === "open"
      ? "Abierta"
      : pollStatus === "closed"
        ? "Cerrada"
        : "Generada";

  return (
    <section className="organizer-results page-stack command-results">
      <header className="results-heading">
        <div>
          <p className="eyebrow">DISPONIBILIDAD</p>
          <h2>Encuesta de horario</h2>
          <p className="poll-muted">{results.tournament.title}</p>
        </div>

        <div className="availability-metrics">
          <div className="availability-metric">
            <span>Respuestas</span>
            <strong>{results.totalResponses}</strong>
            <small>{results.totalResponses === 1 ? "participante" : "participantes"}</small>
          </div>
          <div className="availability-metric">
            <span>Horarios</span>
            <strong>{optionCount}</strong>
            <small>opciones activas</small>
          </div>
          <div className={`availability-metric availability-metric-status${availabilityState === "Cerrada" ? " is-closed" : ""}`}>
            <span>Estado</span>
            <strong>{availabilityState}</strong>
            <small>encuesta pública</small>
          </div>
          <button
            type="button"
            className="button button-secondary"
            onClick={loadResults}
            disabled={refreshing}
          >
            {refreshing ? "Actualizando…" : "Actualizar resultados"}
          </button>
        </div>
      </header>

      <div className="decision-section-heading">
        <p className="eyebrow">DECISIÓN DE HORARIO</p>
        <span>La recomendación informa; la aprobación siempre es del organizador.</span>
      </div>

      {hasApprovedSchedule ? (
        <div className="summary-panel summary-highlight command-decision command-decision-approved candy-edge">
          <p className="eyebrow">✓ HORARIO CONFIRMADO</p>
          <h3>Horario aprobado por el organizador</h3>

          {approvedEntry ? (
            <>
              <p className="recommendation-date">
                {approvedEntry.dayLabel}, {approvedEntry.dateLabel}
              </p>

              <p className="approved-time">
                {approvedEntry.timeLabel}
              </p>

              <p>
                {approvedEntry.responseCount}{" "}
                {approvedEntry.responseCount === 1
                  ? "participante disponible"
                  : "participantes disponibles"}
              </p>
            </>
          ) : results.approvedOption ? (
            <>
              <p className="recommendation-date">
                {new Intl.DateTimeFormat("es", {
                  timeZone: results.tournament.timeZone,
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                }).format(new Date(results.approvedOption.startsAt))}
              </p>
              <p className="approved-time">
                {new Intl.DateTimeFormat("es", {
                  timeZone: results.tournament.timeZone,
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                }).format(new Date(results.approvedOption.startsAt))}
              </p>
            </>
          ) : (
            <p>La opción aprobada ya no está activa.</p>
          )}

          {isAnnounced ? (
            <>
              <p className="approved-status">
                ANUNCIADO
              </p>

              {results.tournament.announcedAt ? (
                <p>
                  Anunciado el{" "}
                  {new Intl.DateTimeFormat("es", {
                    timeZone: results.tournament.timeZone,
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(
                    new Date(results.tournament.announcedAt),
                  )}
                </p>
              ) : (
                <p className="poll-muted">
                  El torneo está anunciado; no hay fecha registrada.
                </p>
              )}
            </>
          ) : (
            <>
              <p className="approved-status">
                Encuesta cerrada · horario aprobado
              </p>

              <p>El horario fue confirmado por el organizador.</p>

              <p className="poll-muted">
                Usa esta acción solamente después de publicar
                manualmente el anuncio y la descripción en sus
                respectivos canales.
              </p>

              <button
                type="button"
                className="button button-primary candy-edge"
                onClick={markAsAnnounced}
                disabled={markingAnnounced}
              >
                {markingAnnounced
                  ? "Actualizando estado…"
                  : "Marcar como anunciado"}
              </button>
            </>
          )}
        </div>
      ) : results.recommendationStatus === "no_responses" ? (
        <div className="summary-panel command-decision command-decision-neutral candy-edge">
          <p className="eyebrow">DECISIÓN DE HORARIO</p>

          <h3>Aún no hay respuestas</h3>

          <p>
            Cuando los participantes respondan, aquí aparecerán las opciones
            con mayor disponibilidad.
          </p>
        </div>
      ) : results.recommendationStatus === "no_options" ? (
        <div className="summary-panel command-decision command-decision-neutral candy-edge">
          <p className="eyebrow">DECISIÓN DE HORARIO</p>

          <h3>No hay opciones de disponibilidad activas</h3>
        </div>
      ) : isTie ? (
        <div className="summary-panel summary-highlight command-decision command-decision-tie candy-edge">
          <p className="eyebrow">DECISIÓN DEL ORGANIZADOR</p>

          <h3><span aria-hidden="true">⚠</span> Empate detectado</h3>

          <p>
            Hay <strong>{results.tieCount}</strong> opciones con la
            misma disponibilidad máxima:
            {" "}
            <strong>{results.recommendedCount}</strong>{" "}
            {results.recommendedCount === 1
              ? "participante disponible"
              : "participantes disponibles"}.
          </p>

          <p className="poll-muted">
            El sistema no selecciona un horario automáticamente. Elige una
            de las opciones empatadas para continuar.
          </p>

          <div className="alternate-choice">
            <h4>Selecciona el horario que quieres aprobar</h4>

            <div className="alternate-options">
              {tiedOptions.map((entry) => (
                <label
                  className={`checkbox-row tie-option candy-edge${selectedOptionId === entry.optionId ? " is-selected" : ""}`}
                  key={entry.optionId}
                >
                  <input
                    type="radio"
                    name="approved-option"
                    value={entry.optionId}
                    checked={
                      selectedOptionId === entry.optionId
                    }
                    onChange={() =>
                      {
                        selectedManuallyRef.current = true;
                        setSelectedOptionId(entry.optionId);
                      }
                    }
                  />

                  <span className="decision-option-content">
                    <strong>{entry.dayLabel}, {entry.dateLabel}</strong>
                    <span>{entry.timeLabel}</span>
                    <span>
                      {entry.responseCount} / {results.totalResponses} disponibles
                      {" · "}{entry.responsePercentage}%
                    </span>
                    {selectedOptionId === entry.optionId && (
                      <span className="selected-option-label">SELECCIONADO</span>
                    )}
                  </span>
                </label>
              ))}
            </div>

            <div className="recommendation-actions">
              <button
                type="button"
                className="button button-primary"
                onClick={() => requestApproval(selectedOptionId)}
                disabled={
                  approving ||
                  !selectedOptionId ||
                  !tiedOptions.some(
                    (entry) =>
                      entry.optionId === selectedOptionId,
                  )
                }
              >
                {approving
                  ? "Aprobando…"
                  : "Aprobar horario seleccionado"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="summary-panel summary-highlight command-decision command-decision-recommendation candy-edge">
          <p className="eyebrow">RECOMENDACIÓN DEL SISTEMA</p>

          <h3><span aria-hidden="true">✦</span> Horario con mayor disponibilidad</h3>

          <p className="recommendation-date">
            {results.ranking[0].dayLabel},{" "}
            {results.ranking[0].dateLabel}
          </p>

          <p className="recommendation-time">
            {results.ranking[0].timeLabel}
          </p>

          <span className="recommendation-badge">RECOMENDADO</span>

          <p className="recommendation-count">
            {results.ranking[0].responseCount} de{" "}
            {results.totalResponses} participantes disponibles

            <span>
              {" "}
              ·{" "}
              {results.ranking[0].responsePercentage}%
            </span>
          </p>

          {results.ranking[1] && (
            <p className="second-option">
              Segunda mejor opción:{" "}
              {results.ranking[1].dayLabel},{" "}
              {results.ranking[1].dateLabel} ·{" "}
              {results.ranking[1].timeLabel} (
              {results.ranking[1].responseCount}{" "}
              {results.ranking[1].responseCount === 1
                ? "participante"
                : "participantes"}
              )
            </p>
          )}

          <p className="poll-muted">
            Esta recomendación se basa únicamente en la
            disponibilidad registrada.
          </p>

          {canApprove && !choosingAnother && (
            <div className="recommendation-actions">
              <button
                type="button"
                className="button button-primary candy-edge"
                onClick={() =>
                  results.recommendedOptionId &&
                  requestApproval(results.recommendedOptionId)
                }
                disabled={
                  approving || !results.recommendedOptionId
                }
              >
                {approving
                  ? "Aprobando…"
                  : "Aprobar este horario"}
              </button>

              {results.ranking.length > 1 && (
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => {
                    setChoosingAnother(true);
                    setSelectedOptionId("");
                  }}
                >
                  Elegir otra opción
                </button>
              )}
            </div>
          )}

          {canApprove && choosingAnother && (
            <div className="alternate-choice">
              <h4>Elige la opción que quieres aprobar</h4>

              <div className="alternate-options">
                {results.ranking.map((entry) => (
                  <label
                    className={`checkbox-row alternate-option candy-edge${selectedOptionId === entry.optionId ? " is-selected" : ""}`}
                    key={entry.optionId}
                  >
                    <input
                      type="radio"
                      name="approved-option"
                      value={entry.optionId}
                      checked={
                        selectedOptionId === entry.optionId
                      }
                      onChange={() =>
                        {
                          selectedManuallyRef.current = true;
                          setSelectedOptionId(entry.optionId);
                        }
                      }
                    />

                    <span className="decision-option-content">
                      {entry.dayLabel},{" "}
                      {entry.dateLabel} ·{" "}
                      {entry.timeLabel}
                      {" — "}
                      {entry.responseCount}{" "}
                      {entry.responseCount === 1
                        ? "participante"
                        : "participantes"}
                      {" · "}{entry.responsePercentage}%
                      {selectedOptionId === entry.optionId && (
                        <span className="selected-option-label">SELECCIONADO</span>
                      )}
                    </span>
                  </label>
                ))}
              </div>

              <div className="recommendation-actions">
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => requestApproval(selectedOptionId)}
                  disabled={
                    approving || !selectedOptionId
                  }
                >
                  {approving
                    ? "Aprobando…"
                    : "Aprobar opción seleccionada"}
                </button>

                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() =>
                    setChoosingAnother(false)
                  }
                  disabled={approving}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {results.ranking.length > 0 && (
        hasApprovedSchedule ? (
          <details className="summary-panel command-availability-ranking ranking-secondary">
            <summary>
              <span className="eyebrow">INFORMACIÓN SECUNDARIA</span>
              Ver todas las opciones de horario
            </summary>
            <div className="result-option-list">
              {results.ranking.map((entry) => (
                <AvailabilityOptionCard
                  key={entry.optionId}
                  entry={entry}
                  totalResponses={results.totalResponses}
                  recommendedOptionId={results.recommendedOptionId}
                  isTie={isTie}
                  recommendedCount={results.recommendedCount}
                />
              ))}
            </div>
          </details>
        ) : (
          <section className="summary-panel command-availability-ranking">
            <div className="decision-section-heading">
              <div>
                <p className="eyebrow">TODAS LAS OPCIONES</p>
                <h3>Disponibilidad por horario</h3>
              </div>
              <span>Ordenadas por disponibilidad</span>
            </div>
            <div className="result-option-list">
              {results.ranking.map((entry) => (
                <AvailabilityOptionCard
                  key={entry.optionId}
                  entry={entry}
                  totalResponses={results.totalResponses}
                  recommendedOptionId={results.recommendedOptionId}
                  isTie={isTie}
                  recommendedCount={results.recommendedCount}
                />
              ))}
            </div>
          </section>
        )
      )}

      {hasApprovedSchedule && (
        <div className="command-communication-grid">
          <OrganizerAnnouncement
            tournamentId={tournamentId}
            isAnnounced={isAnnounced}
          />
          <OrganizerLimitlessDescription
            tournamentId={tournamentId}
          />
        </div>
      )}

      {pendingApproval && (
        <div className="approval-dialog-backdrop">
          <section
            className="approval-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="approve-schedule-title"
            aria-describedby="approve-schedule-description"
          >
            <p className="eyebrow">CONFIRMACIÓN</p>
            <h2 id="approve-schedule-title">¿Aprobar este horario?</h2>
            <div className="approval-dialog-schedule">
              <strong>
                {pendingApproval.dayLabel}, {pendingApproval.dateLabel}
              </strong>
              <span>{pendingApproval.timeLabel}</span>
              <span>
                {pendingApproval.responseCount} / {results.totalResponses}{" "}
                disponibles · {pendingApproval.responsePercentage}%
              </span>
            </div>
            <p id="approve-schedule-description">
              Al aprobar, la encuesta se cerrará y se crearán las tareas de
              publicación.
            </p>
            {error && <p className="poll-error" role="alert">{error}</p>}
            <div className="approval-dialog-actions">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => {
                  setPendingApprovalId(null);
                  setError("");
                }}
                disabled={approving}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="button button-primary candy-edge"
                onClick={() => void approveOption(pendingApproval.optionId)}
                disabled={approving}
                autoFocus
              >
                {approving ? "Aprobando…" : "Aprobar horario"}
              </button>
            </div>
          </section>
        </div>
      )}

      {notice && (
        <p className="poll-success" role="status">
          {notice}
        </p>
      )}

      {error && !pendingApproval && (
        <p className="poll-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}