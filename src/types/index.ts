// =====================================================
// 博思人才评荐网 - 类型定义
// =====================================================

// Module 1: 公司概况
export type Company = {
  name: string;
  industry: string;
  size: string;             // "100-500" / "1000+" / etc.
  stage: string;            // 融资阶段: "种子轮" / "天使轮" / "pre-A轮" / "A轮" / "A+轮" / "B轮" / "B+轮" / "C轮" / "战略融资" / "pre-IPO" / "IPO"
  business: string;         // 主营业务
  products: string;         // 关键产品
  website?: string;
};

// Module 2: 岗位 JD
export type JD = {
  rawText: string;          // 原始 JD 文本
  title: string;            // 职位名称
  level?: string;           // 职级: 初级/中级/高级/资深/专家/leader/总监
  responsibilities: string[]; // 工作职责
  mustHaveSkills: string[]; // 必须技能
  niceToHaveSkills: string[]; // 加分技能
  minYears: number;         // 经验年限
  location: string;
  compRange?: {             // 薪资范围（单位：千/月）
    min: number;
    max: number;
    currency?: string;
  };
  industry?: string;
  teamSize?: string;
  reportingTo?: string;
};

// Module 3: 岗位画像补充
export type JobProfile = {
  dealBreakers: string[];   // 一票否决项
  niceToHaves: string[];    // 加分项 (补充JD未提的)
  culturalFit: string;      // 文化契合要求
  targetCompanyTiers: number[]; // 目标公司 tier
  targetSchoolTiers: number[];  // 目标学校 tier
  notes?: string;
};

// Module 4: 候选人
export type Education = {
  school: string;
  degree: '博士' | '硕士' | '本科' | '专科' | '其他';
  major?: string;
  startYear?: number;
  endYear?: number;
  schoolTier?: number;
};

export type WorkHistory = {
  company: string;
  title: string;
  startYear: number;
  endYear: number | null;   // null = 至今
  durationMonths: number;
  description: string;
  companyTier?: number;
  industry?: string;
};

export type Project = {
  name: string;
  role?: string;
  period?: string;
  description: string;
  highlights?: string[];    // 关键成果
};

export type Candidate = {
  rawText: string;
  name?: string;
  contact?: {
    phone?: string;
    email?: string;
    location?: string;
  };
  birthYear?: number;       // 出生年 (简历中提取或反推)
  totalYears: number;
  currentTitle?: string;
  currentCompany?: string;
  education: Education[];
  workHistory: WorkHistory[];
  projects: Project[];
  skills: string[];
  expectedComp?: number;
};

// 评分维度结果
export type DimensionResult = {
  name: 'education' | 'company' | 'projects' | 'fit' | 'age';
  label: string;
  score: number;            // 0-100
  weight: number;           // 百分比（0-1）
  evidence: string[];       // 评分依据条目
  matched: string[];        // 已匹配实体
  missed: string[];         // 应有但缺
  notes?: string;
};

// 评分汇总
export type ScoreResult = {
  total: number;            // 综合评分 0-100
  dimensions: DimensionResult[];
  recommendation: Recommendation;
  summary: string;          // 履历分析摘要
  generatedAt: string;      // ISO 时间
};

// 推荐档位
export type RecommendationTier = 'strong' | 'recommend' | 'try' | 'skip';

export type Recommendation = {
  tier: RecommendationTier;
  label: string;            // "强烈推荐" / "建议推荐给客户" / "可以推荐试试" / "不建议推荐"
  color: 'red' | 'green' | 'yellow' | 'gray';
  reason: string;
};

// Tier 表
export type SchoolTier = {
  tier: number;             // 1 最高
  label: string;
  schools: string[];
};

export type CompanyTier = {
  tier: number;             // 1 最高
  label: string;
  companies: string[];
};

// 权重配置
export type Weights = {
  education: number;        // 百分比
  company: number;
  projects: number;
  fit: number;
  age: number;              // AI 行业偏好 95 后
};

// 历史记录
export type HistoryRecord = {
  id: string;
  timestamp: string;
  jd?: JD;
  candidate?: Candidate;
  company?: Company;
  profile?: JobProfile;
  analysis?: ScoreResult;
  label?: string;           // 用户标记名
};

// Chat 消息
export type ChatRole = 'user' | 'assistant' | 'system';

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: string;
  pending?: boolean;
  error?: boolean;
};

// API Key 状态
export type ApiKeyStatus = 'configured' | 'missing' | 'invalid';

// Tier 配置导入导出格式
export type TierConfigExport = {
  version: string;
  exportedAt: string;
  schoolTiers: SchoolTier[];
  companyTiers: CompanyTier[];
  weights?: Weights;
};

// 错误类型
export type ParseError = {
  type: 'PDF_PARSE_FAILED' | 'DOCX_PARSE_FAILED' | 'JD_EMPTY' | 'RESUME_EMPTY' | 'FILE_TOO_LARGE' | 'UNKNOWN';
  message: string;
  file?: string;
};

// =====================================================
// 评分引擎入参 / 返回值封装
// =====================================================

export type ScoringInput = {
  candidate: Candidate;
  jd: JD;
  profile: JobProfile | null;
  company: Company | null;
  schoolTiers: SchoolTier[];
  companyTiers: CompanyTier[];
  weights: Weights;
};

export type ScoringOutput = ScoreResult;