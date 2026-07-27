import type { Goal } from "@/lib/db/schema";

export interface GoalDTO {
  id: number;
  kind: string;
  name: string;
  match: string;
  createdAt: string;
}

/** Map a goal row to its API shape (target exposed as `match`, ISO timestamp). */
export function serializeGoal(row: Goal): GoalDTO {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    match: row.matchValue,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}
