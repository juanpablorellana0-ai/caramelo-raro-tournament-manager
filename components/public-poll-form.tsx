"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type AvailabilityOption = {
  id: string;
  starts_at: string;
};

type PublicPoll = {
  title: string;
  game: string;
  format: string;
  rules: string;
  time_zone: string;
  is_open: boolean;
  closure_reason:
    | "schedule_confirmed"
    | "completed"
    | "cancelled"
    | "poll_closed"
    | "not_open_yet"
    | "poll_expired"
    | "no_active_options"
    | null;
  options: AvailabilityOption[];
  has_response: boolean;
  selected_option_ids: string[];
};

type Day = "saturday" | "sunday";

const DAY_LABELS: Record<Day, string> = {
  saturday: "Sábado",
  sunday: "Domingo",
};

function isPublicPoll(value: unknown): value is PublicPoll {
  if (!value || typeof value !== "object") {
    return false;
  }
  const poll = value as Partial<PublicPoll>;
  return (
    typeof poll.title === "string" &&
    typeof poll.game === "string" &&
    typeof poll.format === "string" &&
    typeof poll.rules === "string" &&
    typeof poll.time_zone === "string" &&
    typeof poll.is_open === "boolean" &&
    (poll.closure_reason === null ||
      poll.closure_reason === "schedule_confirmed" ||
      poll.closure_reason === "completed" ||
      poll.closure_reason === "cancelled" ||
      poll.closure_reason === "poll_closed" ||
      poll.closure_reason === "not_open_yet" ||
      poll.closure_reason === "poll_expired" ||
      poll.closure_reason === "no_active_options") &&
    Array.isArray(poll.options) &&
    typeof poll.has_response === "boolean" &&
    Array.isArray(poll.selected_option_ids)
  );
}

function displayGame(game: string) {
  if (game === "pokemon_vgc") return "Pokémon VGC";
  if (game === "pokemon_tcg") return "Pokémon TCG";
  return game.replaceAll("_", " ");
}

