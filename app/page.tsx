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
      <div className="page-stack">
        <section className="welcome-row">
          <div>
            <p className="eyebrow">CENTRO DE TORNEOS</p>
            <h1>Tu próximo torneo, en marcha.</h1>
            <p className="lede">
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
      <div className="page-stack">
        <section className="welcome-row">
          <div>
            <p className="eyebrow">CENTRO DE TORNEOS</p>
            <h1>Tu próximo torneo, en marcha.</h1>
          </div>
          <Link className="button button-secondary" href="/organizer">
            Abrir organizador <span aria-hidden="true">↗</span>
          </Link>
        </section>
        <section className="summary-panel" role="alert">
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
    <div className="page-stack">
      <section className="welcome-row">
        <div>
          <p className="eyebrow">CENTRO DE TORNEOS</p>
          <h1>Tu próximo torneo, en marcha.</h1>
          <p className="lede">
            Consulta el estado y continúa organizando tus torneos desde aquí.
          </p>
        </div>

        <div className="button-group">
          <Link className="button button-primary" href="/organizer/new">
            Crear torneo <span aria-hidden="true">→</span>
          </Link>
          <Link className="button button-secondary" href="/organizer">
            Abrir organizador
          </Link>
        </div>
      </section>

      {tournaments.length === 0 ? (
        <>
          <section className="dashboard-grid" aria-label="Resumen">
            <article className="summary-panel summary-highlight">
              <div className="panel-heading">
                <p className="eyebrow">ACTIVIDAD</p>
                <span className="status-dot" aria-label="Preparado" />
              </div>
              <h2>Todo listo para empezar</h2>
              <p>
                El espacio de organización está preparado para tu primer
                torneo.
              </p>
              <Link className="text-link" href="/organizer">
                Ir al área de organización <span aria-hidden="true">→</span>
              </Link>
            </article>

            <article className="summary-panel">
              <p className="eyebrow">PRÓXIMO PASO</p>
              <div className="step-mark" aria-hidden="true">
                01
              </div>
              <h2>Define una fecha</h2>
              <p>
                Prepara una encuesta para conocer la disponibilidad de
                participantes.
              </p>
            </article>
          </section>

          <section className="quiet-strip" aria-label="Estado del espacio">
            <span className="quiet-icon" aria-hidden="true">
              ✳
            </span>
            <span>Sin torneos todavía</span>
            <span className="quiet-separator" aria-hidden="true">
              /
            </span>
            <span className="quiet-detail">
              Tu actividad aparecerá aquí cuando crees el primero.
            </span>
          </section>
        </>
      ) : (
        <section className="page-stack" aria-labelledby="tournaments-heading">
          <header className="page-heading">
            <p className="eyebrow">ACTIVIDAD</p>
            <h2 id="tournaments-heading">Tus torneos</h2>
            <p className="lede">
              {tournaments.length}{" "}
              {tournaments.length === 1
                ? "torneo en seguimiento"
                : "torneos en seguimiento"}
            </p>
          </header>

          <DashboardTournamentList tournaments={dashboardTournaments} />
        </section>
      )}
    </div>
  );
}
