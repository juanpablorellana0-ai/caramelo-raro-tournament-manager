import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { upcomingWeekendDates, zonedDateTimeToIso } from "@/lib/tournament-time";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_HOURS = [13, 14, 15, 16, 17, 18, 19];

async function getOrganizer() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { supabase, user: null };
  }
  return { supabase, user };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: "No encontramos este torneo." }, { status: 404 });
  }

  try {
    const { supabase, user } = await getOrganizer();
    if (!user) {
      return NextResponse.json({ error: "Inicia sesión para continuar." }, { status: 401 });
    }

    const { data: tournament, error: tournamentError } = await supabase
      .from("tournaments")
      .select("id, title, format, rules_snapshot, timezone")
      .eq("id", id)
      .single();

    if (tournamentError || !tournament) {
      return NextResponse.json({ error: "No encontramos este torneo." }, { status: 404 });
    }

    const [{ data: options, error: optionsError }, { data: poll, error: pollError }] =
      await Promise.all([
        supabase
          .from("availability_options")
          .select("id, starts_at, is_active")
          .eq("tournament_id", id)
          .order("starts_at"),
        supabase.from("polls").select("id, status").eq("tournament_id", id).maybeSingle(),
      ]);

    if (optionsError || pollError) {
      console.error("No fue posible cargar la configuración del torneo.");
      return NextResponse.json(
        { error: "No fue posible cargar la configuración del torneo." },
        { status: 503 },
      );
    }

    const rulesSnapshot = tournament.rules_snapshot as {
      game?: unknown;
      rules?: unknown;
    };

    return NextResponse.json({
      tournament: {
        title: tournament.title,
        game: typeof rulesSnapshot.game === "string" ? rulesSnapshot.game : "",
        format: tournament.format,
        rules: typeof rulesSnapshot.rules === "string" ? rulesSnapshot.rules : "",
        timeZone: tournament.timezone,
      },
      options: options ?? [],
      pollExists: !!poll,
      pollStatus: poll?.status ?? null,
    });
  } catch (error) {
    console.error("Error inesperado al cargar la configuración del torneo:", error);
    return NextResponse.json(
      { error: "No fue posible conectar con el servidor." },
      { status: 503 },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: "No encontramos este torneo." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "No fue posible generar las opciones." }, { status: 400 });
  }
  if (
    !body ||
    typeof body !== "object" ||
    !("generateDefaults" in body) ||
    body.generateDefaults !== true
  ) {
    return NextResponse.json(
      { error: "Solicita la generación automática de disponibilidad." },
      { status: 400 },
    );
  }

  try {
    const { supabase, user } = await getOrganizer();
    if (!user) {
      return NextResponse.json({ error: "Inicia sesión para continuar." }, { status: 401 });
    }

    const { data: tournament, error: tournamentError } = await supabase
      .from("tournaments")
      .select("timezone")
      .eq("id", id)
      .single();
    if (tournamentError || !tournament) {
      return NextResponse.json({ error: "No encontramos este torneo." }, { status: 404 });
    }

    const { data: existingOptions, error: existingOptionsError } = await supabase
      .from("availability_options")
      .select("id, starts_at, is_active")
      .eq("tournament_id", id)
      .order("starts_at");
    if (existingOptionsError) {
      console.error("No fue posible revisar las opciones existentes.");
      return NextResponse.json(
        { error: "No fue posible revisar las opciones de disponibilidad." },
        { status: 503 },
      );
    }

    if (existingOptions && existingOptions.length > 0) {
      const activeOptions = existingOptions.filter((option) => option.is_active);
      if (activeOptions.length === 0) {
        return NextResponse.json(
          {
            error:
              "Hay opciones anteriores desactivadas. No las reemplazamos automáticamente.",
          },
          { status: 409 },
        );
      }
      return NextResponse.json({ saved: true, options: activeOptions });
    }

    const dates = upcomingWeekendDates(tournament.timezone);
    const options = [
      { date: dates.saturday },
      { date: dates.sunday },
    ].flatMap(({ date }) =>
      DEFAULT_HOURS.map((hour) => ({
        starts_at: zonedDateTimeToIso(
          date,
          hour,
          0,
          tournament.timezone,
        ),
      })),
    );

    const { error } = await supabase.rpc("configure_tournament_availability", {
      p_tournament_id: id,
      p_options: options,
    });
    if (error) {
      console.error("No fue posible guardar las opciones de disponibilidad.");
      return NextResponse.json(
        { error: "No fue posible guardar las opciones. Verifica que la encuesta no se haya generado." },
        { status: 409 },
      );
    }

    const { data: savedOptions, error: savedOptionsError } = await supabase
      .from("availability_options")
      .select("id, starts_at, is_active")
      .eq("tournament_id", id)
      .order("starts_at");
    if (savedOptionsError) {
      console.error("No fue posible confirmar las opciones guardadas.");
      return NextResponse.json(
        { error: "Las opciones se guardaron, pero no fue posible volver a cargarlas." },
        { status: 503 },
      );
    }

    return NextResponse.json({ saved: true, options: savedOptions ?? [] });
  } catch (error) {
    console.error("Error inesperado al guardar opciones de disponibilidad:", error);
    return NextResponse.json(
      { error: "No fue posible conectar con el servidor." },
      { status: 503 },
    );
  }
}