function optionDay(option: AvailabilityOption, timeZone: string): Day | null {
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

function formatOption(option: AvailabilityOption, timeZone: string) {
  return new Intl.DateTimeFormat("es", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(option.starts_at));
}

export default function PublicPollForm({ token }: { token: string }) {
  const [poll, setPoll] = useState<PublicPoll | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeDays, setActiveDays] = useState<Day[]>([]);
  const [editing, setEditing] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [notFound, setNotFound] = useState(false);

  const optionsByDay = useMemo(() => {
    const grouped: Record<Day, AvailabilityOption[]> = {
      saturday: [],
      sunday: [],
    };
    if (!poll) return grouped;
    for (const option of poll.options) {
      const day = optionDay(option, poll.time_zone);
      if (day) grouped[day].push(option);
    }
    return grouped;
  }, [poll]);
  const availableDays = (["saturday", "sunday"] as Day[]).filter(
    (day) => optionsByDay[day].length > 0,
  );

  useEffect(() => {
    let cancelled = false;

    async function loadPoll() {
      try {
        const response = await fetch(`/api/polls/${token}`, { cache: "no-store" });
        if (!response.ok) {
          if (!cancelled && response.status === 404) {
            setNotFound(true);
          } else if (!cancelled) {
            setLoadError("No fue posible conectar con la encuesta. Inténtalo nuevamente.");
          }
          return;
        }

        const data: unknown = await response.json();
        if (!isPublicPoll(data)) {
          if (!cancelled) {
            setLoadError("No fue posible cargar la información de esta encuesta.");
          }
          return;
        }

        if (!cancelled) {
          setPoll(data);
          setSelectedIds(data.selected_option_ids);
          setActiveDays(
            (["saturday", "sunday"] as Day[]).filter((day) =>
              data.selected_option_ids.some((id) =>
                data.options.some(
                  (option) =>
                    option.id === id && optionDay(option, data.time_zone) === day,
                ),
              ),
            ),
          );
          setEditing(!data.has_response);
        }
      } catch {
        if (!cancelled) {
          setLoadError("No fue posible conectar con la encuesta. Inténtalo nuevamente.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadPoll();
    return () => {
      cancelled = true;
    };
  }, [token]);

  function toggleDay(day: Day) {
    if (activeDays.includes(day)) {
      setSelectedIds((ids) =>
        ids.filter((id) => !optionsByDay[day].some((option) => option.id === id)),
      );
      setActiveDays((current) => current.filter((value) => value !== day));
      setConfirmation("");
      setSaveError("");
      return;
    }
    setActiveDays((current) => [...current, day]);
    setConfirmation("");
    setSaveError("");
  }

  function toggleOption(optionId: string) {
    setSelectedIds((current) =>
      current.includes(optionId)
        ? current.filter((id) => id !== optionId)
        : [...current, optionId],
    );
    setConfirmation("");
    setSaveError("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveError("");
    setConfirmation("");
    if (selectedIds.length === 0) {
      setSaveError("Selecciona al menos un horario para enviar tu respuesta.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/polls/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: poll?.has_response ? "update" : "submit",
          optionIds: selectedIds,
        }),
      });
      const result = (await response.json()) as {
        result?: string;
        selectedOptionIds?: string[];
        error?: string;
      };

      if (!response.ok) {
        setSaveError(result.error ?? "No fue posible guardar tu respuesta.");
        return;
      }

      if (result.result === "already_submitted") {
        const currentIds = result.selectedOptionIds ?? [];
        setSelectedIds(currentIds);
        setActiveDays(
          (["saturday", "sunday"] as Day[]).filter((day) =>
            currentIds.some((id) =>
              optionsByDay[day].some((option) => option.id === id),
            ),
          ),
        );
        setPoll((current) =>
          current ? { ...current, has_response: true } : current,
        );
        setEditing(false);
        return;
      }

      if (result.result === "submitted" || result.result === "updated") {
        setPoll((current) =>
          current ? { ...current, has_response: true } : current,
        );
        setEditing(false);
        setConfirmation(
          result.result === "updated"
            ? "Tu respuesta se actualizó correctamente."
            : "¡Respuesta registrada! Gracias por ayudarnos a elegir el horario.",
        );
      }
    } catch {
      setSaveError("No fue posible conectar con el servidor. Inténtalo nuevamente.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="poll-page page-stack" aria-live="polite">
        <p className="lede">Cargando la encuesta…</p>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="poll-page page-stack">
        <section className="poll-notice" role="alert">
          <span className="notice-mark" aria-hidden="true">!</span>
          <div>
            <h2>Encuesta inexistente</h2>
            <p>No encontramos una encuesta asociada a este enlace.</p>
          </div>
        </section>
      </div>
    );
  }

  if (loadError || !poll) {
    return (
      <div className="poll-page page-stack">
        <section className="poll-notice" role="alert">
          <span className="notice-mark" aria-hidden="true">!</span>
          <div>
            <h2>No pudimos cargar la encuesta</h2>
            <p>{loadError || "Inténtalo nuevamente más tarde."}</p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="poll-page page-stack">
      <section className="page-heading poll-intro">
        <p className="eyebrow">CARAMELO RARO · ENCUESTA ANÓNIMA</p>
        <h1>{poll.title}</h1>
        <p className="lede">
          {displayGame(poll.game)} · {poll.format}
        </p>
        {poll.rules && <p className="poll-rules">{poll.rules}</p>}
      </section>

      {!poll.is_open ? (
        <section className="poll-notice" role="status">
          <span className="notice-mark" aria-hidden="true">i</span>
          <div>
            {poll.closure_reason === "schedule_confirmed" ? (
              <>
                <h2>🔒 Esta encuesta está cerrada.</h2>
                <p>
                  El horario del torneo ya fue confirmado por el organizador.
                </p>
              </>
            ) : (
              <>
                <h2>Encuesta cerrada o inactiva</h2>
                <p>Por ahora ya no es posible enviar ni modificar respuestas.</p>
              </>
            )}
          </div>
        </section>
      ) : (
        <>
          {poll.has_response && !editing && !confirmation && (
            <section className="poll-notice" role="status">
              <span className="notice-mark" aria-hidden="true">✓</span>
              <div>
                <h2>Ya registramos tu respuesta.</h2>
                <p>Puedes volver a revisarla y modificar tus horarios.</p>
                <button
                  type="button"
                  className="button button-secondary poll-edit-button"
                  onClick={() => {
                    setConfirmation("");
                    setEditing(true);
                  }}
                >
                  Modificar mi respuesta
                </button>
              </div>
            </section>
          )}

          {confirmation && (
            <section className="poll-notice" role="status">
              <span className="notice-mark" aria-hidden="true">✓</span>
              <div>
                <h2>{confirmation}</h2>
                <button
                  type="button"
                  className="button button-secondary poll-edit-button"
                  onClick={() => {
                    setConfirmation("");
                    setEditing(true);
                  }}
                >
                  Modificar mi respuesta
                </button>
              </div>
            </section>
          )}

          {editing && (
            <form className="page-stack poll-form" onSubmit={handleSubmit}>
              <section className="summary-panel poll-days">
                <p className="eyebrow">DÍAS</p>
                <h2>¿Cuándo puedes participar?</h2>
                <div className="day-choice-list">
                  {availableDays.map((day) => (
                    <label className="checkbox-row poll-day-choice" key={day}>
                      <input
                        type="checkbox"
                        checked={activeDays.includes(day)}
                        onChange={() => toggleDay(day)}
                        disabled={!poll.is_open || saving || (poll.has_response && !editing)}
                      />
                      <span>{DAY_LABELS[day]}</span>
                    </label>
                  ))}
                </div>
              </section>

              {(["saturday", "sunday"] as Day[]).map(
                (day) =>
                  activeDays.includes(day) && (
                    <section className="summary-panel" key={day}>
                      <p className="eyebrow">{DAY_LABELS[day].toUpperCase()}</p>
                      <h2>Selecciona todos los horarios que te sirven</h2>
                      <div className="poll-option-list">
                        {optionsByDay[day].map((option) => (
                          <label className="checkbox-row poll-option" key={option.id}>
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(option.id)}
                              onChange={() => toggleOption(option.id)}
                              disabled={saving}
                            />
                            <span>{formatOption(option, poll.time_zone)}</span>
                          </label>
                        ))}
                        {optionsByDay[day].length === 0 && (
                          <p className="poll-muted">No hay horarios para este día.</p>
                        )}
                      </div>
                    </section>
                  ),
              )}

              {saveError && (
                <p className="poll-error" role="alert">
                  {saveError}
                </p>
              )}

              <button
                type="submit"
                disabled={saving || selectedIds.length === 0}
                className="button button-primary poll-submit"
              >
                {saving ? "Guardando respuesta…" : "Enviar respuesta"}
              </button>
              <p className="poll-privacy">
                Tu respuesta es anónima. No solicitamos nombre ni datos personales.
              </p>
            </form>
          )}
        </>
      )}
    </div>
  );
}
