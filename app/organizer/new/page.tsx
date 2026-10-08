"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  isPlatformForGame,
  isTournamentGame,
  TOURNAMENT_PLATFORMS,
  type TournamentGame,
  type TournamentPlatform,
} from "@/lib/tournament-platform";

export default function NewTournamentPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [game, setGame] = useState<TournamentGame | "">("");
  const [platform, setPlatform] = useState<TournamentPlatform | "">("");
  const [format, setFormat] = useState("");
  const [rules, setRules] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (
      !isTournamentGame(game) ||
      !isPlatformForGame(game, platform) ||
      !name.trim() ||
      !format.trim() ||
      !rules.trim()
    ) {
      setError("Completa todos los campos y selecciona una plataforma compatible.");
      return;
    }

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
          platform,
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
    <div className="page-stack tournament-creation">
      <header className="tournament-creation-header">
        <p className="eyebrow">NUEVO TORNEO</p>
        <h1>Preparación del torneo</h1>
        <p className="lede">
          Configura la información básica y deja que Caramelo Raro prepare
          automáticamente las opciones de horario.
        </p>
      </header>

      <ol
        className="tournament-steps"
        aria-label="Etapas de preparación del torneo"
      >
        <li className="tournament-step is-active" aria-current="step">
          <span>01</span>
          Configuración
        </li>
        <li className="tournament-step">
          <span>02</span>
          Disponibilidad
        </li>
        <li className="tournament-step">
          <span>03</span>
          Decisión
        </li>
        <li className="tournament-step">
          <span>04</span>
          Publicación
        </li>
      </ol>

      <div className="tournament-creation-layout">
        <section className="summary-panel tournament-form-panel candy-edge">
          <div className="tournament-panel-heading">
            <span className="tournament-panel-number" aria-hidden="true">
              01
            </span>
            <div>
              <p className="eyebrow">CONFIGURACIÓN</p>
              <h2>Información básica</h2>
            </div>
          </div>

          <p className="tournament-panel-description">
            Define los datos principales del torneo.
          </p>

          <form onSubmit={handleSubmit} className="form-stack tournament-form">
            <div>
              <label htmlFor="name">
                Nombre del torneo <span>REQUERIDO</span>
              </label>
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
              <label htmlFor="game">
                Juego <span>REQUERIDO</span>
              </label>
              <select
                id="game"
                value={game}
                onChange={(event) => {
                  const nextGame = event.target.value;
                  setGame(isTournamentGame(nextGame) ? nextGame : "");
                  setPlatform("");
                }}
                required
              >
                <option value="">Selecciona un juego</option>
                <option value="pokemon_vgc">Pokémon VGC</option>
                <option value="pokemon_tcg">Pokémon TCG</option>
              </select>
            </div>

            {game && (
              <fieldset className="platform-fieldset">
                <legend>
                  Plataforma de juego <span>REQUERIDO</span>
                </legend>
                <p className="platform-field-hint" id="platform-hint">
                  Selecciona una plataforma para continuar.
                </p>
                <div className="platform-options">
                  {TOURNAMENT_PLATFORMS[game].map((option) => {
                    const selected = platform === option.value;
                    return (
                      <label
                        className={`platform-option candy-edge${selected ? " is-selected" : ""}`}
                        key={option.value}
                      >
                        <input
                          type="radio"
                          name="platform"
                          value={option.value}
                          checked={selected}
                          required
                          aria-describedby="platform-hint"
                          onChange={() => setPlatform(option.value)}
                        />
                        <span>{option.label}</span>
                        {selected && (
                          <span className="platform-selected-label">
                            SELECCIONADA
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            )}

            <div>
              <label htmlFor="format">
                Formato <span>REQUERIDO</span>
              </label>
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
              <label htmlFor="rules">
                Reglas <span>REQUERIDO</span>
              </label>
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
              <p role="alert" className="tournament-form-error">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !isPlatformForGame(game, platform)}
              className="button button-primary tournament-create-button candy-edge"
            >
              {loading ? "CREANDO TORNEO..." : "CREAR TORNEO"}
              {!loading && <span aria-hidden="true">→</span>}
            </button>
          </form>
        </section>

        <aside
          className="tournament-automation-panel candy-edge"
          aria-labelledby="tournament-automation-title"
        >
          <p className="eyebrow">AUTOMATIZACIÓN</p>
          <h2 id="tournament-automation-title">Preparación automática</h2>
          <p>
            Al crear el torneo, Caramelo Raro preparará automáticamente las
            opciones de disponibilidad.
          </p>
          <ul>
            <li><span aria-hidden="true">✓</span> Próximo sábado</li>
            <li><span aria-hidden="true">✓</span> Próximo domingo</li>
            <li><span aria-hidden="true">✓</span> 7 horarios por día</li>
            <li><span aria-hidden="true">✓</span> 13:00 — 19:00</li>
            <li><span aria-hidden="true">✓</span> Zona horaria de tu perfil</li>
          </ul>
          <div className="tournament-automation-note">
            <span aria-hidden="true">◆</span>
            <strong>Tú decides el horario final.</strong>
          </div>
        </aside>
      </div>
    </div>
  );
}
