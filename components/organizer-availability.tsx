"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { updateCandyEdge } from "@/components/candy-edge";
import OrganizerResults from "@/components/organizer-results";
import OrganizerTasks from "@/components/organizer-tasks";

type Day = "saturday" | "sunday";
type TournamentInfo = {
  title: string;
  game: string;
  format: string;
  rules: string;
  timeZone: string;
};
type AvailabilityOption = {
  id: string;
  starts_at: string;
  is_active: boolean;
};

const DAYS: { key: Day; label: string }[] = [
  { key: "saturday", label: "Sábado" },
  { key: "sunday", label: "Domingo" },
];

function dayForOption(option: AvailabilityOption, timeZone: string): Day | null {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
  })
    .format(new Date(option.starts_at))
    .toLowerCase();

  if (weekday === "saturday") return "saturday";
  if (weekday === "sunday") return "sunday";
  return null;
}

function formatDate(option: AvailabilityOption, timeZone: string) {
  return new Intl.DateTimeFormat("es", {
    timeZone,
    day: "numeric",
    month: "long",
  }).format(new Date(option.starts_at));
}

function formatTime(option: AvailabilityOption, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
      .formatToParts(new Date(option.starts_at))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return `${parts.hour}:${parts.minute} ${parts.dayPeriod.toUpperCase()}`;
}

function displayGame(game: string) {
  if (game === "pokemon_vgc") return "Pokémon VGC";
  if (game === "pokemon_tcg") return "Pokémon TCG";
  return game.replaceAll("_", " ");
}

