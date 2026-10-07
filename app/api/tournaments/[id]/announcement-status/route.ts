import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type AnnouncementResult = {
  id: string;
  status: "announced";
  announced_at: string;
};

function isAnnouncementResult(value: unknown): value is AnnouncementResult {
  return (
    !!value &&
    typeof value === "object" &&
    "id" in value &&
    typeof value.id === "string" &&
    "status" in value &&
    value.status === "announced" &&
    "announced_at" in value &&
    typeof value.announced_at === "string"
  );
}

export async function POST(
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
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Inicia sesión para continuar." },
        { status: 401 },
      );
    }

    const { data, error } = await supabase.rpc(
      "mark_tournament_announced",
      { p_tournament_id: id },
    );

    if (error) {
      if (error.code === "42501") {
        return NextResponse.json(
          { error: "No encontramos el torneo o no tienes permiso para modificarlo." },
          { status: 404 },
        );
      }
      if (error.code === "55000") {
        return NextResponse.json(
          {
            error:
              "Solo puedes marcar como anunciado un torneo con horario aprobado.",
          },
          { status: 409 },
        );
      }

      console.error("No fue posible marcar el torneo como anunciado.");
      return NextResponse.json(
        { error: "No fue posible actualizar el estado del torneo." },
        { status: 503 },
      );
    }

    if (!isAnnouncementResult(data) || data.id !== id) {
      console.error("La RPC devolvió un resultado de anuncio inválido.");
      return NextResponse.json(
        { error: "No fue posible confirmar el estado actualizado del torneo." },
        { status: 503 },
      );
    }

    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Error inesperado al marcar el torneo como anunciado:", error);
    return NextResponse.json(
      { error: "No fue posible conectar con el servidor." },
      { status: 503 },
    );
  }
}
