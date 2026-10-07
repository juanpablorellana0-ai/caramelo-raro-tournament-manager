import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type PublicPoll = {
  title: string;
  game: string;
  format: string;
  rules: string;
  time_zone: string;
  is_open: boolean;
  closure_reason:
    | "schedule_confirmed"
    | "completed"
    | "cancelled"
    | "poll_closed"
    | "not_open_yet"
    | "poll_expired"
    | "no_active_options"
    | null;
  options: { id: string; starts_at: string }[];
  has_response: boolean;
  selected_option_ids: string[];
};

type SubmissionResult = {
  result:
    | "submitted"
    | "updated"
    | "already_submitted"
    | "response_not_found"
    | "closed"
    | "not_found"
    | "invalid_options";
  selected_option_ids?: string[];
};

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function cookieName(tokenHash: string) {
  return `cr_participant_${tokenHash.slice(0, 20)}`;
}

function publicError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function isPublicPoll(value: unknown): value is PublicPoll {
  if (!value || typeof value !== "object") {
    return false;
  }
  const poll = value as Partial<PublicPoll>;
  return (
    typeof poll.title === "string" &&
    typeof poll.game === "string" &&
    typeof poll.format === "string" &&
    typeof poll.rules === "string" &&
    typeof poll.time_zone === "string" &&
    typeof poll.is_open === "boolean" &&
    (poll.closure_reason === null ||
      poll.closure_reason === "schedule_confirmed" ||
      poll.closure_reason === "completed" ||
      poll.closure_reason === "cancelled" ||
      poll.closure_reason === "poll_closed" ||
      poll.closure_reason === "not_open_yet" ||
      poll.closure_reason === "poll_expired" ||
      poll.closure_reason === "no_active_options") &&
    Array.isArray(poll.options) &&
    typeof poll.has_response === "boolean" &&
    Array.isArray(poll.selected_option_ids)
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!TOKEN_PATTERN.test(token)) {
    return publicError("No encontramos esta encuesta.", 404);
  }

  const pollHash = sha256(token);
  const name = cookieName(pollHash);
  const storedToken = request.cookies.get(name)?.value;
  const participantToken =
    storedToken && TOKEN_PATTERN.test(storedToken)
      ? storedToken
      : randomBytes(32).toString("base64url");

  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase.rpc("get_public_poll", {
      p_public_token_hash_hex: pollHash,
      p_participant_token_hash_hex: sha256(participantToken),
    });

    if (error) {
      console.error("No fue posible cargar la encuesta pública.");
      return publicError("No fue posible conectar con la encuesta.", 503);
    }

    if (!isPublicPoll(data)) {
      return publicError("No encontramos esta encuesta.", 404);
    }

    const response = NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
    if (participantToken !== storedToken) {
      response.cookies.set(name, participantToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 60 * 60 * 24 * 365,
        path: `/api/polls/${token}`,
      });
    }
    return response;
  } catch (error) {
    console.error("Error inesperado al cargar la encuesta:", error);
    return publicError("No fue posible conectar con la encuesta.", 503);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!TOKEN_PATTERN.test(token)) {
    return publicError("No encontramos esta encuesta.", 404);
  }

  const participantToken = request.cookies.get(cookieName(sha256(token)))?.value;
  if (!participantToken || !TOKEN_PATTERN.test(participantToken)) {
    return publicError("Vuelve a cargar la encuesta e inténtalo nuevamente.", 409);
  }

  let parsedBody: unknown;
  try {
    parsedBody = await request.json();
  } catch {
    return publicError("No pudimos leer tu respuesta. Inténtalo nuevamente.", 400);
  }
  if (!parsedBody || typeof parsedBody !== "object") {
    return publicError("Selecciona al menos un horario válido.", 400);
  }
  const body = parsedBody as { optionIds?: unknown; action?: unknown };

  if (
    (body.action !== "submit" && body.action !== "update") ||
    !Array.isArray(body.optionIds) ||
    body.optionIds.length < 1 ||
    body.optionIds.length > 14 ||
    !body.optionIds.every(
      (optionId): optionId is string =>
        typeof optionId === "string" && UUID_PATTERN.test(optionId),
    ) ||
    new Set(body.optionIds).size !== body.optionIds.length
  ) {
    return publicError("Selecciona al menos un horario válido.", 400);
  }

  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase.rpc("submit_public_poll_response", {
      p_public_token_hash_hex: sha256(token),
      p_participant_token_hash_hex: sha256(participantToken),
      p_option_ids: body.optionIds,
      p_action: body.action,
    });

    if (error) {
      console.error("No fue posible guardar la respuesta de la encuesta.");
      return publicError("No fue posible guardar tu respuesta. Inténtalo nuevamente.", 503);
    }

    const result = data as SubmissionResult | null;
    if (!result || typeof result.result !== "string") {
      return publicError("No fue posible guardar tu respuesta. Inténtalo nuevamente.", 503);
    }

    if (result.result === "closed") {
      return publicError("Esta encuesta ya no está disponible.", 410);
    }
    if (result.result === "not_found") {
      return publicError("No encontramos esta encuesta.", 404);
    }
    if (result.result === "invalid_options") {
      return publicError("Revisa los horarios seleccionados e inténtalo nuevamente.", 400);
    }
    if (result.result === "response_not_found") {
      return publicError("No encontramos una respuesta para modificar en este dispositivo.", 409);
    }

    return NextResponse.json({
      result: result.result,
      selectedOptionIds: result.selected_option_ids ?? body.optionIds,
    });
  } catch (error) {
    console.error("Error inesperado al guardar la respuesta:", error);
    return publicError("No fue posible guardar tu respuesta. Inténtalo nuevamente.", 503);
  }
}
