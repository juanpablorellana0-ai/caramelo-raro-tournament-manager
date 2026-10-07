"use client";

import { useEffect, useState } from "react";

type AnnouncementData = {
  tournament: {
    title: string;
    game: string;
    format: string;
    rules: string;
    timeZone: string;
    startsAt: string;
  };
  content: string;
  version: number | null;
  hasSavedDraft: boolean;
};

function isAnnouncementData(value: unknown): value is AnnouncementData {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<AnnouncementData>;
  return (
    !!data.tournament &&
    typeof data.tournament.title === "string" &&
    typeof data.tournament.game === "string" &&
    typeof data.tournament.format === "string" &&
    typeof data.tournament.rules === "string" &&
    typeof data.tournament.timeZone === "string" &&
    typeof data.tournament.startsAt === "string" &&
    typeof data.content === "string" &&
    (data.version === null || typeof data.version === "number") &&
    typeof data.hasSavedDraft === "boolean"
  );
}

function displayGame(game: string) {
  if (game === "pokemon_vgc") return "Pokémon VGC";
  if (game === "pokemon_tcg") return "Pokémon TCG";
  return game.replaceAll("_", " ");
}

function errorMessage(data: unknown, fallback: string) {
  if (
    data &&
    typeof data === "object" &&
    "error" in data &&
    typeof data.error === "string"
  ) {
    return data.error;
  }
  return fallback;
}

export default function OrganizerAnnouncement({
  tournamentId,
  isAnnounced,
}: {
  tournamentId: string;
  isAnnounced: boolean;
}) {
  const [announcement, setAnnouncement] = useState<AnnouncementData | null>(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saveFeedback, setSaveFeedback] = useState("");
  const [copyFeedback, setCopyFeedback] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadAnnouncement() {
      try {
        const response = await fetch(
          `/api/tournaments/${tournamentId}/announcement`,
          { cache: "no-store" },
        );
        const data: unknown = await response.json();

        if (!response.ok || !isAnnouncementData(data)) {
          if (!cancelled) {
            setError(errorMessage(data, "No fue posible cargar el anuncio."));
          }
          return;
        }

        if (!cancelled) {
          setAnnouncement(data);
          setContent(data.content);
        }
      } catch {
        if (!cancelled) {
          setError("No fue posible conectar con el servidor.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadAnnouncement();
    return () => {
      cancelled = true;
    };
  }, [tournamentId]);

  async function saveDraft() {
    setError("");
    setSaveFeedback("");
    setCopyFeedback("");
    setSaving(true);

    try {
      const response = await fetch(
        `/api/tournaments/${tournamentId}/announcement`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content,
            expectedVersion: announcement?.version ?? null,
          }),
        },
      );
      const data: unknown = await response.json();
      if (!response.ok || !data || typeof data !== "object") {
        setError(errorMessage(data, "No fue posible guardar el borrador."));
        return;
      }

      if (
        !("content" in data) ||
        typeof data.content !== "string" ||
        !("version" in data) ||
        typeof data.version !== "number"
      ) {
        setError("El servidor no confirmó el borrador guardado.");
        return;
      }

      setContent(data.content);
      setAnnouncement((current) =>
        current
          ? { ...current, content: data.content as string, version: data.version as number, hasSavedDraft: true }
          : current,
      );
      setSaveFeedback("Borrador guardado");
    } catch {
      setError("No fue posible conectar con el servidor.");
    } finally {
      setSaving(false);
    }
  }

  async function copyMessage() {
    setError("");
    setSaveFeedback("");
    setCopyFeedback("");

    try {
      await navigator.clipboard.writeText(content);
      setCopyFeedback("Mensaje copiado");
    } catch {
      setError(
        "No fue posible copiar el mensaje. Selecciona el texto y cópialo manualmente.",
      );
    }
  }

  return (
    <section className="summary-panel announcement-panel">
      <p className="eyebrow">ANUNCIO DEL TORNEO</p>
      <h2>Borrador del anuncio</h2>

      <p className="announcement-not-published">
        {isAnnounced
          ? "El torneo ya fue marcado como anunciado."
          : "El torneo todavía no ha sido anunciado."}
      </p>

      {loading ? (
        <p className="poll-muted" aria-live="polite">
          Cargando datos y borrador…
        </p>
      ) : error && !announcement ? (
        <div className="announcement-error-state">
          <p className="poll-error" role="alert">{error}</p>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => window.location.reload()}
          >
            Volver a cargar
          </button>
        </div>
      ) : announcement ? (
        <>
          <dl className="announcement-details">
            <div>
              <dt>Torneo</dt>
              <dd>{announcement.tournament.title}</dd>
            </div>
            <div>
              <dt>Formato</dt>
              <dd>
                {[displayGame(announcement.tournament.game), announcement.tournament.format]
                  .filter(Boolean)
                  .join(" · ")}
              </dd>
            </div>
            <div>
              <dt>Fecha aprobada</dt>
              <dd>
                {new Intl.DateTimeFormat("es", {
                  timeZone: announcement.tournament.timeZone,
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                }).format(new Date(announcement.tournament.startsAt))}
              </dd>
            </div>
            <div>
              <dt>Hora aprobada</dt>
              <dd>
                {new Intl.DateTimeFormat("es", {
                  timeZone: announcement.tournament.timeZone,
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                }).format(new Date(announcement.tournament.startsAt))}
              </dd>
            </div>
            <div>
              <dt>Zona horaria</dt>
              <dd>{announcement.tournament.timeZone}</dd>
            </div>
            {announcement.tournament.rules && (
              <div className="announcement-rules">
                <dt>Reglas disponibles</dt>
                <dd>{announcement.tournament.rules}</dd>
              </div>
            )}
          </dl>

          <label className="announcement-editor-label" htmlFor="announcement-content">
            Revisa y edita el mensaje antes de utilizarlo
          </label>
          <textarea
            id="announcement-content"
            className="announcement-textarea"
            value={content}
            onChange={(event) => {
              setContent(event.target.value);
              setSaveFeedback("");
              setCopyFeedback("");
            }}
            rows={14}
            maxLength={10_000}
            disabled={saving}
          />
          <p className="announcement-editor-hint">
            Editar el texto no lo guarda ni lo anuncia automáticamente.
          </p>

          <div className="announcement-actions">
            <button
              type="button"
              className="button button-primary"
              onClick={saveDraft}
              disabled={saving || loading || !content.trim()}
            >
              {saving ? "Guardando…" : "Guardar borrador"}
            </button>
            <button
              type="button"
              className="button button-secondary"
              onClick={copyMessage}
              disabled={loading || !content}
            >
              Copiar mensaje
            </button>
          </div>

          <div className="announcement-feedback" aria-live="polite">
            {saveFeedback && (
              <p className="poll-success">{saveFeedback}</p>
            )}
            {copyFeedback && (
              <p className="poll-success">{copyFeedback}</p>
            )}
            {error && <p className="poll-error" role="alert">{error}</p>}
          </div>

          {announcement.hasSavedDraft && announcement.version !== null && (
            <p className="announcement-version">
              Versión guardada: {announcement.version}
            </p>
          )}
        </>
      ) : null}
    </section>
  );
}
