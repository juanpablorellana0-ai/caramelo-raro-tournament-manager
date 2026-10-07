import { NextResponse } from "next/server";
import { createLimitlessDescription } from "@/lib/limitless-description";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_DRAFT_LENGTH = 20_000;

type TournamentRow = {
  title: string;
  weekly_number: number | null;
  format: string;
  rules_snapshot: unknown;
  status: string;
};

type DraftRow = {
  version: number;
  content: string;
};

function isRulesSnapshot(
  value: unknown,
): value is { game?: unknown; rules?: unknown } {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function getGeneration(tournament: TournamentRow) {
  const weeklyNumber = tournament.weekly_number;
  if (
    typeof weeklyNumber !== "number" ||
    !Number.isSafeInteger(weeklyNumber) ||
    weeklyNumber < 1
  ) {
    return {
      weeklyNumber: null,
      content: null,
      error:
        "No se puede generar la descripción de Limitless porque este torneo no tiene número semanal.",
    };
  }

  const snapshot = isRulesSnapshot(tournament.rules_snapshot)
    ? tournament.rules_snapshot
    : {};
  const game = typeof snapshot.game === "string" ? snapshot.game : "";
  const rules = typeof snapshot.rules === "string" ? snapshot.rules : "";

  return {
    weeklyNumber,
    ...createLimitlessDescription({
      weeklyNumber,
      game,
      format: tournament.format,
      rules,
    }),
  };
}

async function getAuthenticatedTournament(tournamentId: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { supabase, failure: "unauthorized" as const };
  }

  const { data: tournament, error } = await supabase
    .from("tournaments")
    .select("title, weekly_number, format, rules_snapshot, status")
    .eq("id", tournamentId)
    .single();

  if (error || !tournament) {
    return { supabase, failure: "not_found" as const };
  }

  if (
    tournament.status !== "schedule_approved" &&
    tournament.status !== "announced"
  ) {
    return { supabase, failure: "not_approved" as const };
  }

  return {
    supabase,
    tournament: tournament as TournamentRow,
    failure: null,
  };
}

function failureResponse(failure: string) {
  if (failure === "unauthorized") {
    return NextResponse.json(
      { error: "Inicia sesión para continuar." },
      { status: 401 },
    );
  }
  if (failure === "not_found") {
    return NextResponse.json(
      { error: "No encontramos este torneo." },
      { status: 404 },
    );
  }
  return NextResponse.json(
    { error: "La descripción estará disponible después de aprobar el horario." },
    { status: 409 },
  );
}

async function getLatestDraft(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  tournamentId: string,
) {
  return supabase
    .from("message_drafts")
    .select("version, content")
    .eq("tournament_id", tournamentId)
    .eq("kind", "limitless_description")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json(
      { error: "No encontramos este torneo." },
      { status: 404 },
    );
  }

  try {
    const result = await getAuthenticatedTournament(id);
    if (result.failure) return failureResponse(result.failure);

    const { data: draft, error: draftError } = await getLatestDraft(
      result.supabase,
      id,
    );
    if (draftError) {
      console.error("No fue posible cargar el borrador de Limitless.");
      return NextResponse.json(
        { error: "No fue posible cargar la descripción de Limitless." },
        { status: 503 },
      );
    }

    const generation = getGeneration(result.tournament);
    const latestDraft = draft as DraftRow | null;

    return NextResponse.json(
      {
        weeklyNumber: generation.weeklyNumber,
        content: latestDraft?.content ?? generation.content ?? "",
        generationError: generation.error,
        version: latestDraft?.version ?? null,
        hasSavedDraft: latestDraft !== null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Error inesperado al cargar el borrador de Limitless:", error);
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
    return NextResponse.json(
      { error: "No encontramos este torneo." },
      { status: 404 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "No pudimos leer el borrador." },
      { status: 400 },
    );
  }

  if (
    !body ||
    typeof body !== "object" ||
    !("content" in body) ||
    typeof body.content !== "string" ||
    !body.content.trim() ||
    body.content.length > MAX_DRAFT_LENGTH ||
    !("expectedVersion" in body) ||
    (body.expectedVersion !== null &&
      (!Number.isInteger(body.expectedVersion) ||
        Number(body.expectedVersion) < 1))
  ) {
    return NextResponse.json(
      { error: "Escribe una descripción válida antes de guardar." },
      { status: 400 },
    );
  }

  try {
    const result = await getAuthenticatedTournament(id);
    if (result.failure) return failureResponse(result.failure);

    const { data: latestDraft, error: draftError } = await getLatestDraft(
      result.supabase,
      id,
    );
    if (draftError) {
      console.error("No fue posible consultar la versión del borrador Limitless.");
      return NextResponse.json(
        { error: "No fue posible guardar el borrador." },
        { status: 503 },
      );
    }

    const currentDraft = latestDraft as DraftRow | null;
    if ((currentDraft?.version ?? null) !== body.expectedVersion) {
      return NextResponse.json(
        {
          error:
            "El borrador cambió desde que lo abriste. Recarga para conservar la versión más reciente.",
        },
        { status: 409 },
      );
    }

    const generation = getGeneration(result.tournament);
    if (!generation.content && !currentDraft) {
      return NextResponse.json(
        {
          error:
            generation.error ??
            "No se pudo generar la descripción con los datos actuales del torneo.",
        },
        { status: 409 },
      );
    }

    if (currentDraft?.content === body.content) {
      return NextResponse.json({
        content: currentDraft.content,
        version: currentDraft.version,
      });
    }

    const nextVersion = (currentDraft?.version ?? 0) + 1;
    const { data: savedDraft, error: saveError } = await result.supabase
      .from("message_drafts")
      .insert({
        tournament_id: id,
        kind: "limitless_description",
        version: nextVersion,
        content: body.content,
      })
      .select("version, content")
      .single();

    if (saveError || !savedDraft) {
      console.error("No fue posible persistir una nueva versión del borrador Limitless.");
      return NextResponse.json(
        {
          error:
            "No fue posible guardar el borrador. Puede que otra sesión lo haya actualizado; recarga e inténtalo nuevamente.",
        },
        { status: 409 },
      );
    }

    return NextResponse.json({
      content: savedDraft.content,
      version: savedDraft.version,
    });
  } catch (error) {
    console.error("Error inesperado al guardar el borrador de Limitless:", error);
    return NextResponse.json(
      { error: "No fue posible conectar con el servidor." },
      { status: 503 },
    );
  }
}
