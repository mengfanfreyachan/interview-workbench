import { requestJson } from "./api-client";
import type { AgentReachCollectionResponse, AgentReachSourceReindexResponse } from "./types";

export type AgentReachCollectionInput = {
  query: string;
  limit: number;
  existingUrls: string[];
  company: string;
  role: string;
  searchMode: "exact" | "fuzzy";
};

export const collectXiaohongshuExperience = (input: AgentReachCollectionInput, signal: AbortSignal) => requestJson<AgentReachCollectionResponse>(
  "/api/agent-reach/xiaohongshu",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal,
  },
  "本地采集桥接返回失败。",
);

export const reindexXiaohongshuSources = (
  sources: Array<{ title: string; url: string }>,
  signal: AbortSignal,
) => requestJson<AgentReachSourceReindexResponse>(
  "/api/agent-reach/xiaohongshu/reindex",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sources }),
    signal,
  },
  "本地来源重新识别返回失败。",
);
