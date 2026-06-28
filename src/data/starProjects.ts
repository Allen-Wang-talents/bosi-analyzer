// =====================================================
// 明星项目种子词 (Allen 提供，2026-06)
// 简历中提到这些产品/项目 → scoreProjects 单独加分
// =====================================================

export type StarProjectEntry = {
  company: string;            // 公司名 (用于证据展示)
  product: string;            // 主产品名 (匹配关键词)
  aliases?: string[];         // 别名 (如 "剪映/capcut")
  program?: '校招' | '实习' | null; // 校招/实习项目标记
  note?: string;              // 备注
};

// =====================================================
// 第一梯队公司明星项目
// =====================================================
export const STAR_PROJECTS: StarProjectEntry[] = [
  // ===== 字节 =====
  { company: '字节跳动', product: '豆包', aliases: ['doubao'] },
  { company: '字节跳动', product: 'Flow', aliases: ['即梦', 'seadance', 'sea dance', '猫箱'] },
  { company: '字节跳动', product: 'Trae', aliases: ['trae'] },
  { company: '字节跳动', product: '剪映', aliases: ['capcut', 'CapCut'] },
  { company: '字节跳动', product: '飞书', aliases: ['lark', 'Lark', 'Feishu'] },
  { company: '字节跳动', product: '火山引擎', aliases: ['volcengine', 'Volcengine', '火山'] },
  { company: '字节跳动', product: 'top seed', aliases: ['Top Seed', 'TOP SEED'], program: '校招' },

  // ===== 阿里 =====
  { company: '阿里巴巴', product: '通义实验室', aliases: ['通义', 'tongyi', 'Qwen', 'qwen', '达摩院', 'DAMO'] },
  { company: '阿里巴巴', product: '千问', aliases: ['Qwen', 'qwen'] },
  { company: '阿里巴巴', product: '夸克', aliases: ['quark', 'Quark'] },
  { company: '阿里巴巴', product: '阿里云', aliases: ['Aliyun', 'aliyun'] },
  { company: '阿里巴巴', product: '阿里星', aliases: ['AliStar', 'ali star'], program: '校招' },

  // ===== 腾讯 =====
  { company: '腾讯', product: '混元', aliases: ['hunyuan', 'Hunyuan'] },
  { company: '腾讯', product: '元宝', aliases: ['yuanbao', 'Yuanbao'] },
  { company: '腾讯', product: '微信', aliases: ['WXG', 'wechat', 'WeChat', '微信事业群'] },
  { company: '腾讯', product: 'CSIG', aliases: ['云与智慧产业事业群'] },
  { company: '腾讯', product: 'PCG', aliases: ['平台与内容事业群'] },
  { company: '腾讯', product: '青云计划', aliases: ['青云', 'QingCloud'], program: '校招' },

  // ===== 百度 =====
  { company: '百度', product: '文心', aliases: ['文心一言', 'ERNIE', 'ernie', '文心大模型'] },
  { company: '百度', product: 'ACG', aliases: ['百度ACG'] },
  { company: '百度', product: 'MEG', aliases: ['移动生态', '移动生态事业群'] },
  { company: '百度', product: 'PSIG', aliases: ['个人超级智能事业群'] },

  // ===== 华为 =====
  { company: '华为', product: '2012实验室', aliases: ['2012 实验室'] },
  { company: '华为', product: '诺亚方舟实验室', aliases: ['诺亚方舟', 'Noah'] },
  { company: '华为', product: '盘古大模型', aliases: ['盘古', 'Pangu', 'pangu'] },

  // ===== 快手 =====
  { company: '快手', product: '可灵', aliases: ['Kling', 'kling', '可灵事业部'] },

  // ===== 美团 =====
  { company: '美团', product: '龙猫', aliases: ['longcat', 'LongCat', '龙猫大模型'] },

  // ===== 小米 =====
  { company: '小米', product: 'MIMO', aliases: ['mimo', 'MiMo'] },

  // ===== 蚂蚁 =====
  { company: '蚂蚁', product: '百灵大模型', aliases: ['百灵', 'Bailing'] },
  { company: '蚂蚁', product: '灵光', aliases: ['灵光APP', 'Lingguang'] },
];

// 扁平化所有匹配关键词 (主名 + 别名) - 用于在文本中查找
export function getAllStarKeywords(): string[] {
  const set = new Set<string>();
  for (const sp of STAR_PROJECTS) {
    set.add(sp.product);
    sp.aliases?.forEach((a) => set.add(a));
  }
  return Array.from(set).filter(Boolean);
}

// 反查: 关键词 → 公司
export function findCompanyByProduct(keyword: string): string | null {
  const norm = keyword.toLowerCase().trim();
  for (const sp of STAR_PROJECTS) {
    if (sp.product.toLowerCase() === norm) return sp.company;
    if (sp.aliases?.some((a) => a.toLowerCase() === norm)) return sp.company;
  }
  return null;
}
