// =====================================================
// Tier 名单 (Allen 提供)
// =====================================================
import type { SchoolTier, CompanyTier, TierConfigExport } from '@/types';

// =====================================================
// 学校 Tier 名单 (Allen 校准，2026-06)
// 等级 1 = 最高，等级 8 = 最低
// =====================================================
export const DEFAULT_SCHOOL_TIERS: SchoolTier[] = [
  {
    tier: 1,
    label: '清北/藤校（QS50 CS强校）',
    schools: [
      // 清北/特殊班级 (仅特殊班级，不含本体；本体走 Tier 2-7)
      '清华姚班',
      '北大图灵班',
      '上海交大ACM班',
      // 大学本体 (清北 - Tier 1)
      '清华大学',
      '北京大学',
      // 清北简称 (避免"东北大学"歧义)
      '清华',
      '北大',
      // QS50 CS 强校
      'MIT',
      'Harvard',
      'Stanford',
      'CMU',
      'Carnegie Mellon',
      '哥伦比亚大学',
      'Columbia',
      'UCB',
      'UC Berkeley',
      'Berkeley',
      'UCSD',
      'UC San Diego',
      'UCLA',
      'UIUC',
      'Illinois',
      'USC',
      '南加州大学',
      'Yale',
      '耶鲁',
      'Princeton',
      '普林斯顿',
      '宾夕法尼亚大学',
      'UPenn',
      '佐治亚理工',
      'Georgia Tech',
      'Caltech',
      '加州理工',
      'Cornell',
      '康奈尔',
      '布朗大学',
      'Brown',
      '约翰霍普金斯大学',
      'JHU',
      '芝加哥大学',
      'UChicago',
      'Oxford',
      '牛津',
      'Cambridge',
      '剑桥',
      'Imperial College',
      '帝国理工',
      '慕尼黑工业大学',
      'TUM',
      '新加坡国立大学',
      'NUS',
      '香港大学',
      'HKU',
      '香港科技大学',
      'HKUST',
      '香港中文大学',
      'CUHK',
      '墨尔本大学',
      'Melbourne',
      '多伦多大学',
      'Toronto',
    ],
  },
  {
    tier: 2,
    label: '华东五校',
    schools: [
      '上海交通大学',
      '复旦大学',
      '浙江大学',
      '中国科学技术大学',
      '南京大学',
      // 兼容简称 (按招聘/猎头常用写法)
      '上海交大',
      '上交大',
      '上交',
      '复旦',
      '浙大',
      '中科大',
      '南大',
    ],
  },
  {
    tier: 3,
    label: 'C9高校（清北华五之外）',
    schools: [
      '哈尔滨工业大学',
      '西安交通大学',
      '哈工大',
      '西交大',
      '西交',
    ],
  },
  {
    tier: 4,
    label: '计算机强校985',
    schools: [
      '北京航空航天大学',
      '华中科技大学',
      '武汉大学',
      '西北工业大学',
      '电子科技大学',
      '北航',
      '华科',
      '武大',
      '西工大',
      '电子科大',
      '成电',
    ],
  },
  {
    tier: 5,
    label: '两电一邮特色院校',
    schools: [
      '北京邮电大学',
      '西安电子科技大学',
      '北邮',
      '西电',
    ],
  },
  {
    tier: 6,
    label: '新型顶尖院校',
    schools: [
      '南方科技大学',
      '中国科学院大学',
      '南科大',
      '国科大',
      '中科院大学',
    ],
  },
  {
    tier: 7,
    label: '其他985/211大学',
    schools: [
      '中山大学',
      '厦门大学',
      '山东大学',
      '四川大学',
      '吉林大学',
      '中南大学',
      '湖南大学',
      '大连理工大学',
      '东北大学',
      '重庆大学',
      '兰州大学',
      '中央财经大学',
      '对外经济贸易大学',
      '上海财经大学',
      '北京师范大学',
      '华东师范大学',
      '中国政法大学',
      '天津大学',
      '同济大学',
      '东南大学',
      '中国人民大学',
      '人大',
    ],
  },
  {
    tier: 8,
    label: '普通本科',
    schools: [], // 由用户按需补充
  },
];

