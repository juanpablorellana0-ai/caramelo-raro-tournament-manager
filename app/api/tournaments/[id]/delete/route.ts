import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type DeleteResult = {
  id: string;
  deleted: true;
};

function isDeleteResult(value: unknown): value is DeleteResult {
  return (
    !!value &&
    typeof value === "object" &&
    "id" in value &&
    typeof value.id === "string" &&
    "deleted" in value &&
    value.deleted === true
  );
}

export async function DELETE(
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

    const { data, error } = await supabase.rpc("delete_tournament", {
      p_tournament_id: id,
    });

    if (error) {
      if (error.code === "42501") {
        return NextResponse.json(
          {
            error:
              "No encontramos el torneo o no tienes permiso para eliminarlo.",
          },
          { status: 404 },
        );
      }
      if (error.code === "55000") {
        return NextResponse.json(
          {
            error:
              "Solo se pueden eliminar torneos en borrador o recopilando disponibilidad.",
          },
          { status: 409 },
        );
      }

      console.error("No fue posible eliminar el torneo.");
      return NextResponse.json(
        { error: "No fue posible eliminar el torneo." },
        { status: 503 },
      );
    }

    if (!isDeleteResult(data) || data.id !== id) {
      console.error("La RPC devolvió un resultado de eliminación inválido.");
      return NextResponse.json(
        { error: "No fue posible confirmar la eliminación del torneo." },
        { status: 503 },
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error inesperado al eliminar el torneo:", error);
    return NextResponse.json(
      { error: "No fue posible conectar con el servidor." },
      { status: 503 },
    );
  }
}
