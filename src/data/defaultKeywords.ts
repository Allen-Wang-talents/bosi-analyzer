// =====================================================
// 默认关键词种子 - 影响信号识别 (Tier 名单由 Allen 提供)
// =====================================================

// 影响力信号关键词 (项目经验评分 +1.5 命中)
export const IMPACT_SIGNAL_KEYWORDS = [
  '亿级', '千万级', '百万级', '万级 DAU', '千万 DAU', '亿级 DAU',
  '0 到 1', '从 0 到 1', '从0到1', '0-1', '0→1',
  '主导', '负责', '牵头', '核心成员', '技术负责人', 'Tech Lead',
  '架构', '架构设计', '系统设计', '性能优化', '稳定性',
  '开源', '贡献', 'committer', 'maintainer',
  '专利', '论文', '顶会', 'SIGIR', 'SIGKDD', 'NeurIPS', 'ICML', 'ACL',
  '团队管理', '带团队', '管理 N 人', 'N 人团队', '下属',
  '降本', '提效', '增长', '营收', 'GMV', 'ROI',
  'P0', 'P1', '故障', 'On-call',
];

// 跳槽警示信号 (负面)
export const JOB_HOP_SIGNALS = [
  '不到 1 年', '不足 1 年', '短期', '频繁跳槽',
];

// 学历信号关键词
export const DEGREE_KEYWORDS: Array<{ keyword: string; level: '博士' | '硕士' | '本科' | '专科' | '其他' }> = [
  { keyword: '博士',     level: '博士' },
  { keyword: 'PhD',      level: '博士' },
  { keyword: 'Ph.D',     level: '博士' },
  { keyword: '硕士',     level: '硕士' },
  { keyword: '研究生',   level: '硕士' },
  { keyword: 'MBA',      level: '硕士' },
  { keyword: 'EMBA',     level: '硕士' },
  { keyword: '本科',     level: '本科' },
  { keyword: '学士',     level: '本科' },
  { keyword: '大专',     level: '专科' },
  { keyword: '专科',     level: '专科' },
];

// 经验年限解析正则
export const YEARS_PATTERNS = [
  /(\d+)\s*年以上/,
  /(\d+)\s*\+/,
  /(\d+)\s*-\s*(\d+)\s*年/,
  /(\d+)\s*years?/i,
];

// 技术技能关键词种子 (用于 JD 提取时的初筛)
export const TECH_KEYWORDS_SEED = [
  // 前端
  'React', 'Vue', 'Angular', 'TypeScript', 'JavaScript', 'Next.js', 'Nuxt',
  'Webpack', 'Vite', 'TailwindCSS', 'Sass', 'Less',
  // 后端
  'Node.js', 'Python', 'Java', 'Go', 'Golang', 'Rust', 'C++', 'C#', '.NET',
  'Spring', 'Spring Boot', 'Django', 'Flask', 'FastAPI', 'Express', 'Koa',
  'GraphQL', 'gRPC', 'REST', 'WebSocket',
  // 数据库
  'MySQL', 'PostgreSQL', 'MongoDB', 'Redis', 'Elasticsearch', 'ClickHouse',
  'Kafka', 'RabbitMQ', 'RocketMQ',
  // 云/运维
  'AWS', 'Azure', 'GCP', 'Aliyun', 'Kubernetes', 'K8s', 'Docker', 'Terraform',
  'CI/CD', 'Jenkins', 'GitLab CI',
  // 大数据/AI
  'Hadoop', 'Spark', 'Flink', 'Storm', 'Hive', 'Presto',
  'TensorFlow', 'PyTorch', 'PaddlePaddle', 'LLM', 'RAG', 'LangChain',
  'Hugging Face', 'Transformers', 'Stable Diffusion', 'GPT',
  // 移动端
  'iOS', 'Android', 'Swift', 'Kotlin', 'Objective-C', 'Flutter', 'React Native',
  'Weex', '小程序', 'Taro', 'Uni-app',
  // 通用
  'Git', 'Linux', 'Shell', 'Agile', 'Scrum',
];