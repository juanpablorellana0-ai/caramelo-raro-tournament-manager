import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function cookieName(tournamentId: string) {
  return `cr_poll_share_${tournamentId}`;
}

async function authenticatedTournament(tournamentId: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { supabase, authenticated: false as const };
  }

  const { data: tournament, error } = await supabase
    .from("tournaments")
    .select("id")
    .eq("id", tournamentId)
    .single();
  return {
    supabase,
    authenticated: true as const,
    tournament: error ? null : tournament,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: "No encontramos este torneo." }, { status: 404 });
  }

  try {
    const result = await authenticatedTournament(id);
    if (!result.authenticated) {
      return NextResponse.json({ error: "Inicia sesión para continuar." }, { status: 401 });
    }
    if (!result.tournament) {
      return NextResponse.json({ error: "No encontramos este torneo." }, { status: 404 });
    }

    const { data: poll, error } = await result.supabase
      .from("polls")
      .select("public_token_hash, status")
      .eq("tournament_id", id)
      .maybeSingle();
    if (error) {
      console.error("No fue posible consultar el enlace de la encuesta.");
      return NextResponse.json({ error: "No fue posible cargar la encuesta." }, { status: 503 });
    }

    const publicToken = request.cookies.get(cookieName(id))?.value;
    const storedHash =
      typeof poll?.public_token_hash === "string"
        ? poll.public_token_hash.replace(/^\\x/, "")
        : "";
    const sharePath =
      publicToken &&
      /^[A-Za-z0-9_-]{43}$/.test(publicToken) &&
      sha256(publicToken) === storedHash
        ? `/poll/${publicToken}`
        : null;

    return NextResponse.json({
      exists: !!poll,
      status: poll?.status ?? null,
      sharePath,
    });
  } catch (error) {
    console.error("Error inesperado al consultar el enlace de encuesta:", error);
    return NextResponse.json({ error: "No fue posible conectar con el servidor." }, { status: 503 });
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

  try {
    const result = await authenticatedTournament(id);
    if (!result.authenticated) {
      return NextResponse.json({ error: "Inicia sesión para continuar." }, { status: 401 });
    }
    if (!result.tournament) {
      return NextResponse.json({ error: "No encontramos este torneo." }, { status: 404 });
    }

    const { data: options, error: optionsError } = await result.supabase
      .from("availability_options")
      .select("id")
      .eq("tournament_id", id)
      .eq("is_active", true);
    if (optionsError) {
      console.error("No fue posible validar las opciones de la encuesta.");
      return NextResponse.json({ error: "No fue posible generar la encuesta." }, { status: 503 });
    }
    if (!options?.length) {
      return NextResponse.json(
        { error: "Guarda al menos una opción de disponibilidad antes de generar la encuesta." },
        { status: 400 },
      );
    }

    const publicToken = randomBytes(32).toString("base64url");
    const { error } = await result.supabase.rpc("create_public_poll_for_tournament", {
      p_tournament_id: id,
      p_public_token_hash_hex: sha256(publicToken),
    });
    if (error) {
      console.error("No fue posible crear la encuesta pública.");
      return NextResponse.json(
        { error: "No fue posible generar la encuesta. Puede que ya exista una para este torneo." },
        { status: 409 },
      );
    }

    const response = NextResponse.json({ sharePath: `/poll/${publicToken}` });
    response.cookies.set(cookieName(id), publicToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 60 * 60 * 24 * 365,
      path: `/api/tournaments/${id}/poll`,
    });
    return response;
  } catch (error) {
    console.error("Error inesperado al generar la encuesta:", error);
    return NextResponse.json({ error: "No fue posible conectar con el servidor." }, { status: 503 });
  }
}
