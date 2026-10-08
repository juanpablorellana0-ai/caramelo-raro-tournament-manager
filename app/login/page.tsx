"use client";

import { FormEvent, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfig } from "@/lib/supabase/config";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const { url, anonKey } = getSupabaseConfig();

      const supabase = createBrowserClient(url, anonKey);

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError("Correo o contraseña incorrectos.");
        return;
      }

      window.location.href = "/organizer";
    } catch {
      setError("No fue posible iniciar sesión. Inténtalo nuevamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-brand">
          <span className="login-brand-mark" aria-hidden="true">CR</span>
          <span>
            <span className="login-brand-name">Caramelo Raro</span>
            <span className="login-brand-product">Tournament Manager</span>
          </span>
        </div>

        <div className="login-heading">
          <p className="eyebrow">ACCESO DE ORGANIZADOR</p>
          <h1 id="login-title">Iniciar sesión</h1>
          <p>Accede al panel de organización de torneos.</p>
        </div>

        <form onSubmit={handleLogin} className="login-form">
          <div className="login-field">
            <label htmlFor="email">Correo electrónico</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>

          <div className="login-field">
            <label htmlFor="password">Contraseña</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>

          {error && (
            <div className="login-error" role="alert">
              <span className="login-error-icon" aria-hidden="true">!</span>
              <div>
                <strong>Error de acceso</strong>
                <p>{error}</p>
              </div>
            </div>
          )}

          <button type="submit" disabled={loading} className="button button-primary login-submit">
            {loading ? "Iniciando sesión..." : "Iniciar sesión"}
            {!loading && <span aria-hidden="true">→</span>}
          </button>
        </form>
        <p className="login-footnote">Acceso seguro para organizadores</p>
      </section>
    </div>
  );
}