import Link from "next/link";
import DashboardTournamentList, {
  type DashboardTournament,
} from "@/components/dashboard-tournament-list";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { TournamentStatus } from "@/types/tournament";

type TournamentRow = {
  id: string;
  title: string;
  weekly_number: number | null;
  format: string;
  rules_snapshot: unknown;
  timezone: string;
  status: TournamentStatus;
  approved_option_id: string | null;
  created_at: string;
};

type ApprovedOptionRow = {
  id: string;
  tournament_id: string;
  starts_at: string;
};

type ManualTaskSummaryRow = {
  tournament_id: string;
  status: string;
};

type TaskSummary = {
  pendingCount: number;
  hasTasks: boolean;
};

function getGame(rulesSnapshot: unknown) {
  if (
    !rulesSnapshot ||
    typeof rulesSnapshot !== "object" ||
    !("game" in rulesSnapshot) ||
    typeof rulesSnapshot.game !== "string"
  ) {
    return "";
  }

  if (rulesSnapshot.game === "pokemon_vgc") return "Pokémon VGC";
  if (rulesSnapshot.game === "pokemon_tcg") return "Pokémon TCG";
  return rulesSnapshot.game.replaceAll("_", " ");
}

function formatApprovedDate(startsAt: string, timeZone: string) {
  return new Intl.DateTimeFormat("es", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(startsAt));
}

async function loadTournaments() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    console.error("No fue posible verificar la sesión del dashboard.");
    return { kind: "error" as const };
  }

  if (!user) return { kind: "unauthenticated" as const };

  const { data, error } = await supabase
    .from("tournaments")
    .select(
      "id, title, weekly_number, format, rules_snapshot, timezone, status, approved_option_id, created_at",
    )
    .eq("organizer_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("No fue posible cargar los torneos del organizador.");
    return { kind: "error" as const };
  }

  const tournaments = (data ?? []) as TournamentRow[];
  const approvedOptionIds = [
    ...new Set(
      tournaments
        .map((tournament) => tournament.approved_option_id)
        .filter((id): id is string => id !== null),
    ),
  ];

  let approvedOptions: ApprovedOptionRow[] = [];
  if (approvedOptionIds.length > 0) {
    const { data: options, error: optionsError } = await supabase
      .from("availability_options")
      .select("id, tournament_id, starts_at")
      .in("id", approvedOptionIds);

    if (optionsError) {
      console.error("No fue posible cargar las fechas aprobadas.");
      return { kind: "error" as const };
    }
    approvedOptions = (options ?? []) as ApprovedOptionRow[];
  }

  const taskSummaries: Record<string, TaskSummary | null> = {};
  if (tournaments.length > 0) {
    const tournamentIds = tournaments.map((tournament) => tournament.id);
    const { data: taskRows, error: tasksError } = await supabase
      .from("manual_tasks")
      .select("tournament_id, status")
      .in("tournament_id", tournamentIds);

    if (tasksError) {
      console.error("No fue posible cargar el resumen de tareas.");
      for (const tournament of tournaments) {
        taskSummaries[tournament.id] = null;
      }
    } else {
      for (const tournament of tournaments) {
        taskSummaries[tournament.id] = {
          pendingCount: 0,
          hasTasks: false,
        };
      }

      for (const task of (taskRows ?? []) as ManualTaskSummaryRow[]) {
        const summary = taskSummaries[task.tournament_id];
        if (!summary) continue;

        summary.hasTasks = true;
        if (task.status === "pending") summary.pendingCount += 1;
      }
    }
  }

  return {
    kind: "success" as const,
    tournaments,
    approvedOptions,
    taskSummaries,
  };
}

