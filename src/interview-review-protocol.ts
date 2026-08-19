export const INTERVIEW_REVIEW_SCHEMA_VERSION = "interview.evidence-review.v1" as const;

export type ReviewSourceKind = "jd" | "resume" | "interview_experience" | "user_answer" | "project" | "transcript";
export type ReviewProvenance = "material_fact" | "user_confirmed" | "user_claim_unverified" | "coach_inference" | "unknown";
export type ReviewConfidence = "high" | "medium" | "low";
export type EvidenceSignalStatus = "demonstrated" | "emerging" | "unresolved" | "contradicted";
export type JdConnectionStatus = "direct" | "partial" | "unresolved" | "contradicted";
export type ExperienceEvidenceStatus = "demonstrated" | "partial" | "not_shown" | "not_applicable";
export type FollowUpIntent = "why" | "alternatives" | "metric_validity" | "personal_contribution" | "tradeoff" | "counterfactual" | "failure_learning" | "stakeholder_tension";

export type ReviewSource = {
  id: string;
  kind: ReviewSourceKind;
  title: string;
  targetKey: string;
  provenance: ReviewProvenance;
  locator?: string;
};

export type ReviewSourceRef = {
  sourceId: string;
  locator?: string;
  quote?: string;
};

export type ReviewObservation = {
  id: string;
  observation: string;
  impact: string;
  confidence: ReviewConfidence;
  sourceRefs: ReviewSourceRef[];
  nextAction: string;
};

export type PresentedEvidence = ReviewObservation & {
  capabilitySignal: string;
  status: Extract<EvidenceSignalStatus, "demonstrated" | "emerging">;
};

export type MissingFact = ReviewObservation & {
  status: "unresolved";
};

export type CommunicationIssue = ReviewObservation & {
  issueType: "relevance" | "ordering" | "density" | "clarity" | "terminology" | "other";
};

export type StrategyRisk = ReviewObservation & {
  riskType: "judgment" | "prioritization" | "tradeoff" | "stakeholder" | "confidentiality" | "unsupported_certainty" | "target_mismatch" | "other";
};

export type JdConnection = ReviewObservation & {
  jdRequirement: string;
  status: JdConnectionStatus;
  /** Conditional check: whether the answer actively uses personal experience to evidence the JD capability. */
  experienceEvidence: ExperienceEvidenceStatus;
};

export type PriorityImprovement = {
  observation: string;
  action: string;
  retryConstraint: string;
  successSignal: string;
  sourceRefs: ReviewSourceRef[];
  relatedObservationIds: string[];
};

export type NextFollowUp = {
  question: string;
  intent: FollowUpIntent;
  testsSignal: string;
  origin: "coach_generated" | "source_derived" | "source_question" | "user_requested";
  sourceRefs: ReviewSourceRef[];
};

export type EvidenceReviewV1 = {
  schemaVersion: typeof INTERVIEW_REVIEW_SCHEMA_VERSION;
  reviewId: string;
  generatedAt: string;
  target: {
    key: string;
    company: string;
    role: string;
    direction?: string;
  };
  question: {
    id: string;
    text: string;
    origin: NextFollowUp["origin"];
    sourceRefs: ReviewSourceRef[];
  };
  sourceLedger: ReviewSource[];
  presentedEvidence: PresentedEvidence[];
  missingFacts: MissingFact[];
  communicationIssues: CommunicationIssue[];
  strategyRisks: StrategyRisk[];
  jdConnections: JdConnection[];
  priorityImprovement: PriorityImprovement;
  nextFollowUp: NextFollowUp;
  limitations: string[];
};

export class ReviewProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReviewProtocolError";
  }
}

const SOURCE_KINDS = new Set<ReviewSourceKind>(["jd", "resume", "interview_experience", "user_answer", "project", "transcript"]);
const PROVENANCE = new Set<ReviewProvenance>(["material_fact", "user_confirmed", "user_claim_unverified", "coach_inference", "unknown"]);
const CONFIDENCE = new Set<ReviewConfidence>(["high", "medium", "low"]);
const FOLLOW_UP_INTENTS = new Set<FollowUpIntent>(["why", "alternatives", "metric_validity", "personal_contribution", "tradeoff", "counterfactual", "failure_learning", "stakeholder_tension"]);
const QUESTION_ORIGINS = new Set<NextFollowUp["origin"]>(["coach_generated", "source_derived", "source_question", "user_requested"]);
const JD_STATUSES = new Set<JdConnectionStatus>(["direct", "partial", "unresolved", "contradicted"]);
const EXPERIENCE_EVIDENCE_STATUSES = new Set<ExperienceEvidenceStatus>(["demonstrated", "partial", "not_shown", "not_applicable"]);
const COMMUNICATION_TYPES = new Set<CommunicationIssue["issueType"]>(["relevance", "ordering", "density", "clarity", "terminology", "other"]);
const STRATEGY_TYPES = new Set<StrategyRisk["riskType"]>(["judgment", "prioritization", "tradeoff", "stakeholder", "confidentiality", "unsupported_certainty", "target_mismatch", "other"]);

