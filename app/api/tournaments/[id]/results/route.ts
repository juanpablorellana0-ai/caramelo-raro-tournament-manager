import { NextResponse } from "next/server";
import { recommendAvailability } from "@/lib/availability-recommendation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ResponseWithSelections = {
  availability_selections: { availability_option_id: string }[];
};

function isResponseWithSelections(value: unknown): value is ResponseWithSelections[] {
  return (
    Array.isArray(value) &&
    value.every(
      (response) =>
        !!response &&
        typeof response === "object" &&
        "availability_selections" in response &&
        Array.isArray(response.availability_selections) &&
        response.availability_selections.every(
          (selection: unknown) =>
            !!selection &&
            typeof selection === "object" &&
            "availability_option_id" in selection &&
            typeof selection.availability_option_id === "string",
        ),
    )
  );
}

async function getAuthenticatedSupabase() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  return { supabase, user: error ? null : user };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: "No encontramos este torneo." }, { status: 404 });
  }

  try {
    const { supabase, user } = await getAuthenticatedSupabase();
    if (!user) {
      return NextResponse.json({ error: "Inicia sesión para continuar." }, { status: 401 });
    }

    const { data: tournament, error: tournamentError } = await supabase
      .from("tournaments")
      .select(
        "title, format, rules_snapshot, timezone, status, approved_option_id, approved_at, announced_at",
      )
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
          .eq("tournament_id", id),
        supabase
          .from("polls")
          .select("id")
          .eq("tournament_id", id)
          .maybeSingle(),
      ]);

    if (optionsError || pollError) {
      console.error("No fue posible cargar las opciones y la encuesta del torneo.");
      return NextResponse.json(
        { error: "No fue posible cargar los resultados de disponibilidad." },
        { status: 503 },
      );
    }

    let responses: ResponseWithSelections[] = [];
    if (poll) {
      const { data, error } = await supabase
        .from("participant_responses")
        .select("availability_selections(availability_option_id)")
        .eq("poll_id", poll.id);
      if (error || !isResponseWithSelections(data)) {
        console.error("No fue posible cargar las respuestas del torneo.");
        return NextResponse.json(
          { error: "No fue posible cargar las respuestas recibidas." },
          { status: 503 },
        );
      }
      responses = data;
    }

    const rulesSnapshot = tournament.rules_snapshot as {
      game?: unknown;
      rules?: unknown;
    };
    const activeOptions = (options ?? []).filter((option) => option.is_active);
    const recommendation = recommendAvailability(
      activeOptions.map((option) => ({
        id: option.id,
        startsAt: option.starts_at,
      })),
      responses.map((response) =>
        response.availability_selections.map(
          (selection) => selection.availability_option_id,
        ),
      ),
      tournament.timezone,
    );
    const approvedOption = (options ?? []).find(
      (option) => option.id === tournament.approved_option_id,
    );

    return NextResponse.json(
      {
        tournament: {
          title: tournament.title,
          game: typeof rulesSnapshot.game === "string" ? rulesSnapshot.game : "",
          format: tournament.format,
          rules: typeof rulesSnapshot.rules === "string" ? rulesSnapshot.rules : "",
          timeZone: tournament.timezone,
          status: tournament.status,
          approvedOptionId: tournament.approved_option_id,
          approvedAt: tournament.approved_at,
          announcedAt: tournament.announced_at,
        },
        approvedOption: approvedOption
          ? {
              optionId: approvedOption.id,
              startsAt: approvedOption.starts_at,
            }
          : null,
        ...recommendation,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Error inesperado al consultar resultados de disponibilidad:", error);
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
    return NextResponse.json({ error: "Selecciona un horario válido." }, { status: 400 });
  }

  if (
    !body ||
    typeof body !== "object" ||
    !("optionId" in body) ||
    typeof body.optionId !== "string" ||
    !UUID_PATTERN.test(body.optionId)
  ) {
    return NextResponse.json({ error: "Selecciona un horario válido." }, { status: 400 });
  }

  try {
    const { supabase, user } = await getAuthenticatedSupabase();
    if (!user) {
      return NextResponse.json({ error: "Inicia sesión para continuar." }, { status: 401 });
    }

    const { data, error } = await supabase.rpc("approve_tournament_schedule", {
      p_tournament_id: id,
      p_option_id: body.optionId,
    });

    if (error) {
      console.error("No fue posible aprobar el horario del torneo.");
      return NextResponse.json(
        {
          error:
            "No fue posible aprobar el horario. Verifica que el torneo siga recopilando respuestas y la opción esté activa.",
        },
        { status: 409 },
      );
    }

    return NextResponse.json({ approval: data });
  } catch (error) {
    console.error("Error inesperado al aprobar el horario:", error);
    return NextResponse.json(
      { error: "No fue posible conectar con el servidor." },
      { status: 503 },
    );
  }
}
