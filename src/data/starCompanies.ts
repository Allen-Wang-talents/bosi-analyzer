// =====================================================
// 明星 AI 公司品牌表 —— 首页轮播 / logo 墙用
//
// 为什么自己造字标而不用官方 logo:
//   1) 国内 AI 公司的官方 logo 素材拿不到, 也不适合直接商用;
//   2) 岗位池里 72 家客户, 名字格式五花八门 ("月之暗面|kimi"、"本衍极智|BENYOND AI"),
//      真 logo 覆盖率极低, 缺的只能退化成文字, 视觉就不统一了。
//   所以统一用「字母/汉字徽标 + 中英文名」, 每个品牌给一个专属色, 靠排版做质感。
//
// 品牌色是公开的品牌识别色 (取自各家官网/公开设计系统), 仅用于识别, 不复刻 logo 图形。
// =====================================================

export type StarCompany = {
  /** 规范中文名 */
  name: string;
  /** 英文名 (字标副标题) */
  en: string;
  /** 品牌识别色 */
  color: string;
  /** 徽标上的字 (1-2 个字符) */
  mark: string;
  /** 别名 —— 用来把岗位池里的客户名归一 */
  aliases: string[];
};

export const STAR_COMPANIES: StarCompany[] = [
  {
    name: '月之暗面',
    en: 'MOONSHOT AI',
    color: '#6C8CFF',
    mark: '月',
    aliases: ['月之暗面', 'kimi', '月之暗面|kimi', 'moonshot'],
  },
  {
    name: 'DeepSeek',
    en: 'DEEPSEEK',
    color: '#4D6BFE',
    mark: 'DS',
    aliases: ['deepseek', '深度求索', 'deepseek|深度求索'],
  },
  {
    name: 'MiniMax',
    en: 'MINIMAX',
    color: '#FF6B6B',
    mark: 'MM',
    aliases: ['minimax', '稀宇科技'],
  },
  {
    name: '生数科技',
    en: 'VIRTUOLOGY',
    color: '#22D3AA',
    mark: '生',
    aliases: ['生数科技', '生数'],
  },
  {
    name: '字节跳动',
    en: 'BYTEDANCE',
    color: '#3B82F6',
    mark: '字',
    aliases: ['字节跳动', '字节', '豆包', '火山引擎', 'bytedance'],
  },
  {
    name: '阿里巴巴',
    en: 'ALIBABA',
    color: '#FF8A3D',
    mark: '阿',
    aliases: ['阿里巴巴', '阿里', '通义', '通义千问', 'alibaba', '阿里云', '达摩院'],
  },
  {
    name: '腾讯',
    en: 'TENCENT',
    color: '#2AA9F0',
    mark: '腾',
    aliases: ['腾讯', '腾讯混元', 'tencent', '混元'],
  },
  {
    name: '百度',
    en: 'BAIDU',
    color: '#4C6EF5',
    mark: '百',
    aliases: ['百度', '文心一言', '百度智能云', 'baidu'],
  },
  {
    name: '智谱 AI',
    en: 'ZHIPU AI',
    color: '#7C5CFF',
    mark: '谱',
    aliases: ['智谱', '智谱ai', 'zhipu', '清言'],
  },
  {
    name: '零一万物',
    en: '01.AI',
    color: '#F43F5E',
    mark: '01',
    aliases: ['零一万物', '零一万', '01.ai'],
  },
  {
    name: '阶跃星辰',
    en: 'STEPFUN',
    color: '#0EA5E9',
    mark: '阶',
    aliases: ['阶跃星辰', '阶跃', 'stepfun'],
  },
  {
    name: '中科闻歌',
    en: 'WENGEES',
    color: '#14B8A6',
    mark: '闻',
    aliases: ['中科闻歌', '闻歌'],
  },
  {
    name: '商汤科技',
    en: 'SENSETIME',
    color: '#F59E0B',
    mark: '商',
    aliases: ['商汤', '商汤科技', 'sensetime', '日日新'],
  },
  {
    name: '科大讯飞',
    en: 'IFLYTEK',
    color: '#E11D48',
    mark: '科',
    aliases: ['科大讯飞', '讯飞', 'iflytek', '星火'],
  },
  {
    name: '小鹏汽车',
    en: 'XPENG',
    color: '#10B981',
    mark: '鹏',
    aliases: ['小鹏', '小鹏汽车', 'xpeng'],
  },
  {
    name: '蔚来',
    en: 'NIO',
    color: '#0EA5E9',
    mark: '蔚',
    aliases: ['蔚来', 'nio'],
  },
  {
    name: '理想汽车',
    en: 'LI AUTO',
    color: '#F97316',
    mark: '理',
    aliases: ['理想', '理想汽车', 'li auto'],
  },
  {
    name: '雷鸟创新',
    en: 'RAYNIO',
    color: '#8B5CF6',
    mark: '雷',
    aliases: ['雷鸟创新', '雷鸟'],
  },
  {
    name: '知乎',
    en: 'ZHIHU',
    color: '#0F766E',
    mark: '知',
    aliases: ['知乎', 'zhihu'],
  },
  {
    name: '自然选择',
    en: 'NATURAL SELECT',
    color: '#22C55E',
    mark: '然',
    aliases: ['自然选择'],
  },
  {
    name: '星河觉醒',
    en: 'AWAKEN AI',
    color: '#EC4899',
    mark: '星',
    aliases: ['星河觉醒', '星河觉醒|awaken ai', 'awaken ai'],
  },
  {
    name: '光帆科技',
    en: 'SAILFORGE',
    color: '#06B6D4',
    mark: '帆',
    aliases: ['光帆科技', '光帆'],
  },
  {
    name: 'NovusVita AI',
    en: 'NOVUSVITA',
    color: '#6366F1',
    mark: 'NV',
    aliases: ['novusvita ai', 'novusvita'],
  },
  {
    name: '无限谷',
    en: 'INFINITE VALLEY',
    color: '#14B8A6',
    mark: '谷',
    aliases: ['无限谷'],
  },
  {
    name: '星火之海',
    en: 'SPARKSEA',
    color: '#F59E0B',
    mark: '火',
    aliases: ['星火之海'],
  },
];

