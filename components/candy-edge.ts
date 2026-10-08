import type { PointerEvent } from "react";

export function updateCandyEdge(event: PointerEvent<HTMLElement>) {
  if (event.pointerType !== "mouse") return;

  const target = event.target;
  if (!(target instanceof Element)) return;

  const surface = target.closest<HTMLElement>(".candy-edge");
  if (!surface || !event.currentTarget.contains(surface)) return;

  const bounds = surface.getBoundingClientRect();
  surface.style.setProperty("--candy-edge-x", `${event.clientX - bounds.left}px`);
  surface.style.setProperty("--candy-edge-y", `${event.clientY - bounds.top}px`);
}
