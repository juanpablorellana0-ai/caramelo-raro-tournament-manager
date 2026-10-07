"use client";

import { useEffect, useState, type FormEvent } from "react";

type TaskStatus = "pending" | "completed" | "cancelled";
type TaskKey = "publish_whatsapp" | "publish_limitless" | null;

type ManualTask = {
  id: string;
  tournament_id: string;
  title: string;
  details: string | null;
  status: TaskStatus;
  assigned_to: string | null;
  created_at: string;
  completed_at: string | null;
  task_key: TaskKey;
};

function isManualTask(value: unknown): value is ManualTask {
  if (!value || typeof value !== "object") return false;
  const task = value as Partial<ManualTask>;
  return (
    typeof task.id === "string" &&
    typeof task.tournament_id === "string" &&
    typeof task.title === "string" &&
    (task.details === null || typeof task.details === "string") &&
    (task.status === "pending" ||
      task.status === "completed" ||
      task.status === "cancelled") &&
    (task.assigned_to === null || typeof task.assigned_to === "string") &&
    typeof task.created_at === "string" &&
    (task.completed_at === null || typeof task.completed_at === "string") &&
    (task.task_key === null ||
      task.task_key === "publish_whatsapp" ||
      task.task_key === "publish_limitless")
  );
}

function errorMessage(data: unknown, fallback: string) {
  if (
    data &&
    typeof data === "object" &&
    "error" in data &&
    typeof data.error === "string"
  ) {
    return data.error;
  }
  return fallback;
}

export default function OrganizerTasks({
  tournamentId,
}: {
  tournamentId: string;
}) {
  const [tasks, setTasks] = useState<ManualTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
  const [addingTask, setAddingTask] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadTasks() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(
          `/api/tournaments/${tournamentId}/tasks`,
          { cache: "no-store" },
        );
        const data: unknown = await response.json();

        if (
          !response.ok ||
          !data ||
          typeof data !== "object" ||
          !("tasks" in data) ||
          !Array.isArray(data.tasks) ||
          !data.tasks.every(isManualTask)
        ) {
          throw new Error(
            errorMessage(data, "No fue posible cargar las tareas del torneo."),
          );
        }

        if (!cancelled) {
          setTasks(
            data.tasks
              .filter((task) => task.status !== "cancelled")
              .sort(
                (left, right) =>
                  new Date(left.created_at).getTime() -
                  new Date(right.created_at).getTime(),
              ),
          );
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "No fue posible conectar con el servidor.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadTasks();
    return () => {
      cancelled = true;
    };
  }, [tournamentId]);

  async function updateTask(task: ManualTask, status: "pending" | "completed") {
    if (updatingTaskId) return;

    const previousTask = task;
    setError("");
    setUpdatingTaskId(task.id);
    setTasks((current) =>
      current.map((item) =>
        item.id === task.id
          ? {
              ...item,
              status,
              completed_at:
                status === "completed" ? new Date().toISOString() : null,
            }
          : item,
      ),
    );

    try {
      const response = await fetch(
        `/api/tournaments/${tournamentId}/tasks/${task.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );
      const data: unknown = await response.json();

      if (
        !response.ok ||
        !data ||
        typeof data !== "object" ||
        !("task" in data) ||
        !isManualTask(data.task) ||
        data.task.id !== task.id ||
        data.task.tournament_id !== tournamentId ||
        data.task.status !== status
      ) {
        throw new Error(
          errorMessage(data, "No fue posible actualizar la tarea."),
        );
      }

      const updatedTask = data.task;
      setTasks((current) =>
        current.map((item) => (item.id === task.id ? updatedTask : item)),
      );
    } catch (updateError) {
      setTasks((current) =>
        current.map((item) => (item.id === previousTask.id ? previousTask : item)),
      );
      setError(
        updateError instanceof Error
          ? updateError.message
          : "No fue posible conectar con el servidor.",
      );
    } finally {
      setUpdatingTaskId(null);
    }
  }

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle || savingTask) return;

    setError("");
    setSavingTask(true);
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmedTitle }),
      });
      const data: unknown = await response.json();

      if (
        !response.ok ||
        !data ||
        typeof data !== "object" ||
        !("task" in data) ||
        !isManualTask(data.task) ||
        data.task.tournament_id !== tournamentId ||
        data.task.status !== "pending"
      ) {
        throw new Error(errorMessage(data, "No fue posible crear la tarea."));
      }

      const createdTask = data.task;
      setTasks((current) =>
        [...current, createdTask].sort(
          (left, right) =>
            new Date(left.created_at).getTime() -
            new Date(right.created_at).getTime(),
        ),
      );
      setTitle("");
      setAddingTask(false);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "No fue posible conectar con el servidor.",
      );
    } finally {
      setSavingTask(false);
    }
  }

  return (
    <section className="summary-panel organizer-tasks">
      <p className="eyebrow">CHECKLIST</p>
      <h2>Tareas del torneo</h2>

      {loading ? (
        <p className="poll-muted" role="status">
          Cargando tareas…
        </p>
      ) : (
        <div className="task-list">
          {tasks.map((task) => {
            const completed = task.status === "completed";
            const updating = updatingTaskId === task.id;
            return (
              <label
                className={`checkbox-row task-row${completed ? " task-row-completed" : ""}`}
                key={task.id}
              >
                <input
                  type="checkbox"
                  checked={completed}
                  disabled={updatingTaskId !== null}
                  aria-label={`${completed ? "Marcar como pendiente" : "Completar"}: ${task.title}`}
                  onChange={(event) =>
                    void updateTask(
                      task,
                      event.currentTarget.checked ? "completed" : "pending",
                    )
                  }
                />
                <span className="task-title">
                  {updating ? "Actualizando… " : ""}
                  {task.title}
                </span>
              </label>
            );
          })}
        </div>
      )}

      {error && <p className="poll-error" role="alert">{error}</p>}

      {addingTask ? (
        <form className="task-form" onSubmit={createTask}>
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Título de la tarea"
            aria-label="Título de la tarea"
            autoFocus
            disabled={savingTask}
          />
          <div className="task-form-actions">
            <button
              type="submit"
              className="button button-primary"
              disabled={!title.trim() || savingTask}
            >
              {savingTask ? "Guardando…" : "Guardar"}
            </button>
            <button
              type="button"
              className="button button-secondary"
              disabled={savingTask}
              onClick={() => {
                setAddingTask(false);
                setTitle("");
                setError("");
              }}
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          className="button button-secondary task-add-button"
          onClick={() => {
            setError("");
            setAddingTask(true);
          }}
        >
          + Agregar tarea
        </button>
      )}
    </section>
  );
}