const ALIAS_INDEX = new Map<string, StarCompany>();
for (const c of STAR_COMPANIES) {
  for (const a of c.aliases) ALIAS_INDEX.set(a.toLowerCase().trim(), c);
  ALIAS_INDEX.set(c.name.toLowerCase().trim(), c);
}

/** 客户名 → 品牌。认不出来返回 null (前端降级成通用字标) */
export function resolveCompanyBrand(client: string): StarCompany | null {
  if (!client) return null;
  const raw = client.trim();
  const direct = ALIAS_INDEX.get(raw.toLowerCase());
  if (direct) return direct;

  // "月之暗面|kimi" / "星河觉醒|Awaken AI" 这种带后缀的拆开再试
  const parts = raw.split(/[|｜/·&]/).map((p) => p.trim().toLowerCase()).filter(Boolean);
  for (const p of parts) {
    const hit = ALIAS_INDEX.get(p);
    if (hit) return hit;
  }
  // 客户名里包含某个品牌名
  for (const [alias, brand] of ALIAS_INDEX) {
    if (alias.length >= 2 && raw.toLowerCase().includes(alias)) return brand;
  }
  return null;
}

/** 通用字标: 从任意名字里抠出 1-2 个字符做徽标 */
export function fallbackMark(name: string): string {
  const cleaned = name.replace(/[|｜/·&]/g, ' ').trim();
  if (!cleaned) return '?';
  const ascii = cleaned.match(/[A-Za-z]{2}/);
  if (ascii) return ascii[0].toUpperCase();
  return cleaned.slice(0, 1);
}
