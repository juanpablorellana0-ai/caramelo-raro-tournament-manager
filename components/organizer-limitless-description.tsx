"use client";

import { useEffect, useState } from "react";

type LimitlessDescriptionData = {
  weeklyNumber: number | null;
  content: string;
  generationError: string | null;
  version: number | null;
  hasSavedDraft: boolean;
};

function isLimitlessDescriptionData(
  value: unknown,
): value is LimitlessDescriptionData {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<LimitlessDescriptionData>;
  return (
    (data.weeklyNumber === null || typeof data.weeklyNumber === "number") &&
    typeof data.content === "string" &&
    (data.generationError === null ||
      typeof data.generationError === "string") &&
    (data.version === null || typeof data.version === "number") &&
    typeof data.hasSavedDraft === "boolean"
  );
}

function errorMessage(value: unknown, fallback: string) {
  if (
    value &&
    typeof value === "object" &&
    "error" in value &&
    typeof value.error === "string"
  ) {
    return value.error;
  }
  return fallback;
}

function isSavedDraft(
  value: unknown,
): value is { content: string; version: number } {
  return (
    !!value &&
    typeof value === "object" &&
    "content" in value &&
    typeof value.content === "string" &&
    "version" in value &&
    typeof value.version === "number"
  );
}

export default function OrganizerLimitlessDescription({
  tournamentId,
}: {
  tournamentId: string;
}) {
  const [draft, setDraft] = useState<LimitlessDescriptionData | null>(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saveFeedback, setSaveFeedback] = useState("");
  const [copyFeedback, setCopyFeedback] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadDraft() {
      try {
        const response = await fetch(
          `/api/tournaments/${tournamentId}/limitless-description`,
          { cache: "no-store" },
        );
        const value: unknown = await response.json();

        if (!response.ok || !isLimitlessDescriptionData(value)) {
          if (!cancelled) {
            setError(
              errorMessage(
                value,
                "No fue posible cargar la descripción para Limitless.",
              ),
            );
          }
          return;
        }

        if (!cancelled) {
          setDraft(value);
          setContent(value.content);
        }
      } catch {
        if (!cancelled) {
          setError("No fue posible conectar con el servidor.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadDraft();
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
        `/api/tournaments/${tournamentId}/limitless-description`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content,
            expectedVersion: draft?.version ?? null,
          }),
        },
      );
      const value: unknown = await response.json();
      if (!response.ok || !isSavedDraft(value)) {
        setError(errorMessage(value, "No fue posible guardar el borrador."));
        return;
      }

      setContent(value.content);
      setDraft((current) =>
        current
          ? {
              ...current,
              content: value.content,
              version: value.version,
              hasSavedDraft: true,
            }
          : current,
      );
      setSaveFeedback("Borrador guardado");
    } catch {
      setError("No fue posible conectar con el servidor.");
    } finally {
      setSaving(false);
    }
  }

  async function copyDescription() {
    setError("");
    setSaveFeedback("");
    setCopyFeedback("");

    try {
      await navigator.clipboard.writeText(content);
      setCopyFeedback("Descripción copiada. No se publicó en Limitless.");
    } catch {
      setError(
        "No fue posible copiar la descripción. Selecciona el texto y cópialo manualmente.",
      );
    }
  }

  const hasEditableContent =
    !!draft && (draft.content.length > 0 || draft.hasSavedDraft);

  return (
    <section className="summary-panel announcement-panel limitless-description-panel">
      <p className="eyebrow">DESCRIPCIÓN PARA LIMITLESS</p>
      <h2>Borrador de descripción</h2>
      <p>
        Edita el texto y guárdalo aquí. Copiarlo no lo publica ni abre
        Limitless.
      </p>

      {loading ? (
        <p className="poll-muted" aria-live="polite">
          Cargando borrador…
        </p>
      ) : error && !draft ? (
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
      ) : draft ? (
        <>
          {draft.generationError && (
            <p className="limitless-generation-warning" role="status">
              {draft.generationError}
              {draft.hasSavedDraft &&
                " El borrador guardado se conserva y puede editarse, pero no se generará un texto inicial."}
            </p>
          )}

          {draft.weeklyNumber !== null && (
            <p className="announcement-version">
              Número semanal: {draft.weeklyNumber}
            </p>
          )}

          {hasEditableContent ? (
            <>
              <p className="announcement-version">
                {draft.hasSavedDraft && draft.version !== null
                  ? `Borrador guardado · versión ${draft.version}`
                  : "Borrador inicial generado · todavía no guardado"}
              </p>
              <label
                className="announcement-editor-label"
                htmlFor="limitless-description-content"
              >
                Revisa y edita la descripción antes de copiarla
              </label>
              <textarea
                id="limitless-description-content"
                className="announcement-textarea"
                value={content}
                onChange={(event) => {
                  setContent(event.target.value);
                  setSaveFeedback("");
                  setCopyFeedback("");
                }}
                rows={24}
                maxLength={20_000}
                disabled={saving}
              />

              <div className="announcement-actions">
                <button
                  type="button"
                  className="button button-primary"
                  onClick={saveDraft}
                  disabled={saving || !content.trim()}
                >
                  {saving ? "Guardando…" : "Guardar borrador"}
                </button>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={copyDescription}
                  disabled={!content}
                >
                  Copiar descripción
                </button>
              </div>
            </>
          ) : (
            <p className="poll-muted">
              No se generó contenido. El resto del sistema sigue disponible.
            </p>
          )}

          <div className="announcement-feedback" aria-live="polite">
            {saveFeedback && <p className="poll-success">{saveFeedback}</p>}
            {copyFeedback && <p className="poll-success">{copyFeedback}</p>}
            {error && <p className="poll-error" role="alert">{error}</p>}
          </div>
        </>
      ) : null}
    </section>
  );
}
