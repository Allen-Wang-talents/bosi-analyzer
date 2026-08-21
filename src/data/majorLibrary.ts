// =====================================================
// 专业识别库 - 用于简历解析与 fuzzy 匹配
// 覆盖本科 13 大门类（哲学/经济学/法学/教育学/文学/历史学/理学/工学/农学/医学/管理学/艺术学/军事学）
// =====================================================

export type MajorEntry = {
  /** 标准名称 */
  name: string;
  /** 别名 / 简称 / 英文名 / 旧称 */
  aliases: string[];
  /** 学科门类 */
  category: string;
};

const MAJORS: MajorEntry[] = [
  // ===== 工学 - 计算机/AI/数据 =====
  { name: '计算机科学与技术', aliases: ['计算机', '计科', 'CS', 'Computer Science'], category: '工学' },
  { name: '软件工程', aliases: ['软工', 'SE', 'Software Engineering'], category: '工学' },
  { name: '人工智能', aliases: ['AI', 'Artificial Intelligence'], category: '工学' },
  { name: '数据科学与大数据技术', aliases: ['大数据', 'Data Science'], category: '工学' },
  { name: '网络工程', aliases: ['网工', 'Network Engineering'], category: '工学' },
  { name: '信息安全', aliases: ['网安', '网络安全', 'Information Security', 'Cyber Security'], category: '工学' },
  { name: '物联网工程', aliases: ['IoT', '物联网'], category: '工学' },
  { name: '智能科学与技术', aliases: ['智能科学'], category: '工学' },
  { name: '空间信息与数字技术', aliases: ['空间信息'], category: '工学' },
  { name: '电子与计算机工程', aliases: ['ECE', 'Electrical and Computer Engineering'], category: '工学' },
  { name: '网络空间安全', aliases: ['Cyberspace Security'], category: '工学' },
  { name: '数字媒体技术', aliases: ['数媒'], category: '工学' },

  // ===== 工学 - 电子/通信/电气 =====
  { name: '电子信息工程', aliases: ['电子信息', '电信'], category: '工学' },
  { name: '电子科学与技术', aliases: ['电子科学'], category: '工学' },
  { name: '通信工程', aliases: ['通信'], category: '工学' },
  { name: '信息工程', aliases: ['Information Engineering'], category: '工学' },
  { name: '电气工程及其自动化', aliases: ['电气', '电气工程', 'EE'], category: '工学' },
  { name: '自动化', aliases: ['自动控制', 'Automation'], category: '工学' },
  { name: '智能电网信息工程', aliases: ['智能电网'], category: '工学' },
  { name: '光电信息科学与工程', aliases: ['光电'], category: '工学' },
  { name: '微电子科学与工程', aliases: ['微电子'], category: '工学' },
  { name: '集成电路设计与集成系统', aliases: ['IC设计', '集成电路'], category: '工学' },

  // ===== 工学 - 机械/材料/能源/土木/化工 =====
  { name: '机械工程', aliases: ['机械', 'ME'], category: '工学' },
  { name: '机械设计制造及其自动化', aliases: ['机制', '机设'], category: '工学' },
  { name: '材料科学与工程', aliases: ['材料', 'Materials'], category: '工学' },
  { name: '能源与动力工程', aliases: ['能源动力', '能动'], category: '工学' },
  { name: '土木工程', aliases: ['土木', 'Civil Engineering'], category: '工学' },
  { name: '建筑学', aliases: ['建筑', 'Architecture'], category: '工学' },
  { name: '化学工程与工艺', aliases: ['化工', 'ChemE'], category: '工学' },
  { name: '环境工程', aliases: ['环境', 'Environmental Engineering'], category: '工学' },
  { name: '生物医学工程', aliases: ['生医工', 'BME'], category: '工学' },
  { name: '车辆工程', aliases: ['车辆', '汽车'], category: '工学' },
  { name: '交通运输', aliases: ['交运'], category: '工学' },
  { name: '船舶与海洋工程', aliases: ['船舶', '海洋工程'], category: '工学' },
  { name: '航空航天工程', aliases: ['航天', '航空航天', 'Aerospace'], category: '工学' },
  { name: '工业设计', aliases: ['Industrial Design'], category: '工学' },

  // ===== 理学 - 数学/物理/化学/生物/统计 =====
  { name: '数学与应用数学', aliases: ['应数', '数学', 'Math'], category: '理学' },
  { name: '信息与计算科学', aliases: ['信计', '计算数学'], category: '理学' },
  { name: '统计学', aliases: ['统计', 'Statistics'], category: '理学' },
  { name: '应用统计学', aliases: ['应统'], category: '理学' },
  { name: '物理学', aliases: ['物理', 'Physics'], category: '理学' },
  { name: '应用物理学', aliases: ['应物'], category: '理学' },
  { name: '化学', aliases: ['Chemistry'], category: '理学' },
  { name: '生物科学', aliases: ['生物', 'Biology'], category: '理学' },
  { name: '生物技术', aliases: ['Biotechnology'], category: '理学' },
  { name: '生态学', aliases: ['Ecology'], category: '理学' },

  // ===== 经济学 =====
  { name: '经济学', aliases: ['Economics'], category: '经济学' },
  { name: '金融学', aliases: ['金融', 'Finance'], category: '经济学' },
  { name: '金融工程', aliases: ['金工', 'Financial Engineering'], category: '经济学' },
  { name: '保险学', aliases: ['保险'], category: '经济学' },
  { name: '投资学', aliases: ['投资'], category: '经济学' },
  { name: '国际经济与贸易', aliases: ['国贸', 'International Trade'], category: '经济学' },
  { name: '经济学（计量）', aliases: ['计量经济学'], category: '经济学' },
  { name: '财政学', aliases: ['财政'], category: '经济学' },

  // ===== 管理学 =====
  { name: '工商管理', aliases: ['工管', 'MBA', 'Business Administration'], category: '管理学' },
  { name: '市场营销', aliases: ['Marketing'], category: '管理学' },
  { name: '会计学', aliases: ['会计', 'Accounting'], category: '管理学' },
  { name: '财务管理', aliases: ['财管'], category: '管理学' },
  { name: '人力资源管理', aliases: ['HR', '人力', 'Human Resources'], category: '管理学' },
  { name: '国际商务', aliases: ['International Business'], category: '管理学' },
  { name: '物流管理', aliases: ['物流', 'Logistics'], category: '管理学' },
  { name: '电子商务', aliases: ['电商', 'E-Commerce'], category: '管理学' },
  { name: '信息管理与信息系统', aliases: ['信管', 'MIS'], category: '管理学' },
  { name: '公共事业管理', aliases: ['公管'], category: '管理学' },
  { name: '行政管理', aliases: ['行管'], category: '管理学' },
  { name: '旅游管理', aliases: ['Tourism'], category: '管理学' },
  { name: '酒店管理', aliases: ['Hospitality'], category: '管理学' },

  // ===== 文学 =====
  { name: '汉语言文学', aliases: ['汉语言', '中文'], category: '文学' },
  { name: '英语', aliases: ['English'], category: '文学' },
  { name: '商务英语', aliases: ['Business English'], category: '文学' },
  { name: '翻译', aliases: ['Translation'], category: '文学' },
  { name: '日语', aliases: ['Japanese'], category: '文学' },
  { name: '新闻学', aliases: ['新闻', 'Journalism'], category: '文学' },
  { name: '广告学', aliases: ['广告', 'Advertising'], category: '文学' },
  { name: '传播学', aliases: ['Communication'], category: '文学' },
  { name: '广播电视学', aliases: ['广电'], category: '文学' },

  // ===== 法学 =====
  { name: '法学', aliases: ['法律', 'Law'], category: '法学' },
  { name: '知识产权', aliases: ['知产', 'IP'], category: '法学' },
  { name: '国际法', aliases: ['International Law'], category: '法学' },
  { name: '社会学', aliases: ['Sociology'], category: '法学' },

  // ===== 教育学 =====
  { name: '教育学', aliases: ['Education'], category: '教育学' },
  { name: '学前教育', aliases: ['幼教'], category: '教育学' },
  { name: '小学教育', aliases: ['小教'], category: '教育学' },
  { name: '心理学', aliases: ['Psychology'], category: '教育学' },
  { name: '应用心理学', aliases: ['应心'], category: '教育学' },

  // ===== 历史学 / 哲学 =====
  { name: '历史学', aliases: ['历史', 'History'], category: '历史学' },
  { name: '哲学', aliases: ['Philosophy'], category: '哲学' },

  // ===== 医学 =====
  { name: '临床医学', aliases: ['临床'], category: '医学' },
  { name: '口腔医学', aliases: ['口腔'], category: '医学' },
  { name: '预防医学', aliases: ['预防'], category: '医学' },
  { name: '药学', aliases: ['Pharmacy'], category: '医学' },
  { name: '护理学', aliases: ['护理', 'Nursing'], category: '医学' },
  { name: '医学影像学', aliases: ['医学影像'], category: '医学' },
  { name: '麻醉学', aliases: ['麻醉'], category: '医学' },
  { name: '中医学', aliases: ['中医'], category: '医学' },
  { name: '基础医学', aliases: ['基础医学'], category: '医学' },
  { name: '生物医学', aliases: ['Biomedical'], category: '医学' },

  // ===== 农学 =====
  { name: '农学', aliases: ['Agronomy'], category: '农学' },
  { name: '园艺', aliases: ['Horticulture'], category: '农学' },
  { name: '林学', aliases: ['Forestry'], category: '农学' },
  { name: '动物科学', aliases: ['动科'], category: '农学' },
  { name: '水产养殖学', aliases: ['水产'], category: '农学' },

  // ===== 艺术学 =====
  { name: '艺术设计', aliases: ['艺设'], category: '艺术学' },
  { name: '视觉传达设计', aliases: ['视传', 'Visual Design'], category: '艺术学' },
  { name: '环境设计', aliases: ['环设'], category: '艺术学' },
  { name: '产品设计', aliases: ['Product Design'], category: '艺术学' },
  { name: '动画', aliases: ['Animation'], category: '艺术学' },
  { name: '绘画', aliases: ['Painting'], category: '艺术学' },
  { name: '雕塑', aliases: ['Sculpture'], category: '艺术学' },
  { name: '音乐表演', aliases: ['Music Performance'], category: '艺术学' },
  { name: '舞蹈', aliases: ['Dance'], category: '艺术学' },
  { name: '戏剧与影视学', aliases: ['影视', 'Film & TV'], category: '艺术学' },
  { name: '播音与主持艺术', aliases: ['播音主持'], category: '艺术学' },
];

/** 用于 fuzzy 匹配：长别名优先 */
export const MAJOR_ALIAS_INDEX: Array<{ alias: string; entry: MajorEntry }> = (() => {
  const list: Array<{ alias: string; entry: MajorEntry }> = [];
  for (const e of MAJORS) {
    list.push({ alias: e.name, entry: e });
    for (const a of e.aliases) {
      if (!list.some((x) => x.alias === a)) list.push({ alias: a, entry: e });
    }
  }
  list.sort((a, b) => b.alias.length - a.alias.length);
  return list;
})();
