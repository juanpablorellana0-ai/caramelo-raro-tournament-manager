import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type TaskStatus = "pending" | "completed";

type ManualTask = {
  id: string;
  tournament_id: string;
  title: string;
  details: string | null;
  status: TaskStatus;
  assigned_to: string | null;
  created_at: string;
  completed_at: string | null;
  task_key: "publish_whatsapp" | "publish_limitless" | null;
};

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  const { id, taskId } = await params;
  if (!UUID_PATTERN.test(id) || !UUID_PATTERN.test(taskId)) {
    return NextResponse.json(
      { error: "No encontramos la tarea solicitada." },
      { status: 404 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "No pudimos leer el estado de la tarea." },
      { status: 400 },
    );
  }

  if (
    !body ||
    typeof body !== "object" ||
    !("status" in body) ||
    (body.status !== "pending" && body.status !== "completed")
  ) {
    return NextResponse.json(
      { error: "El estado debe ser pending o completed." },
      { status: 400 },
    );
  }

  const status: TaskStatus = body.status;
  const completedAt = status === "completed" ? new Date().toISOString() : null;

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

    const { data: tournament, error: tournamentError } = await supabase
      .from("tournaments")
      .select("id")
      .eq("id", id)
      .eq("organizer_id", user.id)
      .maybeSingle();

    if (tournamentError) {
      console.error("No fue posible verificar el propietario del torneo.");
      return NextResponse.json(
        { error: "No fue posible verificar el torneo." },
        { status: 503 },
      );
    }
    if (!tournament) {
      return NextResponse.json(
        { error: "No encontramos este torneo." },
        { status: 404 },
      );
    }

    const { data: task, error } = await supabase
      .from("manual_tasks")
      .update({
        status,
        completed_at: completedAt,
      })
      .eq("id", taskId)
      .eq("tournament_id", id)
      .in("status", ["pending", "completed"])
      .select(
        "id, tournament_id, title, details, status, assigned_to, created_at, completed_at, task_key",
      )
      .maybeSingle();

    if (error) {
      console.error("No fue posible actualizar la tarea del torneo.");
      return NextResponse.json(
        { error: "No fue posible actualizar la tarea." },
        { status: 503 },
      );
    }
    if (!task) {
      return NextResponse.json(
        { error: "No encontramos una tarea pendiente o completada de este torneo." },
        { status: 404 },
      );
    }

    return NextResponse.json({ task: task as ManualTask });
  } catch (error) {
    console.error("Error inesperado al actualizar la tarea del torneo:", error);
    return NextResponse.json(
      { error: "No fue posible conectar con el servidor." },
      { status: 503 },
    );
  }
}
