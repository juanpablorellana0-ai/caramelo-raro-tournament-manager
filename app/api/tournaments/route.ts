import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type CreateTournamentBody = {
  name: string;
  game: string;
  format: string;
  rules: string;
};

export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "No estás autenticado." },
        { status: 401 },
      );
    }

    const body = (await request.json()) as CreateTournamentBody;

    const name = body.name?.trim();
    const game = body.game?.trim();
    const format = body.format?.trim();
    const rules = body.rules?.trim();

    if (!name || !game || !format || !rules) {
      return NextResponse.json(
        { error: "Todos los campos son obligatorios." },
        { status: 400 },
      );
    }

    const { data: organizer, error: organizerError } = await supabase
      .from("organizers")
      .select("id, default_timezone")
      .eq("id", user.id)
      .single();

    if (organizerError || !organizer) {
      return NextResponse.json(
        { error: "No se encontró el perfil del organizador." },
        { status: 403 },
      );
    }

    const { data: tournament, error: tournamentError } = await supabase
      .from("tournaments")
      .insert({
        organizer_id: organizer.id,
        title: name,
        format,
        rules_snapshot: {
          game,
          rules,
        },
        timezone: organizer.default_timezone,
      })
      .select("id, title, format, status, timezone, rules_snapshot")
      .single();

    if (tournamentError) {
      console.error("Error al crear torneo:", tournamentError);

      return NextResponse.json(
        { error: "No fue posible crear el torneo." },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { tournament },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error inesperado al crear torneo:", error);

    return NextResponse.json(
      { error: "Ocurrió un error inesperado." },
      { status: 500 },
    );
  }
}