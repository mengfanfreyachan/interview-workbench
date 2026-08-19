import type { ExperienceDraft, ExperienceLibrary, ExperienceSource, ExperienceTarget } from "./types";

const normalizeTargetPart = (value: string) => value
  .normalize("NFKC")
  .toLocaleLowerCase("zh-CN")
  .replace(/\s+/g, " ")
  .trim();

export const createTargetKey = (company: string, role: string) => `${normalizeTargetPart(company)}::${normalizeTargetPart(role)}`;

export const createExperienceTarget = (company: string, role: string): ExperienceTarget => ({
  company: company.trim(),
  role: role.trim(),
  key: createTargetKey(company, role),
});

export const sourceMatchesTarget = (source: ExperienceSource, target: ExperienceTarget) => source.target?.key === target.key;

export const partitionSourcesByTarget = (sources: ExperienceSource[], target: ExperienceTarget) => ({
  current: sources.filter((source) => sourceMatchesTarget(source, target)),
  other: sources.filter((source) => source.target && !sourceMatchesTarget(source, target)),
  unassigned: sources.filter((source) => !source.target),
});

export const deduplicateSources = (sources: ExperienceSource[]) => {
  const merged = new Map<string, ExperienceSource>();
  sources.forEach((source) => {
    const locator = source.url.trim() ? `url:${source.url.trim()}` : `title:${source.title.trim()}`;
    const key = `${source.target?.key ?? "unassigned"}|${locator}`;
    const existing = merged.get(key);
    if (!existing) return void merged.set(key, source);

    const existingScore = existing.questions.length * 10_000 + existing.excerpt.length;
    const incomingScore = source.questions.length * 10_000 + source.excerpt.length;
    const richer = incomingScore >= existingScore ? source : existing;
    const questions = [...new Set([...richer.questions, ...(richer === source ? existing.questions : source.questions)])];
    merged.set(key, {
      ...richer,
      id: existing.id,
      questions,
      questionParserVersion: richer.questionParserVersion ?? existing.questionParserVersion,
    });
  });
  return [...merged.values()];
};

export const upsertExperienceLibrary = (
  libraries: Record<string, ExperienceLibrary>,
  target: ExperienceTarget,
  updatedAt: string,
) => {
  if (!target.key || !target.company || !target.role) return libraries;
  const existing = libraries[target.key];
  return {
    ...libraries,
    [target.key]: {
      id: target.key,
      target,
      createdAt: existing?.createdAt ?? updatedAt,
      updatedAt,
    },
  };
};

export const deriveExperienceLibraries = (
  sources: ExperienceSource[],
  drafts: Record<string, ExperienceDraft>,
  updatedAt: string,
) => {
  let libraries: Record<string, ExperienceLibrary> = {};
  sources.forEach((source) => {
    if (source.target) libraries = upsertExperienceLibrary(libraries, source.target, updatedAt);
  });
  Object.values(drafts).forEach((draft) => {
    if (draft.text.trim()) libraries = upsertExperienceLibrary(libraries, draft.target, updatedAt);
  });
  return libraries;
};