// =====================================================
// 公司 Tier 名单 (Allen 提供，2026-06 - AI 行业三梯队)
// 等级 1 = 最高，等级 3 = 最低
// =====================================================
export const DEFAULT_COMPANY_TIERS: CompanyTier[] = [
  {
    tier: 1,
    label: '第一梯队',
    companies: [
      // 国内头部互联网大厂
      '字节跳动', '字节',
      '阿里巴巴', '阿里',
      '腾讯',
      // 国内头部 AI 原生企业
      'DeepSeek', '深度求索',
      'Kimi', '月之暗面',
      'MiniMax', // 公司本体（避免和模型同名混淆，匹配仅当简历写全称/精确）
      '阶跃星辰',
      '智谱',
      // 全球科技巨头与海外顶尖 AI 企业
      '谷歌', 'Google',
      'Meta',
      'OpenAI',
      'Anthropic',
      '微软', 'Microsoft',
      '苹果', 'Apple',
      '亚马逊', 'Amazon', 'AWS',
    ],
  },
  {
    tier: 2,
    label: '第二梯队',
    companies: [
      // 其他互联网大厂
      '小红书',
      '百度',
      '华为',
      '小米',
      '快手',
      '美团',
      '京东',
      'B站', '哔哩哔哩',
      '米哈游',
      'Temu', '拼多多',
      // 上一代 AI 公司
      '商汤',
      '旷视', '旷世', // Allen 写"旷世"，补一个常见写法"旷视"
      '依图',
      '云从',
      '第四范式',
      '科大讯飞',
      '昆仑万维', '天工',
      '出门问问',
      // 自动驾驶头部
      '蔚来',
      '小鹏',
      '理想',
      '小马智行',
      'Momenta',
      '文远智行',
      // 明星 AI native 创业公司
      '面壁智能',
      '百川智能',
      '零一万物',
      '智象未来', 'Hidream',
      'Manus',
      'Genspark',
      'Lovart', 'Liblib',
      'Vidu', '生数科技',
      'PixVerse', '爱诗科技',
      'HeyGen',
      'MiroMind',
      'Anuttacon',
      'Sand.ai',
      'VAST',
      'Meshy',
      'Plaud',
      'Looki',
      '沐言智语',
      'YouWare', '新言意码',
    ],
  },
  {
    tier: 3,
    label: '第三梯队',
    companies: [
      '携程',
      '陌陌',
      '知乎',
    ],
  },
];

// 兼容性 - 旧名 (其他文件可能引用)
export const EMPTY_COMPANY_TIERS: CompanyTier[] = DEFAULT_COMPANY_TIERS.map((t) => ({
  tier: t.tier,
  label: t.label,
  companies: [], // 空 - 强制用户导入或使用默认
}));

// 默认权重 (5 维度 - Allen 偏好 AI 行业 95 后)
export const DEFAULT_WEIGHTS = {
  education: 18,
  company: 22,
  projects: 20,
  fit: 25,
  age: 15,
};

// 兼容性导出 - 保留旧名字 (其他文件可能引用)
export const EMPTY_SCHOOL_TIERS: SchoolTier[] = DEFAULT_SCHOOL_TIERS.map((t) => ({
  tier: t.tier,
  label: t.label,
  schools: [], // 空 - 强制用户导入或使用默认
}));

// JSON Schema 文档 (供 Allen 参考)
export const TIER_JSON_SCHEMA_DOC = `
JSON 格式示例 (导出文件):
{
  "version": "1.0",
  "exportedAt": "2026-06-28T12:00:00.000Z",
  "weights": { "education": 20, "company": 25, "projects": 25, "fit": 30 },
  "schoolTiers": [
    { "tier": 1, "label": "清北/藤校", "schools": ["清华大学", "北京大学", ...] },
    { "tier": 2, "label": "华东五校", "schools": [...] }
  ],
  "companyTiers": [
    { "tier": 1, "label": "顶级大厂", "companies": ["字节跳动", "阿里巴巴", "腾讯", ...] }
  ]
}

注意:
- tier 数字越小代表排名越靠前 (tier 1 = 最强)
- 学校/公司名需与简历中常见写法一致
- 不需要的 tier 可保留空数组
`;

export function isValidTierExport(obj: unknown): obj is TierConfigExport {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  if (!Array.isArray(o.schoolTiers) || !Array.isArray(o.companyTiers)) return false;
  return true;
}