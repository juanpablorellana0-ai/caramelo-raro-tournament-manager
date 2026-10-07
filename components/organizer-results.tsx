"use client";

import { useCallback, useEffect, useState } from "react";
import type { AvailabilityRecommendation } from "@/lib/availability-recommendation";
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

function displayGame(game: string) {
  if (game === "pokemon_vgc") return "Pokémon VGC";
  if (game === "pokemon_tcg") return "Pokémon TCG";
  return game.replaceAll("_", " ");
}

function percentage(count: number, total: number) {
  if (total === 0) return 0;
  return Math.round((count / total) * 100);
}

export default function OrganizerResults({
  tournamentId,
}: {
  tournamentId: string;
}) {
  const [results, setResults] = useState<ResultsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [approving, setApproving] = useState(false);
  const [markingAnnounced, setMarkingAnnounced] = useState(false);
  const [choosingAnother, setChoosingAnother] = useState(false);
  const [selectedOptionId, setSelectedOptionId] = useState("");
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

      setSelectedOptionId((current) =>
        current && data.ranking.some((entry) => entry.optionId === current)
          ? current
          : data.recommendedOptionId ?? "",
      );
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
      setNotice("Horario aprobado. El torneo no se ha anunciado.");

      await loadResults();
    } catch {
      setError("No fue posible conectar con el servidor.");
    } finally {
      setApproving(false);
    }
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

  const maxCount = Math.max(
    1,
    ...results.ranking.map((entry) => entry.responseCount),
  );

  return (
    <section className="organizer-results page-stack">
      <header className="results-heading">
        <div>
          <p className="eyebrow">RESULTADOS DE DISPONIBILIDAD</p>

          <h2>{results.tournament.title}</h2>

          <p className="poll-muted">
            {displayGame(results.tournament.game)} ·{" "}
            {results.tournament.format}
          </p>
        </div>

        <div className="results-response-count">
          <strong>{results.totalResponses}</strong>

          <span>
            {results.totalResponses === 1
              ? "respuesta recibida"
              : "respuestas recibidas"}
          </span>

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

      {hasApprovedSchedule ? (
        <div className="summary-panel summary-highlight">
          <p className="eyebrow">ESTADO DEL TORNEO</p>

          <h3>Horario aprobado</h3>

          {approvedEntry ? (
            <>
              <h3>
                {approvedEntry.dayLabel}, {approvedEntry.dateLabel}
              </h3>

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
          ) : (
            <p>La opción aprobada ya no está activa.</p>
          )}

          {isAnnounced ? (
            <>
              <p className="approved-status">
                Estado: Anunciado
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
                Estado: Horario aprobado
              </p>

              <p className="poll-muted">
                El torneo todavía no ha sido anunciado.
              </p>

              <p className="poll-muted">
                Usa esta acción solamente después de publicar
                manualmente el anuncio y la descripción en sus
                respectivos canales.
              </p>

              <button
                type="button"
                className="button button-primary"
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
        <div className="summary-panel">
          <p className="eyebrow">RECOMENDACIÓN</p>

          <h3>Aún no hay respuestas</h3>

          <p>
            Cuando los participantes respondan, aquí verás la
            recomendación.
          </p>
        </div>
      ) : results.recommendationStatus === "no_options" ? (
        <div className="summary-panel">
          <p className="eyebrow">RECOMENDACIÓN</p>

          <h3>No hay opciones de disponibilidad activas</h3>
        </div>
      ) : isTie ? (
        <div className="summary-panel summary-highlight">
          <p className="eyebrow">DECISIÓN DEL ORGANIZADOR</p>

          <h3>⚠️ Empate detectado</h3>

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
            El sistema no seleccionará un horario automáticamente.
            El organizador debe elegir cuál aprobar.
          </p>

          <div className="alternate-choice">
            <h4>Selecciona el horario que quieres aprobar</h4>

            <div className="alternate-options">
              {tiedOptions.map((entry) => (
                <label
                  className="checkbox-row"
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
                      setSelectedOptionId(entry.optionId)
                    }
                  />

                  <span>
                    <strong>
                      {entry.dayLabel}, {entry.dateLabel}
                    </strong>
                    {" · "}
                    {entry.timeLabel}
                    {" — "}
                    {entry.responseCount}{" "}
                    {entry.responseCount === 1
                      ? "participante"
                      : "participantes"}
                    {" · "}
                    {entry.responsePercentage}%
                  </span>
                </label>
              ))}
            </div>

            <div className="recommendation-actions">
              <button
                type="button"
                className="button button-primary"
                onClick={() =>
                  void approveOption(selectedOptionId)
                }
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
        <div className="summary-panel summary-highlight">
          <p className="eyebrow">RECOMENDACIÓN AUTOMÁTICA</p>

          <h3>Mejor opción</h3>

          <p className="recommendation-date">
            {results.ranking[0].dayLabel},{" "}
            {results.ranking[0].dateLabel}
          </p>

          <p className="recommendation-time">
            {results.ranking[0].timeLabel}
          </p>

          <p className="recommendation-count">
            {results.ranking[0].responseCount} de{" "}
            {results.totalResponses} participantes disponibles

            <span>
              {" "}
              ·{" "}
              {percentage(
                results.ranking[0].responseCount,
                results.totalResponses,
              )}
              %
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
                className="button button-primary"
                onClick={() =>
                  results.recommendedOptionId &&
                  approveOption(results.recommendedOptionId)
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
                    setSelectedOptionId(
                      results.recommendedOptionId ?? "",
                    );
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
                    className="checkbox-row"
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
                        setSelectedOptionId(entry.optionId)
                      }
                    />

                    <span>
                      {entry.dayLabel},{" "}
                      {entry.dateLabel} ·{" "}
                      {entry.timeLabel}
                      {" — "}
                      {entry.responseCount}{" "}
                      {entry.responseCount === 1
                        ? "participante"
                        : "participantes"}
                    </span>
                  </label>
                ))}
              </div>

              <div className="recommendation-actions">
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() =>
                    void approveOption(selectedOptionId)
                  }
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

      {hasApprovedSchedule && (
        <OrganizerAnnouncement
          tournamentId={tournamentId}
          isAnnounced={isAnnounced}
        />
      )}

      {hasApprovedSchedule && (
        <OrganizerLimitlessDescription
          tournamentId={tournamentId}
        />
      )}

      {results.ranking.length > 0 && (
        <div className="summary-panel">
          <p className="eyebrow">TODAS LAS OPCIONES</p>

          <h3>Disponibilidad por horario</h3>

          {results.ranking.map((entry, index) => {
            const barWidth =
              (entry.responseCount / maxCount) * 100;

            return (
              <div
                className="result-option"
                key={entry.optionId}
              >
                <div className="result-option-heading">
                  <span>
                    <strong>{index + 1}.</strong>{" "}
                    {entry.dayLabel},{" "}
                    {entry.dateLabel} ·{" "}
                    {entry.timeLabel}
                  </span>

                  <strong>
                    {entry.responseCount} /{" "}
                    {results.totalResponses}

                    <span className="result-percentage">
                      {" "}
                      ({entry.responsePercentage}%)
                    </span>
                  </strong>
                </div>

                <div
                  className="result-bar-track"
                  role="img"
                  aria-label={`${entry.responseCount} de ${results.totalResponses} participantes disponibles`}
                >
                  <div
                    className="result-bar"
                    style={{
                      width: `${barWidth}%`,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {notice && (
        <p className="poll-success" role="status">
          {notice}
        </p>
      )}

      {error && (
        <p className="poll-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}