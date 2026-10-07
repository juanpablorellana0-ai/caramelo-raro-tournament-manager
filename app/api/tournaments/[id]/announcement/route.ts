import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_DRAFT_LENGTH = 10_000;

type TournamentRow = {
  title: string;
  format: string;
  rules_snapshot: unknown;
  timezone: string;
  status: string;
  approved_option_id: string | null;
};

type DraftRow = {
  version: number;
  content: string;
};

function isRulesSnapshot(value: unknown): value is { game?: unknown; rules?: unknown } {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function createDefaultAnnouncement(
  tournament: TournamentRow,
  startsAt: string,
) {
  const snapshot = isRulesSnapshot(tournament.rules_snapshot)
    ? tournament.rules_snapshot
    : {};
  const rawGame = typeof snapshot.game === "string" ? snapshot.game : "";
  const game =
    rawGame === "pokemon_vgc"
      ? "Pokémon VGC"
      : rawGame === "pokemon_tcg"
        ? "Pokémon TCG"
        : rawGame.replaceAll("_", " ");
  const formatLine = [game, tournament.format].filter(Boolean).join(" · ");
  const localDate = new Intl.DateTimeFormat("es", {
    timeZone: tournament.timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(startsAt));
  const localTime = new Intl.DateTimeFormat("es", {
    timeZone: tournament.timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(startsAt));
  const rules =
    typeof snapshot.rules === "string" ? snapshot.rules.trim() : "";

  return [
    `🎮 ${tournament.title}`,
    "",
    ...(formatLine ? [`Formato: ${formatLine}`, ""] : []),
    `📅 ${localDate}`,
    `⏰ ${localTime}`,
    `🌎 Zona horaria: ${tournament.timezone}`,
    ...(rules ? ["", rules] : []),
  ].join("\n");
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
    .select("title, format, rules_snapshot, timezone, status, approved_option_id")
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

  if (!tournament.approved_option_id) {
    return { supabase, failure: "missing_option" as const };
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
  if (failure === "not_approved") {
    return NextResponse.json(
      { error: "El anuncio estará disponible después de aprobar el horario." },
      { status: 409 },
    );
  }
  return NextResponse.json(
    { error: "El torneo no tiene un horario aprobado válido." },
    { status: 409 },
  );
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

    const [{ data: option, error: optionError }, { data: draft, error: draftError }] =
      await Promise.all([
        result.supabase
          .from("availability_options")
          .select("starts_at")
          .eq("id", result.tournament.approved_option_id!)
          .eq("tournament_id", id)
          .single(),
        result.supabase
          .from("message_drafts")
          .select("version, content")
          .eq("tournament_id", id)
          .eq("kind", "final_announcement")
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

    if (optionError || !option || draftError) {
      console.error("No fue posible cargar el horario aprobado o el borrador.");
      return NextResponse.json(
        { error: "No fue posible cargar los datos del anuncio." },
        { status: 503 },
      );
    }

    const latestDraft = draft as DraftRow | null;
    return NextResponse.json(
      {
        tournament: {
          title: result.tournament.title,
          format: result.tournament.format,
          game:
            isRulesSnapshot(result.tournament.rules_snapshot) &&
            typeof result.tournament.rules_snapshot.game === "string"
              ? result.tournament.rules_snapshot.game
              : "",
          rules:
            isRulesSnapshot(result.tournament.rules_snapshot) &&
            typeof result.tournament.rules_snapshot.rules === "string"
              ? result.tournament.rules_snapshot.rules
              : "",
          timeZone: result.tournament.timezone,
          startsAt: option.starts_at,
        },
        content:
          latestDraft?.content ??
          createDefaultAnnouncement(result.tournament, option.starts_at),
        version: latestDraft?.version ?? null,
        hasSavedDraft: latestDraft !== null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Error inesperado al cargar el borrador del anuncio:", error);
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
      (!Number.isInteger(body.expectedVersion) || Number(body.expectedVersion) < 1))
  ) {
    return NextResponse.json(
      { error: "Escribe un mensaje válido antes de guardar." },
      { status: 400 },
    );
  }

  try {
    const result = await getAuthenticatedTournament(id);
    if (result.failure) return failureResponse(result.failure);

    const { data: latestDraft, error: draftError } = await result.supabase
      .from("message_drafts")
      .select("version, content")
      .eq("tournament_id", id)
      .eq("kind", "final_announcement")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (draftError) {
      console.error("No fue posible consultar la versión del borrador.");
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
        kind: "final_announcement",
        version: nextVersion,
        content: body.content,
      })
      .select("version, content")
      .single();

    if (saveError || !savedDraft) {
      console.error("No fue posible persistir una nueva versión del borrador.");
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
    console.error("Error inesperado al guardar el borrador del anuncio:", error);
    return NextResponse.json(
      { error: "No fue posible conectar con el servidor." },
      { status: 503 },
    );
  }
}
