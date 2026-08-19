export type SearchMode = "exact" | "fuzzy";

export const SEARCH_MODE_COPY: Record<SearchMode, { label: string; summary: string }> = {
  exact: {
    label: "精确搜索",
    summary: "公司与完整岗位名都保留，优先找同名岗位面经。",
  },
  fuzzy: {
    label: "模糊搜索",
    summary: "公司不变，把岗位放宽到同一岗位族，适合精确结果不足时。",
  },
};

const collapseWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

export const fuzzyRoleFamily = (role: string) => {
  const original = collapseWhitespace(role);
  const normalized = original
    .replace(/[（(][^）)]*[）)]/g, " ")
    .replace(/(?:20\d{2}|\d{2})\s*届/g, " ")
    .replace(/(?:春招|秋招|校招|社招|暑期|日常|应届|留学生|北京|上海|深圳|广州|杭州|成都|武汉|南京)/g, " ")
    .replace(/(?:高级|资深|初级|中级|专家|负责人|主管|经理级|实习生|实习)/g, " ")
    .replace(/[\/_｜|·—-]+/g, " ");

  const compact = normalized.replace(/\s+/g, "");
  const hasAi = /(?:大模型|人工智能|生成式|AIGC|LLM|AI)/i.test(original);

  if (/(?:法务|法律|律师|知识产权|合规)/.test(compact)) return /合规/.test(compact) && !/(?:法务|法律|律师)/.test(compact) ? "合规" : "法务";
  if (hasAi && /(?:产品经理|产品岗|产品)/.test(compact)) return "AI 产品经理";
  if (/产品运营/.test(compact)) return "产品运营";
  if (/(?:产品经理|产品岗)/.test(compact)) return "产品经理";
  if (/(?:用户运营|内容运营|社区运营|活动运营|商家运营|增长运营|策略运营)/.test(compact)) return compact.match(/(?:用户运营|内容运营|社区运营|活动运营|商家运营|增长运营|策略运营)/)?.[0] ?? "运营";
  if (/运营/.test(compact)) return "运营";
  if (/(?:算法|机器学习|深度学习|NLP|自然语言|计算机视觉)/i.test(compact)) return "算法工程师";
  if (/(?:前端|后端|客户端|服务端|全栈|软件开发|研发工程师)/.test(compact)) return compact.match(/(?:前端|后端|客户端|服务端|全栈)/)?.[0] ? `${compact.match(/(?:前端|后端|客户端|服务端|全栈)/)?.[0]}工程师` : "研发工程师";
  if (/(?:市场|品牌|营销|公关)/.test(compact)) return compact.match(/(?:市场|品牌|营销|公关)/)?.[0] ?? "市场营销";
  if (/(?:销售|商务|客户成功)/.test(compact)) return compact.match(/(?:客户成功|销售|商务)/)?.[0] ?? "销售";
  if (/(?:人力资源|招聘|HRBP|HR)/i.test(compact)) return /招聘/.test(compact) ? "招聘" : "人力资源";
  if (/(?:财务|会计|审计|税务)/.test(compact)) return compact.match(/(?:财务|会计|审计|税务)/)?.[0] ?? "财务";

  return compact || original;
};

export const buildAgentSearchQuery = (company: string, role: string, mode: SearchMode) => {
  const companyPart = collapseWhitespace(company);
  const rolePart = mode === "exact" ? collapseWhitespace(role) : fuzzyRoleFamily(role);
  return collapseWhitespace(`${companyPart} ${rolePart} 面经`);
};

export const describeSearchRule = (mode: SearchMode) => SEARCH_MODE_COPY[mode].summary;

export const MAX_DEEP_COLLECTION_QUERIES = 6;
export const MAX_DEEP_COLLECTION_SOURCES = 20;
export const DEEP_COLLECTION_SATURATION_ROUNDS = 2;
export const DEEP_COLLECTION_MIN_QUERIES = 4;

const uniqueQueries = (queries: string[]) => {
  const seen = new Set<string>();
  return queries.flatMap((query) => {
    const normalized = collapseWhitespace(query).slice(0, 120);
    const key = normalized.toLocaleLowerCase("zh-CN");
    if (normalized.length < 2 || seen.has(key)) return [];
    seen.add(key);
    return [normalized];
  });
};

/** Build a bounded, visible query matrix from the user's seed and target. */
export const buildDeepCollectionQueries = (seedQuery: string, company: string, role: string) => {
  const companyPart = collapseWhitespace(company);
  const exactRole = collapseWhitespace(role);
  if (!companyPart || !exactRole) return uniqueQueries([seedQuery]);
  const roleFamily = fuzzyRoleFamily(role);
  return uniqueQueries([
    seedQuery,
    `${companyPart} ${exactRole} 面经`,
    `${companyPart} ${roleFamily} 面经`,
    `${companyPart} ${exactRole} 面试`,
    `${companyPart} ${roleFamily} 面试题`,
    `${companyPart} ${roleFamily} 一面 二面`,
  ]).slice(0, MAX_DEEP_COLLECTION_QUERIES);
};