const record = (value: unknown, path: string) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ReviewProtocolError(`${path} 必须是对象。`);
  return value as Record<string, unknown>;
};

const text = (value: unknown, path: string, maximum = 2_000) => {
  if (typeof value !== "string" || !value.trim()) throw new ReviewProtocolError(`${path} 不能为空。`);
  const normalized = value.trim();
  if (normalized.length > maximum) throw new ReviewProtocolError(`${path} 不能超过 ${maximum} 个字符。`);
  return normalized;
};

const optionalText = (value: unknown, path: string, maximum = 500) => value === undefined ? undefined : text(value, path, maximum);

const list = (value: unknown, path: string, maximum = 20) => {
  if (!Array.isArray(value)) throw new ReviewProtocolError(`${path} 必须是数组。`);
  if (value.length > maximum) throw new ReviewProtocolError(`${path} 最多包含 ${maximum} 项。`);
  return value;
};

const enumValue = <T extends string>(value: unknown, allowed: Set<T>, path: string) => {
  if (typeof value !== "string" || !allowed.has(value as T)) throw new ReviewProtocolError(`${path} 的枚举值无效。`);
  return value as T;
};

const validateReview = (value: unknown): EvidenceReviewV1 => {
  const root = record(value, "review");
  if (root.schemaVersion !== INTERVIEW_REVIEW_SCHEMA_VERSION) throw new ReviewProtocolError("schemaVersion 不受支持。");

  const targetRaw = record(root.target, "target");
  const target = {
    key: text(targetRaw.key, "target.key", 240),
    company: text(targetRaw.company, "target.company", 80),
    role: text(targetRaw.role, "target.role", 120),
    direction: optionalText(targetRaw.direction, "target.direction", 120),
  };

  const sourceIds = new Set<string>();
  const sourceKinds = new Map<string, ReviewSourceKind>();
  const sourceLedger = list(root.sourceLedger, "sourceLedger", 40).map((item, index): ReviewSource => {
    const source = record(item, `sourceLedger[${index}]`);
    const id = text(source.id, `sourceLedger[${index}].id`, 80);
    if (sourceIds.has(id)) throw new ReviewProtocolError(`sourceLedger 中存在重复来源 ID：${id}。`);
    sourceIds.add(id);
    const kind = enumValue(source.kind, SOURCE_KINDS, `sourceLedger[${index}].kind`);
    sourceKinds.set(id, kind);
    const targetKey = text(source.targetKey, `sourceLedger[${index}].targetKey`, 240);
    if (targetKey !== target.key) throw new ReviewProtocolError(`来源 ${id} 不属于当前 target key。`);
    return {
      id,
      kind,
      title: text(source.title, `sourceLedger[${index}].title`, 240),
      targetKey,
      provenance: enumValue(source.provenance, PROVENANCE, `sourceLedger[${index}].provenance`),
      locator: optionalText(source.locator, `sourceLedger[${index}].locator`, 500),
    };
  });
  if (!sourceLedger.length) throw new ReviewProtocolError("sourceLedger 至少需要一条来源。");

  const refs = (value: unknown, path: string) => {
    const items = list(value, path, 12).map((item, index): ReviewSourceRef => {
      const ref = record(item, `${path}[${index}]`);
      const sourceId = text(ref.sourceId, `${path}[${index}].sourceId`, 80);
      if (!sourceIds.has(sourceId)) throw new ReviewProtocolError(`${path} 引用了不存在的来源 ${sourceId}。`);
      return {
        sourceId,
        locator: optionalText(ref.locator, `${path}[${index}].locator`, 500),
        quote: optionalText(ref.quote, `${path}[${index}].quote`, 500),
      };
    });
    if (!items.length) throw new ReviewProtocolError(`${path} 至少需要一条材料来源。`);
    return items;
  };

  const observationIds = new Set<string>();
  const observation = (value: unknown, path: string): ReviewObservation => {
    const item = record(value, path);
    const id = text(item.id, `${path}.id`, 80);
    if (observationIds.has(id)) throw new ReviewProtocolError(`存在重复观察 ID：${id}。`);
    observationIds.add(id);
    return {
      id,
      observation: text(item.observation, `${path}.observation`),
      impact: text(item.impact, `${path}.impact`, 1_000),
      confidence: enumValue(item.confidence, CONFIDENCE, `${path}.confidence`),
      sourceRefs: refs(item.sourceRefs, `${path}.sourceRefs`),
      nextAction: text(item.nextAction, `${path}.nextAction`, 1_000),
    };
  };

  const presentedEvidence = list(root.presentedEvidence, "presentedEvidence").map((item, index): PresentedEvidence => {
    const raw = record(item, `presentedEvidence[${index}]`);
    const base = observation(raw, `presentedEvidence[${index}]`);
    const status = enumValue(raw.status, new Set<PresentedEvidence["status"]>(["demonstrated", "emerging"]), `presentedEvidence[${index}].status`);
    return { ...base, capabilitySignal: text(raw.capabilitySignal, `presentedEvidence[${index}].capabilitySignal`, 300), status };
  });

  const missingFacts = list(root.missingFacts, "missingFacts").map((item, index): MissingFact => {
    const raw = record(item, `missingFacts[${index}]`);
    if (raw.status !== "unresolved") throw new ReviewProtocolError(`missingFacts[${index}].status 必须是 unresolved。`);
    return { ...observation(raw, `missingFacts[${index}]`), status: "unresolved" };
  });

  const communicationIssues = list(root.communicationIssues, "communicationIssues").map((item, index): CommunicationIssue => {
    const raw = record(item, `communicationIssues[${index}]`);
    return { ...observation(raw, `communicationIssues[${index}]`), issueType: enumValue(raw.issueType, COMMUNICATION_TYPES, `communicationIssues[${index}].issueType`) };
  });

  const strategyRisks = list(root.strategyRisks, "strategyRisks").map((item, index): StrategyRisk => {
    const raw = record(item, `strategyRisks[${index}]`);
    return { ...observation(raw, `strategyRisks[${index}]`), riskType: enumValue(raw.riskType, STRATEGY_TYPES, `strategyRisks[${index}].riskType`) };
  });

  const jdConnections = list(root.jdConnections, "jdConnections").map((item, index): JdConnection => {
    const raw = record(item, `jdConnections[${index}]`);
    const result = {
      ...observation(raw, `jdConnections[${index}]`),
      jdRequirement: text(raw.jdRequirement, `jdConnections[${index}].jdRequirement`, 1_000),
      status: enumValue(raw.status, JD_STATUSES, `jdConnections[${index}].status`),
      experienceEvidence: enumValue(raw.experienceEvidence ?? "not_shown", EXPERIENCE_EVIDENCE_STATUSES, `jdConnections[${index}].experienceEvidence`),
    };
    if (!result.sourceRefs.some((ref) => sourceKinds.get(ref.sourceId) === "jd")) throw new ReviewProtocolError(`jdConnections[${index}] 必须引用 JD 来源。`);
    if (!result.sourceRefs.some((ref) => sourceKinds.get(ref.sourceId) !== "jd")) throw new ReviewProtocolError(`jdConnections[${index}] 必须同时引用候选人材料或回答来源。`);
    return result;
  });

  const questionRaw = record(root.question, "question");
  const question = {
    id: text(questionRaw.id, "question.id", 80),
    text: text(questionRaw.text, "question.text", 1_000),
    origin: enumValue(questionRaw.origin, QUESTION_ORIGINS, "question.origin"),
    sourceRefs: refs(questionRaw.sourceRefs, "question.sourceRefs"),
  };

  const priorityRaw = record(root.priorityImprovement, "priorityImprovement");
  const relatedObservationIds = list(priorityRaw.relatedObservationIds, "priorityImprovement.relatedObservationIds", 10)
    .map((item, index) => text(item, `priorityImprovement.relatedObservationIds[${index}]`, 80));
  if (!relatedObservationIds.length) throw new ReviewProtocolError("priorityImprovement 必须关联至少一条观察。 ");
  relatedObservationIds.forEach((id) => {
    if (!observationIds.has(id)) throw new ReviewProtocolError(`priorityImprovement 引用了不存在的观察 ${id}。`);
  });
  const priorityImprovement: PriorityImprovement = {
    observation: text(priorityRaw.observation, "priorityImprovement.observation", 1_000),
    action: text(priorityRaw.action, "priorityImprovement.action", 1_000),
    retryConstraint: text(priorityRaw.retryConstraint, "priorityImprovement.retryConstraint", 500),
    successSignal: text(priorityRaw.successSignal, "priorityImprovement.successSignal", 500),
    sourceRefs: refs(priorityRaw.sourceRefs, "priorityImprovement.sourceRefs"),
    relatedObservationIds,
  };

  const nextRaw = record(root.nextFollowUp, "nextFollowUp");
  const nextFollowUp: NextFollowUp = {
    question: text(nextRaw.question, "nextFollowUp.question", 1_000),
    intent: enumValue(nextRaw.intent, FOLLOW_UP_INTENTS, "nextFollowUp.intent"),
    testsSignal: text(nextRaw.testsSignal, "nextFollowUp.testsSignal", 500),
    origin: enumValue(nextRaw.origin, QUESTION_ORIGINS, "nextFollowUp.origin"),
    sourceRefs: refs(nextRaw.sourceRefs, "nextFollowUp.sourceRefs"),
  };

  return {
    schemaVersion: INTERVIEW_REVIEW_SCHEMA_VERSION,
    reviewId: text(root.reviewId, "reviewId", 80),
    generatedAt: text(root.generatedAt, "generatedAt", 80),
    target,
    question,
    sourceLedger,
    presentedEvidence,
    missingFacts,
    communicationIssues,
    strategyRisks,
    jdConnections,
    priorityImprovement,
    nextFollowUp,
    limitations: list(root.limitations, "limitations", 10).map((item, index) => text(item, `limitations[${index}]`, 1_000)),
  };
};

export function parseEvidenceReview(value: unknown): EvidenceReviewV1 {
  return validateReview(value);
}
