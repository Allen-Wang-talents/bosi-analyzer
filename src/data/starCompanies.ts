// =====================================================
// 明星 AI 公司品牌表 —— 首页轮播 / logo 墙用
//
// logo 都是各家公司官网上的官方素材, 存在 public/logos/ 下:
//   有的是纯图形 (百度爪印、DeepSeek 鲸), 有的是中英文字标 (RayNeo、商汤),
//   还有的整块深色底 (01.AI、理想) —— 风格差得远, 所以前端统一套一层白底牌子。
// 没扒到官方 logo 的公司 (星河觉醒、中科闻歌等) 退化成文字徽标, 牌子一样, 不断层。
//
// 排列顺序 = 轮播出场顺序: 有官方 logo 的公司排在前面, 保证轮播头几屏都是真 logo。
// =====================================================

export type StarCompany = {
  /** 规范中文名 */
  name: string;
  /** 英文名 (字标副标题) */
  en: string;
  /** 品牌识别色 */
  color: string;
  /** 徽标上的字 (1-2 个字符) —— 没有官方 logo 时的兜底 */
  mark: string;
  /** 官方 logo 素材路径 (public/logos/ 下) */
  logo?: string;
  /** 别名 —— 用来把岗位池里的客户名归一 */
  aliases: string[];
};

export const STAR_COMPANIES: StarCompany[] = [
  {
    name: '月之暗面',
    en: 'MOONSHOT AI',
    color: '#6C8CFF',
    mark: '月',
    logo: '/logos/moonshot.svg',
    aliases: ['月之暗面', 'kimi', '月之暗面|kimi', 'moonshot'],
  },
  {
    name: 'DeepSeek',
    en: 'DEEPSEEK',
    color: '#4D6BFE',
    mark: 'DS',
    logo: '/logos/deepseek.svg',
    aliases: ['deepseek', '深度求索', 'deepseek|深度求索'],
  },
  {
    name: 'MiniMax',
    en: 'MINIMAX',
    color: '#FF6B6B',
    mark: 'MM',
    logo: '/logos/minimax.svg',
    aliases: ['minimax', '稀宇科技'],
  },
  {
    name: '生数科技',
    en: 'VIRTUOLOGY',
    color: '#22D3AA',
    mark: '生',
    logo: '/logos/virtuology.svg',
    aliases: ['生数科技', '生数'],
  },
  {
    name: '雷鸟创新',
    en: 'RAYNEO',
    color: '#8B5CF6',
    mark: '雷',
    logo: '/logos/rayneo.png',
    aliases: ['雷鸟创新', '雷鸟', 'rayneo'],
  },
  {
    name: '知乎',
    en: 'ZHIHU',
    color: '#0F766E',
    mark: '知',
    logo: '/logos/zhihu.svg',
    aliases: ['知乎', 'zhihu'],
  },
  {
    name: '自然选择',
    en: 'NATURE SELECT',
    color: '#22C55E',
    mark: '然',
    logo: '/logos/natureselect.svg',
    aliases: ['自然选择'],
  },
  {
    name: '光帆科技',
    en: 'GUANGFAN',
    color: '#06B6D4',
    mark: '帆',
    logo: '/logos/guangfan.svg',
    aliases: ['光帆科技', '光帆'],
  },
  {
    name: 'NovusVita AI',
    en: 'NOVUSVITA',
    color: '#6366F1',
    mark: 'NV',
    logo: '/logos/novusvita.svg',
    aliases: ['novusvita ai', 'novusvita'],
  },
  {
    name: '无限谷',
    en: 'INFINITE VALLEY',
    color: '#14B8A6',
    mark: '谷',
    logo: '/logos/wuxiangu.jpg',
    aliases: ['无限谷'],
  },
  {
    name: '灵动时刻',
    en: 'VIVIX',
    color: '#EC4899',
    mark: 'V',
    logo: '/logos/vivix.svg',
    aliases: ['灵动时刻', 'vivix', '灵动时刻vivix', 'vivix灵动时刻'],
  },
  {
    name: '字节跳动',
    en: 'BYTEDANCE',
    color: '#3B82F6',
    mark: '字',
    logo: '/logos/bytedance.svg',
    aliases: ['字节跳动', '字节', '豆包', '火山引擎', 'bytedance'],
  },
  {
    name: '阿里巴巴',
    en: 'ALIBABA',
    color: '#FF8A3D',
    mark: '阿',
    logo: '/logos/alibaba.svg',
    aliases: ['阿里巴巴', '阿里', '通义', '通义千问', 'alibaba', '阿里云', '达摩院'],
  },
  {
    name: '百度',
    en: 'BAIDU',
    color: '#4C6EF5',
    mark: '百',
    logo: '/logos/baidu.svg',
    aliases: ['百度', '文心一言', '百度智能云', 'baidu'],
  },
  {
    name: '智谱 AI',
    en: 'ZHIPU AI',
    color: '#7C5CFF',
    mark: '谱',
    logo: '/logos/zhipu.svg',
    aliases: ['智谱', '智谱ai', 'zhipu', '清言'],
  },
  {
    name: '零一万物',
    en: '01.AI',
    color: '#F43F5E',
    mark: '01',
    logo: '/logos/01ai.svg',
    aliases: ['零一万物', '零一万', '01.ai'],
  },
  {
    name: '阶跃星辰',
    en: 'STEPFUN',
    color: '#0EA5E9',
    mark: '阶',
    logo: '/logos/stepfun.svg',
    aliases: ['阶跃星辰', '阶跃', 'stepfun'],
  },
  {
    name: '商汤科技',
    en: 'SENSETIME',
    color: '#F59E0B',
    mark: '商',
    logo: '/logos/sensetime.png',
    aliases: ['商汤', '商汤科技', 'sensetime', '日日新'],
  },
  {
    name: '科大讯飞',
    en: 'IFLYTEK',
    color: '#E11D48',
    mark: '科',
    logo: '/logos/iflytek.png',
    aliases: ['科大讯飞', '讯飞', 'iflytek', '星火'],
  },
  {
    name: '小鹏汽车',
    en: 'XPENG',
    color: '#10B981',
    mark: '鹏',
    logo: '/logos/xpeng.svg',
    aliases: ['小鹏', '小鹏汽车', 'xpeng'],
  },
  {
    name: '蔚来',
    en: 'NIO',
    color: '#0EA5E9',
    mark: '蔚',
    logo: '/logos/nio.svg',
    aliases: ['蔚来', 'nio'],
  },
  {
    name: '理想汽车',
    en: 'LI AUTO',
    color: '#F97316',
    mark: '理',
    logo: '/logos/liauto.png',
    aliases: ['理想', '理想汽车', 'li auto'],
  },
  {
    name: '腾讯',
    en: 'TENCENT',
    color: '#2AA9F0',
    mark: '腾',
    aliases: ['腾讯', '腾讯混元', 'tencent', '混元'],
  },
  {
    name: '中科闻歌',
    en: 'WENGEES',
    color: '#14B8A6',
    mark: '闻',
    aliases: ['中科闻歌', '闻歌'],
  },
  {
    name: '星河觉醒',
    en: 'AWAKEN AI',
    color: '#EC4899',
    mark: '星',
    aliases: ['星河觉醒', '星河觉醒|awaken ai', 'awaken ai'],
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
