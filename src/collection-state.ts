import type { AgentReachCollectionResponse } from "./types";

export type CollectionState = {
  status: "idle" | "collecting" | "done" | "failed";
  stats: AgentReachCollectionResponse["stats"];
  failures: Array<{ title: string; reason: string }>;
  coverage: AgentReachCollectionResponse["coverage"];
  error: string;
};

export const emptyCollectionStats = (): AgentReachCollectionResponse["stats"] => ({
  queryPlannedCount: 0,
  queryExecutedCount: 0,
  searchHitCount: 0,
  uniqueHitCount: 0,
  duplicateHitCount: 0,
  existingSkippedCount: 0,
  newCandidateCount: 0,
  bodyReadCount: 0,
  questionSourceCount: 0,
  questionCount: 0,
  failureCount: 0,
});

export const idleCollectionState = (): CollectionState => ({
  status: "idle",
  stats: emptyCollectionStats(),
  failures: [],
  coverage: undefined,
  error: "",
});
