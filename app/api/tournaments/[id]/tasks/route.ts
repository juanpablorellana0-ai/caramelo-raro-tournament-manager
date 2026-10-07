import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TASK_STATUSES = ["pending", "completed", "cancelled"] as const;

type TaskStatus = (typeof TASK_STATUSES)[number];

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

async function getOwnedTournament(tournamentId: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { kind: "unauthorized" as const };
  }

  const { data: tournament, error } = await supabase
    .from("tournaments")
    .select("id")
    .eq("id", tournamentId)
    .eq("organizer_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("No fue posible verificar el propietario del torneo.");
    return { kind: "error" as const };
  }
  if (!tournament) return { kind: "not_found" as const };

  return { kind: "success" as const, supabase };
}

function accessFailureResponse(kind: "unauthorized" | "not_found" | "error") {
  if (kind === "unauthorized") {
    return NextResponse.json(
      { error: "Inicia sesión para continuar." },
      { status: 401 },
    );
  }
  if (kind === "not_found") {
    return NextResponse.json(
      { error: "No encontramos este torneo." },
      { status: 404 },
    );
  }
  return NextResponse.json(
    { error: "No fue posible verificar el torneo." },
    { status: 503 },
  );
}

function taskStatusOrder(status: TaskStatus) {
  if (status === "pending") return 0;
  if (status === "completed") return 1;
  return 2;
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
    const access = await getOwnedTournament(id);
    if (access.kind !== "success") {
      return accessFailureResponse(access.kind);
    }

    const { data, error } = await access.supabase
      .from("manual_tasks")
      .select(
        "id, tournament_id, title, details, status, assigned_to, created_at, completed_at, task_key",
      )
      .eq("tournament_id", id)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("No fue posible cargar las tareas del torneo.");
      return NextResponse.json(
        { error: "No fue posible cargar las tareas del torneo." },
        { status: 503 },
      );
    }

    const tasks = ((data ?? []) as ManualTask[]).sort(
      (left, right) => taskStatusOrder(left.status) - taskStatusOrder(right.status),
    );

    return NextResponse.json(
      { tasks },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Error inesperado al cargar tareas del torneo:", error);
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
      { error: "No pudimos leer los datos de la tarea." },
      { status: 400 },
    );
  }

  if (
    !body ||
    typeof body !== "object" ||
    !("title" in body) ||
    typeof body.title !== "string" ||
    !body.title.trim() ||
    ("details" in body &&
      body.details !== null &&
      typeof body.details !== "string")
  ) {
    return NextResponse.json(
      { error: "Escribe un título válido para la tarea." },
      { status: 400 },
    );
  }

  const title = body.title.trim();
  const details =
    "details" in body && typeof body.details === "string"
      ? body.details.trim() || null
      : null;

  try {
    const access = await getOwnedTournament(id);
    if (access.kind !== "success") {
      return accessFailureResponse(access.kind);
    }

    const { data: task, error } = await access.supabase
      .from("manual_tasks")
      .insert({
        tournament_id: id,
        title,
        details,
        status: "pending",
        task_key: null,
      })
      .select(
        "id, tournament_id, title, details, status, assigned_to, created_at, completed_at, task_key",
      )
      .single();

    if (error || !task) {
      console.error("No fue posible crear la tarea manual.");
      return NextResponse.json(
        { error: "No fue posible crear la tarea." },
        { status: 503 },
      );
    }

    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    console.error("Error inesperado al crear tarea manual:", error);
    return NextResponse.json(
      { error: "No fue posible conectar con el servidor." },
      { status: 503 },
    );
  }
}