export default async function HomePage() {
  const dashboard = await loadTournaments();

  if (dashboard.kind === "unauthenticated") {
    return (
      <div className="page-stack cr-dashboard">
        <section className="dashboard-welcome">
          <div>
            <p className="eyebrow">CARAMELO RARO · ORGANIZACIÓN</p>
            <h1>Centro de torneos</h1>
            <p className="lede dashboard-lede">
              Inicia sesión para consultar y continuar organizando tus torneos.
            </p>
          </div>
          <Link className="button button-primary" href="/login">
            Iniciar sesión
          </Link>
        </section>
      </div>
    );
  }

  if (dashboard.kind === "error") {
    return (
      <div className="page-stack cr-dashboard">
        <section className="dashboard-welcome">
          <div>
            <p className="eyebrow">CARAMELO RARO · ORGANIZACIÓN</p>
            <h1>Centro de torneos</h1>
            <p className="lede dashboard-lede">
              Organiza y sigue la actividad de tus jornadas competitivas.
            </p>
          </div>
          <Link
            className="button button-secondary"
            href="/organizer"
          >
            Abrir organizador <span aria-hidden="true">↗</span>
          </Link>
        </section>
        <section className="summary-panel dashboard-error-panel" role="alert">
          <p className="eyebrow">ESTADO DEL SISTEMA</p>
          <h2>No fue posible cargar los torneos</h2>
          <p>
            Intenta actualizar la página. Si el problema continúa, vuelve a
            intentarlo más tarde.
          </p>
        </section>
      </div>
    );
  }

  const { tournaments, approvedOptions, taskSummaries } = dashboard;
  const approvedOptionsById = new Map(
    approvedOptions.map((option) => [option.id, option]),
  );
  const dashboardTournaments: DashboardTournament[] = tournaments.map(
    (tournament) => {
      const approvedOption = tournament.approved_option_id
        ? approvedOptionsById.get(tournament.approved_option_id)
        : undefined;

      return {
        id: tournament.id,
        title: tournament.title,
        weeklyNumber: tournament.weekly_number,
        game: getGame(tournament.rules_snapshot),
        format: tournament.format,
        status: tournament.status,
        approvedDate: approvedOption
          ? formatApprovedDate(approvedOption.starts_at, tournament.timezone)
          : null,
        taskSummary: taskSummaries[tournament.id] ?? null,
      };
    },
  );

  return (
    <div className="page-stack cr-dashboard">
      <section className="dashboard-welcome">
        <div>
          <p className="eyebrow">CARAMELO RARO · ORGANIZACIÓN</p>
          <h1>Centro de torneos</h1>
          <p className="lede dashboard-lede">
            Coordina tus jornadas competitivas y mantén cada torneo en marcha.
          </p>
        </div>

        <div className="dashboard-quick-actions">
          {tournaments.length > 0 && (
            <Link
              className="button button-primary dashboard-create-button"
              href="/organizer/new"
            >
              <span aria-hidden="true">+</span> Crear torneo
            </Link>
          )}
          <Link
            className="button button-secondary dashboard-organizer-button"
            href="/organizer"
          >
            Abrir organizador
          </Link>
        </div>
      </section>

      {tournaments.length === 0 ? (
        <section className="dashboard-empty summary-panel">
          <span className="dashboard-empty-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none">
              <path d="M16 4v24M4 16h24" />
              <circle cx="16" cy="16" r="11.5" />
            </svg>
          </span>
          <p className="eyebrow">TU ESPACIO DE COMPETICIÓN</p>
          <h2>Todavía no has creado ningún torneo</h2>
          <p>
            Organiza tu primera jornada de Caramelo Raro y coordina aquí cada
            paso de la competición.
          </p>
          <Link
            className="button button-primary dashboard-create-button"
            href="/organizer/new"
          >
            <span aria-hidden="true">+</span> Crear torneo
          </Link>
        </section>
      ) : (
        <>
          <section
            className="dashboard-metrics"
            aria-label="Resumen de actividad"
          >
            <article className="dashboard-metric">
              <span className="dashboard-metric-label">Torneos</span>
              <strong>{tournaments.length}</strong>
              <span className="dashboard-metric-detail">En seguimiento</span>
            </article>
            <article className="dashboard-metric">
              <span className="dashboard-metric-label">Pendientes</span>
              <strong>
                {Object.values(taskSummaries).some((summary) => summary === null)
                  ? "—"
                  : Object.values(taskSummaries).reduce(
                      (total, summary) => total + (summary?.pendingCount ?? 0),
                      0,
                    )}
              </strong>
              <span className="dashboard-metric-detail">Tareas por completar</span>
            </article>
            <article className="dashboard-metric">
              <span className="dashboard-metric-label">Completados</span>
              <strong>
                {
                  tournaments.filter(
                    (tournament) => tournament.status === "completed",
                  ).length
                }
              </strong>
              <span className="dashboard-metric-detail">Torneos finalizados</span>
            </article>
          </section>

          <section
            className="dashboard-tournaments-section"
            aria-labelledby="tournaments-heading"
          >
            <header className="dashboard-section-heading">
              <div>
                <p className="eyebrow">ACTIVIDAD RECIENTE</p>
                <h2 id="tournaments-heading">Tus torneos</h2>
              </div>
              <span className="dashboard-section-count">
                {tournaments.length}{" "}
                {tournaments.length === 1 ? "torneo" : "torneos"}
              </span>
            </header>
            <DashboardTournamentList tournaments={dashboardTournaments} />
          </section>
        </>
      )}
    </div>
  );
}
