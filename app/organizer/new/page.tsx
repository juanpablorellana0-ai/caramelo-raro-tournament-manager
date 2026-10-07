"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function NewTournamentPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [game, setGame] = useState("");
  const [format, setFormat] = useState("");
  const [rules, setRules] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/tournaments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          game,
          format,
          rules,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "No fue posible crear el torneo.");
        return;
      }

      const tournamentId = data.tournament?.id;

      if (!tournamentId) {
        setError("El torneo fue creado, pero no se recibió su identificador.");
        return;
      }

      router.push(`/organizer/tournament?tournamentId=${tournamentId}`);
    } catch {
      setError("No fue posible conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-stack">
      <section className="page-heading">
        <p className="eyebrow">NUEVO TORNEO</p>

        <h1>Crear torneo</h1>

        <p className="lede">
          Comienza definiendo la información básica de tu próximo torneo.
        </p>
      </section>

      <section className="summary-panel">
        <p className="eyebrow">PASO 01</p>

        <h2>Información básica</h2>

        <p>
          Define los datos principales que utilizaremos para preparar el
          torneo. Las fechas y los horarios del próximo fin de semana se
          propondrán automáticamente.
        </p>

        <form onSubmit={handleSubmit} className="form-stack">
          <div>
            <label htmlFor="name">Nombre del torneo</label>

            <input
              id="name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ej. Caramelo Raro Weekly #04"
              required
            />
          </div>

          <div>
            <label htmlFor="game">Juego</label>

            <select
              id="game"
              value={game}
              onChange={(event) => setGame(event.target.value)}
              required
            >
              <option value="">Selecciona un juego</option>
              <option value="pokemon_vgc">Pokémon VGC</option>
              <option value="pokemon_tcg">Pokémon TCG</option>
            </select>
          </div>

          <div>
            <label htmlFor="format">Formato</label>

            <input
              id="format"
              type="text"
              value={format}
              onChange={(event) => setFormat(event.target.value)}
              placeholder="Ej. Regulation M-C"
              required
            />
          </div>

          <div>
            <label htmlFor="rules">Reglas</label>

            <textarea
              id="rules"
              value={rules}
              onChange={(event) => setRules(event.target.value)}
              placeholder="Describe las reglas principales del torneo."
              rows={5}
              required
            />
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="button button-primary"
          >
            {loading ? "Creando torneo..." : "Crear torneo"}
            {!loading && <span aria-hidden="true">→</span>}
          </button>
        </form>
      </section>
    </div>
  );
}