export default function OrganizerAvailability({
  tournamentId,
}: {
  tournamentId: string;
}) {
  const [tournament, setTournament] = useState<TournamentInfo | null>(null);
  const [options, setOptions] = useState<AvailabilityOption[]>([]);
  const [pollExists, setPollExists] = useState(false);
  const [pollStatus, setPollStatus] = useState<"open" | "closed" | null>(null);
  const [shareUrl, setShareUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [generatingOptions, setGeneratingOptions] = useState(false);
  const [creatingPoll, setCreatingPoll] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const optionsByDay = useMemo(() => {
    const grouped: Record<Day, AvailabilityOption[]> = {
      saturday: [],
      sunday: [],
    };

    for (const option of options) {
      const day = tournament
        ? dayForOption(option, tournament.timeZone)
        : null;
      if (day) grouped[day].push(option);
    }
    return grouped;
  }, [options, tournament]);

  const generateDefaultOptions = useCallback(async () => {
    setGeneratingOptions(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `/api/tournaments/${tournamentId}/availability`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ generateDefaults: true }),
        },
      );
      const data = (await response.json()) as {
        error?: string;
        options?: AvailabilityOption[];
      };

      if (!response.ok) {
        setError(data.error ?? "No fue posible generar las opciones.");
        return;
      }

      setOptions((data.options ?? []).filter((option) => option.is_active));
      setNotice("La disponibilidad del próximo fin de semana quedó preparada.");
    } catch {
      setError("No fue posible conectar con el servidor.");
    } finally {
      setGeneratingOptions(false);
    }
  }, [tournamentId]);

  useEffect(() => {
    let cancelled = false;

    async function loadConfiguration() {
      try {
        const response = await fetch(
          `/api/tournaments/${tournamentId}/availability`,
          { cache: "no-store" },
        );
        const data = (await response.json()) as {
          error?: string;
          tournament?: TournamentInfo;
          options?: AvailabilityOption[];
          pollExists?: boolean;
          pollStatus?: "open" | "closed" | null;
        };

        if (!response.ok || !data.tournament) {
          if (!cancelled) {
            setError(data.error ?? "No fue posible cargar el torneo.");
          }
          return;
        }

        if (cancelled) return;
        const activeOptions = (data.options ?? []).filter(
          (option) => option.is_active,
        );
        setTournament(data.tournament);
        setOptions(activeOptions);
        setPollExists(data.pollExists ?? false);
        setPollStatus(data.pollStatus ?? null);

        if (activeOptions.length === 0 && !data.pollExists) {
          await generateDefaultOptions();
        }

        if (data.pollExists) {
          const pollResponse = await fetch(
            `/api/tournaments/${tournamentId}/poll`,
            { cache: "no-store" },
          );
          const pollData = (await pollResponse.json()) as {
            sharePath?: string | null;
            error?: string;
          };
          if (!pollResponse.ok) {
            throw new Error(
              pollData.error ?? "No fue posible cargar el enlace de la encuesta.",
            );
          }
          if (!cancelled && pollData.sharePath) {
            setShareUrl(`${window.location.origin}${pollData.sharePath}`);
          }
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "No fue posible conectar con el servidor.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadConfiguration();
    return () => {
      cancelled = true;
    };
  }, [generateDefaultOptions, tournamentId]);

  async function handleCreatePoll() {
    setError("");
    setNotice("");
    setCreatingPoll(true);

    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/poll`, {
        method: "POST",
      });
      const data = (await response.json()) as {
        error?: string;
        sharePath?: string;
      };
      if (!response.ok || !data.sharePath) {
        setError(data.error ?? "No fue posible generar la encuesta.");
        return;
      }

      setShareUrl(`${window.location.origin}${data.sharePath}`);
      setPollExists(true);
      setPollStatus(null);
      setNotice("La encuesta está lista para compartir.");
    } catch {
      setError("No fue posible conectar con el servidor.");
    } finally {
      setCreatingPoll(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setNotice("Enlace copiado.");
    } catch {
      setError("No pudimos copiar el enlace. Selecciónalo y cópialo manualmente.");
    }
  }

  if (loading) {
    return (
      <div className="page-stack command-center" aria-live="polite">
        <p className="lede">Preparando el próximo torneo…</p>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="page-stack command-center">
        <section className="poll-notice" role="alert">
          <span className="notice-mark" aria-hidden="true">!</span>
          <div>
            <h2>No pudimos abrir el torneo</h2>
            <p>{error || "No encontramos este torneo."}</p>
          </div>
        </section>
      </div>
    );
  }

  const pollStateLabel =
    pollStatus === "open"
      ? "Abierta"
      : pollStatus === "closed"
        ? "Cerrada"
        : pollExists
          ? "Generada"
          : "Pendiente";

  return (
    <div className="page-stack command-center" onPointerMove={updateCandyEdge}>
      <header className="command-hero candy-edge">
        <div className="command-hero-main">
          <p className="eyebrow">TOURNAMENT COMMAND CENTER</p>
          <h1>{tournament.title}</h1>
          <p className="command-hero-format">
            {displayGame(tournament.game)} <span aria-hidden="true">·</span>{" "}
            {tournament.format}
          </p>
          {tournament.rules && (
            <p className="command-hero-rules">{tournament.rules}</p>
          )}
        </div>
        <div className="command-hero-status">
          <span className="command-status-caption">ENCUESTA PÚBLICA</span>
          <span
            className={`command-status-pill${pollStatus === "open" ? " command-status-ready" : ""}`}
            role="status"
          >
            <span aria-hidden="true">
              {pollStatus === "open"
                ? "✓"
                : pollStatus === "closed"
                  ? "×"
                  : pollExists
                    ? "◌"
                    : "○"}
            </span>
            {pollStateLabel}
          </span>
        </div>
      </header>

      <section className="command-overview candy-edge" aria-label="Estado operativo">
        <div className="command-overview-heading">
          <span className="command-overview-marker" aria-hidden="true" />
          <span>Vista operativa</span>
        </div>
        <div className="command-overview-facts">
          <div className="command-overview-fact">
            <span>Opciones activas</span>
            <strong>{options.length}</strong>
          </div>
          <div className="command-overview-fact">
            <span>Zona horaria</span>
            <strong>{tournament.timeZone}</strong>
          </div>
          <div className="command-overview-fact">
            <span>Estado de encuesta</span>
            <strong>{pollStateLabel}</strong>
          </div>
        </div>
      </section>

      <div className="command-setup-grid">
        <section className="summary-panel command-panel command-options-panel candy-edge">
          <div className="command-section-heading">
            <div>
              <p className="eyebrow">DISPONIBILIDAD</p>
              <h2>Opciones propuestas</h2>
            </div>
            <span className="command-count">{options.length} horarios</span>
          </div>
          <p className="command-panel-description">
            El torneo final se jugará un solo día. Estas opciones solo recogen
            cuándo pueden participar; no se anunciará nada automáticamente.
          </p>

          {options.length > 0 ? (
            <div className="proposed-days">
              {DAYS.map(({ key, label }) => {
                const dayOptions = optionsByDay[key];
                if (dayOptions.length === 0) return null;
                const firstOption = dayOptions[0];

                return (
                  <section className="proposed-day" key={key}>
                    <h3>
                      {label}, {formatDate(firstOption, tournament.timeZone)}
                    </h3>
                    <ul className="proposed-hours">
                      {dayOptions.map((option) => (
                        <li key={option.id}>
                          <span aria-hidden="true">✓</span>
                          {formatTime(option, tournament.timeZone)}
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="availability-empty">
              <p>
                {generatingOptions
                  ? "Generando automáticamente el próximo sábado y domingo…"
                  : "Todavía no se pudieron generar las opciones."}
              </p>
              {!pollExists && !generatingOptions && (
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={generateDefaultOptions}
                >
                  Reintentar generación automática
                </button>
              )}
            </div>
          )}
        </section>

        {!pollExists ? (
          <section className="summary-panel command-panel command-poll-panel candy-edge">
            <p className="eyebrow">ENCUESTA PÚBLICA</p>
            <h2>Genera el enlace cuando estés listo</h2>
            <p className="command-panel-description">
              Los horarios ya están definidos. Generar y compartir la encuesta
              no anuncia el torneo.
            </p>
            <button
              type="button"
              className="button button-primary"
              onClick={handleCreatePoll}
              disabled={creatingPoll || generatingOptions || options.length === 0}
            >
              {creatingPoll ? "Generando encuesta…" : "Generar encuesta"}
            </button>
          </section>
        ) : (
          <section className="summary-panel command-panel command-poll-panel command-poll-generated candy-edge">
            <p className="eyebrow">ENCUESTA GENERADA</p>
            <h2>Comparte el enlace público</h2>
            {shareUrl ? (
              <div className="share-link">
                <a href={shareUrl}>{shareUrl}</a>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={copyLink}
                >
                  Copiar enlace
                </button>
              </div>
            ) : (
              <p className="command-panel-description">
                El enlace no está disponible en este navegador. Si ya lo
                compartiste, seguirá funcionando para los participantes.
              </p>
            )}
          </section>
        )}
      </div>

      {pollExists && (
        <section className="command-section" aria-label="Resultados y comunicación">
          <div className="command-section-heading command-major-heading">
            <div>
              <p className="eyebrow">DECISIÓN Y COMUNICACIÓN</p>
              <h2>Resultados del torneo</h2>
            </div>
          </div>
          <OrganizerResults tournamentId={tournamentId} />
        </section>
      )}

      <section className="command-section" aria-label="Operaciones del torneo">
        <OrganizerTasks tournamentId={tournamentId} />
      </section>

      {error && <p className="poll-error" role="alert">{error}</p>}
      {notice && <p className="poll-success" role="status">{notice}</p>}
    </div>
  );
}
