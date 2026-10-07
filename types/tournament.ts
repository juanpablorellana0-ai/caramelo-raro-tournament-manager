export type TournamentStatus =
  | "draft"
  | "collecting_availability"
  | "schedule_approved"
  | "announced"
  | "completed"
  | "cancelled";

export interface TournamentSummary {
  id: string;
  title: string;
  format: string;
  status: TournamentStatus;
  updatedAt: string;
}