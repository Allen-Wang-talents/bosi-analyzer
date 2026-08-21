// =====================================================
// 学校识别库 - 用于简历解析与 fuzzy 匹配
// 数据基于 Allen 提供的种子名单扩展（覆盖 985/211/双一流 + 知名双非 + QS Top 100）
// =====================================================

export type SchoolEntry = {
  /** 标准名称（用于显示与 tier 匹配） */
  name: string;
  /** 简称 / 别名 / 常见拼写变体（用于 fuzzy 匹配） */
  aliases: string[];
  /** 国家/地区: 'cn' | 'hk' | 'tw' | 'us' | 'uk' | 'sg' | 'jp' | 'eu' | 'au' | 'ca' | 'other' */
  country: string;
};

// =====================================================
// 中国大陆 - 顶尖（985 + 头部双一流 + 中科院系统）
// =====================================================
const CN_TIER_1: SchoolEntry[] = [
  { name: '清华大学', aliases: ['清华', 'Tsinghua', 'THU', '清华姚班', '清华图灵班', '清华交叉信息研究院'], country: 'cn' },
  { name: '北京大学', aliases: ['北大', 'Peking University', 'PKU', '北大图灵班', '北大信科'], country: 'cn' },
  { name: '复旦大学', aliases: ['复旦', 'Fudan', 'FDU'], country: 'cn' },
  { name: '上海交通大学', aliases: ['上交', '上交大', '上海交大', 'SJTU', 'Shanghai Jiao Tong', '交大'], country: 'cn' },
  { name: '浙江大学', aliases: ['浙大', 'ZJU', 'Zhejiang University'], country: 'cn' },
  { name: '南京大学', aliases: ['南大', 'NJU', 'Nanjing University'], country: 'cn' },
  { name: '中国科学技术大学', aliases: ['中科大', 'USTC', '中国科大', '中科大少年班'], country: 'cn' },
  { name: '中国人民大学', aliases: ['人大', 'RUC', 'Renmin University'], country: 'cn' },
  { name: '北京航空航天大学', aliases: ['北航', 'BUAA', 'Beihang'], country: 'cn' },
  { name: '北京理工大学', aliases: ['北理工', 'BIT', 'Beijing Institute of Technology'], country: 'cn' },
  { name: '中国科学院大学', aliases: ['国科大', '中科院大学', '中国科学院研究生院', 'UCAS', '中科院'], country: 'cn' },
];

// =====================================================
// 中国大陆 - 强 985 / 头部 211
// =====================================================
const CN_TIER_2: SchoolEntry[] = [
  { name: '华中科技大学', aliases: ['华科', 'HUST'], country: 'cn' },
  { name: '武汉大学', aliases: ['武大', 'WHU'], country: 'cn' },
  { name: '西安交通大学', aliases: ['西交', '西交大', 'XJTU'], country: 'cn' },
  { name: '哈尔滨工业大学', aliases: ['哈工大', 'HIT'], country: 'cn' },
  { name: '同济大学', aliases: ['同济', 'Tongji'], country: 'cn' },
  { name: '东南大学', aliases: ['东大', 'SEU'], country: 'cn' },
  { name: '中山大学', aliases: ['中大', 'SYSU'], country: 'cn' },
  { name: '厦门大学', aliases: ['厦大', 'XMU'], country: 'cn' },
  { name: '天津大学', aliases: ['天大', 'TJU'], country: 'cn' },
  { name: '山东大学', aliases: ['山大', 'SDU'], country: 'cn' },
  { name: '四川大学', aliases: ['川大', 'SCU'], country: 'cn' },
  { name: '吉林大学', aliases: ['吉大', 'JLU'], country: 'cn' },
  { name: '重庆大学', aliases: ['重大', 'CQU'], country: 'cn' },
  { name: '湖南大学', aliases: ['湖大', 'HNU'], country: 'cn' },
  { name: '中南大学', aliases: ['中南', 'CSU'], country: 'cn' },
  { name: '华南理工大学', aliases: ['华工', 'SCUT'], country: 'cn' },
  { name: '大连理工大学', aliases: ['大工', 'DUT'], country: 'cn' },
  { name: '兰州大学', aliases: ['兰大', 'LZU'], country: 'cn' },
  { name: '西北工业大学', aliases: ['西工大', 'NPU'], country: 'cn' },
  { name: '电子科技大学', aliases: ['电子科大', '成电', 'UESTC'], country: 'cn' },
  { name: '中央民族大学', aliases: ['民大', 'MUC'], country: 'cn' },
  { name: '中国农业大学', aliases: ['中农大', 'CAU'], country: 'cn' },
  { name: '西北农林科技大学', aliases: ['西农', 'NWAFU'], country: 'cn' },
  { name: '国防科技大学', aliases: ['国防科大', 'NUDT'], country: 'cn' },
];

// =====================================================
// 中国大陆 - 211 + 知名双非
// =====================================================
const CN_TIER_3: SchoolEntry[] = [
  { name: '北京邮电大学', aliases: ['北邮', 'BUPT'], country: 'cn' },
  { name: '西安电子科技大学', aliases: ['西电', 'Xidian'], country: 'cn' },
  { name: '北京交通大学', aliases: ['北交', 'BJTU'], country: 'cn' },
  { name: '北京科技大学', aliases: ['北科大', 'USTB'], country: 'cn' },
  { name: '北京化工大学', aliases: ['北化', 'BUCT'], country: 'cn' },
  { name: '北京工业大学', aliases: ['北工大', 'BJUT'], country: 'cn' },
  { name: '北京外国语大学', aliases: ['北外', 'BFSU'], country: 'cn' },
  { name: '北京语言大学', aliases: ['北语', 'BLCU'], country: 'cn' },
  { name: '中国传媒大学', aliases: ['中传', 'CUC'], country: 'cn' },
  { name: '中央财经大学', aliases: ['央财', 'CUFE'], country: 'cn' },
  { name: '对外经济贸易大学', aliases: ['贸大', 'UIBE'], country: 'cn' },
  { name: '北京航空航天大学（北海）', aliases: [], country: 'cn' },
  { name: '华东师范大学', aliases: ['华师大', 'ECNU'], country: 'cn' },
  { name: '上海大学', aliases: ['上大', 'SHU'], country: 'cn' },
  { name: '上海财经大学', aliases: ['上财', 'SUFE'], country: 'cn' },
  { name: '上海外国语大学', aliases: ['上外', 'SISU'], country: 'cn' },
  { name: '华东理工大学', aliases: ['华理', 'ECUST'], country: 'cn' },
  { name: '东华大学', aliases: ['东华', 'DHU'], country: 'cn' },
  { name: '苏州大学', aliases: ['苏大', 'SOOCHOW'], country: 'cn' },
  { name: '南京航空航天大学', aliases: ['南航', 'NUAA'], country: 'cn' },
  { name: '南京理工大学', aliases: ['南理工', 'NJUST'], country: 'cn' },
  { name: '河海大学', aliases: ['河海', 'HHU'], country: 'cn' },
  { name: '江南大学', aliases: ['江大', 'JNU'], country: 'cn' },
  { name: '南京师范大学', aliases: ['南师大', 'NJU'], country: 'cn' },
  { name: '南京邮电大学', aliases: ['南邮', 'NJupt'], country: 'cn' },
  { name: '华中农业大学', aliases: ['华农', 'HZAU'], country: 'cn' },
  { name: '华中师范大学', aliases: ['华中师大', 'CCNU'], country: 'cn' },
  { name: '中南财经政法大学', aliases: ['中南财大', 'ZUEL'], country: 'cn' },
  { name: '武汉理工大学', aliases: ['武汉理工', 'WUT'], country: 'cn' },
  { name: '湖南师范大学', aliases: ['湖南师大', 'HUNNU'], country: 'cn' },
  { name: '中南大学', aliases: [], country: 'cn' },
  { name: '暨南大学', aliases: ['暨大', 'JNU'], country: 'cn' },
  { name: '华南师范大学', aliases: ['华南师大', 'SCNU'], country: 'cn' },
  { name: '广东工业大学', aliases: ['广工', 'GDUT'], country: 'cn' },
  { name: '深圳大学', aliases: ['深大', 'SZU'], country: 'cn' },
  { name: '南方科技大学', aliases: ['南科大', 'SUSTech'], country: 'cn' },
  { name: '香港中文大学（深圳）', aliases: ['CUHK(SZ)', '港中深'], country: 'cn' },
  { name: '大连海事大学', aliases: ['大连海大', 'DMU'], country: 'cn' },
  { name: '东北大学', aliases: ['东大', 'NEU'], country: 'cn' },
  { name: '辽宁大学', aliases: ['辽大', 'LNU'], country: 'cn' },
  { name: '大连理工大学', aliases: [], country: 'cn' },
  { name: '东北师范大学', aliases: ['东北师大', 'NENU'], country: 'cn' },
  { name: '哈尔滨工程大学', aliases: ['哈工程', 'HEU'], country: 'cn' },
  { name: '东北农业大学', aliases: ['东北农大', 'NEAU'], country: 'cn' },
  { name: '东北林业大学', aliases: ['东北林大', 'NEFU'], country: 'cn' },
  { name: '中国海洋大学', aliases: ['中海大', 'OUC'], country: 'cn' },
  { name: '中国石油大学（华东）', aliases: ['中石大', 'UPC'], country: 'cn' },
  { name: '中国石油大学（北京）', aliases: ['中石大北京', 'CUP'], country: 'cn' },
  { name: '中国地质大学（武汉）', aliases: ['地大武汉', 'CUG'], country: 'cn' },
  { name: '中国地质大学（北京）', aliases: ['地大北京', 'CUGB'], country: 'cn' },
  { name: '中国矿业大学', aliases: ['矿大', 'CUMT'], country: 'cn' },
  { name: '西南交通大学', aliases: ['西南交大', 'SWJTU'], country: 'cn' },
  { name: '西南大学', aliases: ['西南大', 'SWU'], country: 'cn' },
  { name: '西南财经大学', aliases: ['西南财大', 'SWUFE'], country: 'cn' },
  { name: '电子科技大学（沙河校区）', aliases: [], country: 'cn' },
  { name: '四川农业大学', aliases: ['川农大', 'SICAU'], country: 'cn' },
  { name: '云南大学', aliases: ['云大', 'YNU'], country: 'cn' },
  { name: '贵州大学', aliases: ['贵大', 'GZU'], country: 'cn' },
  { name: '广西大学', aliases: ['西大', 'GXU'], country: 'cn' },
  { name: '新疆大学', aliases: ['新大', 'XJU'], country: 'cn' },
  { name: '石河子大学', aliases: ['石大', 'SHZU'], country: 'cn' },
  { name: '宁夏大学', aliases: ['宁大', 'NXU'], country: 'cn' },
  { name: '内蒙古大学', aliases: ['内大', 'IMU'], country: 'cn' },
  { name: '西藏大学', aliases: ['藏大', 'UTB'], country: 'cn' },
  { name: '青海大学', aliases: ['青大', 'QHU'], country: 'cn' },
  { name: '郑州大学', aliases: ['郑大', 'ZZU'], country: 'cn' },
  { name: '安徽大学', aliases: ['安大', 'AHU'], country: 'cn' },
  { name: '合肥工业大学', aliases: ['合工大', 'HFUT'], country: 'cn' },
  { name: '南昌大学', aliases: ['南大', 'NCU'], country: 'cn' },
  { name: '湖南大学', aliases: [], country: 'cn' },
  { name: '福州大学', aliases: ['福大', 'FZU'], country: 'cn' },
  { name: '海南大学', aliases: ['海大', 'HNU'], country: 'cn' },
  { name: '河北工业大学', aliases: ['河工大', 'HEBUT'], country: 'cn' },
  { name: '太原理工大学', aliases: ['太原理工', 'TYUT'], country: 'cn' },
  { name: '中国药科大学', aliases: ['药大', 'CPU'], country: 'cn' },
  { name: '南京中医药大学', aliases: ['南中医', 'NJUCM'], country: 'cn' },
  { name: '上海中医药大学', aliases: ['上中医', 'SHUTCM'], country: 'cn' },
  { name: '北京中医药大学', aliases: ['北中医', 'BUCM'], country: 'cn' },
];

// =====================================================
// 港澳台
// =====================================================
const HK_TW: SchoolEntry[] = [
  { name: '香港大学', aliases: ['港大', 'HKU', 'University of Hong Kong'], country: 'hk' },
  { name: '香港中文大学', aliases: ['港中文', 'CUHK'], country: 'hk' },
  { name: '香港科技大学', aliases: ['港科', '港科大', 'HKUST'], country: 'hk' },
  { name: '香港理工大学', aliases: ['港理工', 'PolyU'], country: 'hk' },
  { name: '香港城市大学', aliases: ['港城大', 'CityU'], country: 'hk' },
  { name: '香港浸会大学', aliases: ['浸大', 'HKBU'], country: 'hk' },
  { name: '香港教育大学', aliases: ['教大', 'EdUHK'], country: 'hk' },
  { name: '香港岭南大学', aliases: ['岭大', 'Lingnan'], country: 'hk' },
  { name: '澳门大学', aliases: ['澳大', 'UM', 'University of Macau'], country: 'hk' },
  { name: '台湾大学', aliases: ['台大', 'NTU', 'National Taiwan University'], country: 'tw' },
  { name: '清华大学（新竹）', aliases: ['清大', 'NTHU', '新竹清华'], country: 'tw' },
  { name: '交通大学（新竹）', aliases: ['阳交大', 'NYCU'], country: 'tw' },
  { name: '成功大学', aliases: ['成大', 'NCKU'], country: 'tw' },
];

// =====================================================
// 国际 - 北美 / 英国 / 欧洲 / 亚太
// =====================================================
const INTL: SchoolEntry[] = [
  { name: 'Stanford University', aliases: ['Stanford', '斯坦福', '斯坦福大学'], country: 'us' },
  { name: 'Massachusetts Institute of Technology', aliases: ['MIT', '麻省理工', '麻省理工学院'], country: 'us' },
  { name: 'Harvard University', aliases: ['Harvard', '哈佛', '哈佛大学'], country: 'us' },
  { name: 'California Institute of Technology', aliases: ['Caltech', '加州理工'], country: 'us' },
  { name: 'Princeton University', aliases: ['Princeton', '普林斯顿'], country: 'us' },
  { name: 'Yale University', aliases: ['Yale', '耶鲁'], country: 'us' },
  { name: 'University of Chicago', aliases: ['UChicago', '芝大'], country: 'us' },
  { name: 'Columbia University', aliases: ['Columbia', '哥大'], country: 'us' },
  { name: 'University of Pennsylvania', aliases: ['UPenn', '宾大', '宾夕法尼亚大学'], country: 'us' },
  { name: 'Cornell University', aliases: ['Cornell', '康奈尔', '康奈尔大学'], country: 'us' },
  { name: 'Johns Hopkins University', aliases: ['JHU', '约翰霍普金斯', '霍普金斯'], country: 'us' },
  { name: 'Northwestern University', aliases: ['Northwestern', '西北大学'], country: 'us' },
  { name: 'Duke University', aliases: ['Duke', '杜克', '杜克大学'], country: 'us' },
  { name: 'Brown University', aliases: ['Brown', '布朗'], country: 'us' },
  { name: 'Dartmouth College', aliases: ['Dartmouth', '达特茅斯'], country: 'us' },
  { name: 'University of California, Berkeley', aliases: ['Berkeley', 'UCB', 'UC Berkeley', '伯克利', '加州伯克利'], country: 'us' },
  { name: 'University of California, Los Angeles', aliases: ['UCLA', '加州洛杉矶'], country: 'us' },
  { name: 'University of California, San Diego', aliases: ['UCSD', '加州圣地亚哥'], country: 'us' },
  { name: 'University of California, Davis', aliases: ['UCD', '加州戴维斯'], country: 'us' },
  { name: 'University of California, Santa Barbara', aliases: ['UCSB', '加州圣巴巴拉'], country: 'us' },
  { name: 'University of Southern California', aliases: ['USC', '南加大', '南加州大学'], country: 'us' },
  { name: 'Carnegie Mellon University', aliases: ['CMU', '卡内基梅隆', '卡梅'], country: 'us' },
  { name: 'University of Michigan', aliases: ['UMich', 'Michigan', '密歇根大学', '密歇根'], country: 'us' },
  { name: 'New York University', aliases: ['NYU', '纽约大学'], country: 'us' },
  { name: 'Georgia Institute of Technology', aliases: ['Georgia Tech', 'Gatech', '佐治亚理工'], country: 'us' },
  { name: 'University of Illinois', aliases: ['UIUC', '伊利诺伊大学', '伊利诺伊香槟'], country: 'us' },
  { name: 'University of Texas at Austin', aliases: ['UT Austin', 'UTA', '德州奥斯汀'], country: 'us' },
  { name: 'University of Washington', aliases: ['UW', '华盛顿大学'], country: 'us' },
  { name: 'University of Wisconsin', aliases: ['UW-Madison', '威斯康星'], country: 'us' },
  { name: 'University of Maryland', aliases: ['UMD', '马里兰大学'], country: 'us' },
  { name: 'University of California, Irvine', aliases: ['UCI', '加州欧文'], country: 'us' },
  { name: 'Rice University', aliases: ['Rice', '莱斯'], country: 'us' },
  { name: 'Vanderbilt University', aliases: ['Vanderbilt', '范德堡'], country: 'us' },
  { name: 'University of Notre Dame', aliases: ['Notre Dame', '圣母大学'], country: 'us' },
  { name: 'Washington University in St. Louis', aliases: ['WashU', '圣路易斯华盛顿'], country: 'us' },
  { name: 'University of Virginia', aliases: ['UVA', '弗吉尼亚大学'], country: 'us' },
  { name: 'University of North Carolina', aliases: ['UNC', '北卡'], country: 'us' },
  { name: 'University of Florida', aliases: ['UF', '佛罗里达大学'], country: 'us' },
  { name: 'University of Rochester', aliases: ['Rochester', '罗切斯特'], country: 'us' },
  { name: 'Boston University', aliases: ['BU', '波士顿大学'], country: 'us' },
  { name: 'Boston College', aliases: ['BC', '波士顿学院'], country: 'us' },
  { name: 'Tufts University', aliases: ['Tufts', '塔夫茨'], country: 'us' },
  { name: 'Northeastern University', aliases: ['NEU', '东北大学'], country: 'us' },
  { name: 'University of Cambridge', aliases: ['Cambridge', '剑桥', '剑桥大学'], country: 'uk' },
  { name: 'University of Oxford', aliases: ['Oxford', '牛津', '牛津大学'], country: 'uk' },
  { name: 'Imperial College London', aliases: ['Imperial', 'ICL', '帝国理工', '帝国理工学院'], country: 'uk' },
  { name: 'University College London', aliases: ['UCL', '伦敦大学学院'], country: 'uk' },
  { name: 'London School of Economics', aliases: ['LSE', '伦敦政经'], country: 'uk' },
  { name: 'King\'s College London', aliases: ['KCL', '国王学院'], country: 'uk' },
  { name: 'University of Edinburgh', aliases: ['Edinburgh', '爱丁堡', '爱丁堡大学'], country: 'uk' },
  { name: 'University of Manchester', aliases: ['Manchester', '曼大', '曼彻斯特大学'], country: 'uk' },
  { name: 'University of Bristol', aliases: ['Bristol', '布里斯托'], country: 'uk' },
  { name: 'University of Warwick', aliases: ['Warwick', '华威'], country: 'uk' },
  { name: 'University of Glasgow', aliases: ['Glasgow', '格拉斯哥'], country: 'uk' },
  { name: 'University of Leeds', aliases: ['Leeds', '利兹'], country: 'uk' },
  { name: 'University of Sheffield', aliases: ['Sheffield', '谢菲尔德'], country: 'uk' },
  { name: 'University of Birmingham', aliases: ['Birmingham', '伯明翰'], country: 'uk' },
  { name: 'University of Southampton', aliases: ['Southampton', '南安普顿'], country: 'uk' },
  { name: 'University of St Andrews', aliases: ['St Andrews', '圣安德鲁斯'], country: 'uk' },
  { name: 'Durham University', aliases: ['Durham', '杜伦'], country: 'uk' },
  { name: 'ETH Zürich', aliases: ['ETH', '苏黎世联邦理工', '苏黎世理工'], country: 'eu' },
  { name: 'EPFL', aliases: ['École Polytechnique Fédérale de Lausanne', '洛桑联邦理工'], country: 'eu' },
  { name: 'Technical University of Munich', aliases: ['TUM', '慕尼黑工业大学', '慕尼黑理工'], country: 'eu' },
  { name: 'Ludwig Maximilian University of Munich', aliases: ['LMU', '慕尼黑大学'], country: 'eu' },
  { name: 'Heidelberg University', aliases: ['Heidelberg', '海德堡大学'], country: 'eu' },
  { name: 'Humboldt University of Berlin', aliases: ['Humboldt', '柏林洪堡'], country: 'eu' },
  { name: 'Technical University of Berlin', aliases: ['TU Berlin', '柏林工业大学'], country: 'eu' },
  { name: 'University of Paris-Saclay', aliases: ['Paris-Saclay', '巴黎萨克雷'], country: 'eu' },
  { name: 'École Polytechnique', aliases: ['Polytechnique', '巴黎综合理工'], country: 'eu' },
  { name: 'Sciences Po', aliases: ['巴黎政治学院'], country: 'eu' },
  { name: 'École Normale Supérieure', aliases: ['ENS', '巴黎高等师范'], country: 'eu' },
  { name: 'INSEAD', aliases: ['英士国际商学院'], country: 'eu' },
  { name: 'HEC Paris', aliases: ['巴黎高等商学院'], country: 'eu' },
  { name: 'University of Amsterdam', aliases: ['UvA', '阿姆斯特丹大学'], country: 'eu' },
  { name: 'KU Leuven', aliases: ['鲁汶大学'], country: 'eu' },
  { name: 'University of Copenhagen', aliases: ['UCPH', '哥本哈根大学'], country: 'eu' },
  { name: 'Karolinska Institute', aliases: ['卡罗林斯卡学院'], country: 'eu' },
  { name: 'University of Tokyo', aliases: ['東大', '东京大学', 'UTokyo'], country: 'jp' },
  { name: 'Kyoto University', aliases: ['京大', '京都大学'], country: 'jp' },
  { name: 'Tohoku University', aliases: ['东北大学（日本）'], country: 'jp' },
  { name: 'Tokyo Institute of Technology', aliases: ['东工大', 'Tokyo Tech', '东京工业大学'], country: 'jp' },
  { name: 'Osaka University', aliases: ['阪大', '大阪大学'], country: 'jp' },
  { name: 'Nagoya University', aliases: ['名大', '名古屋大学'], country: 'jp' },
  { name: 'National University of Singapore', aliases: ['NUS', '新加坡国立大学'], country: 'sg' },
  { name: 'Nanyang Technological University', aliases: ['NTU', '南洋理工大学'], country: 'sg' },
  { name: 'Singapore Management University', aliases: ['SMU', '新加坡管理大学'], country: 'sg' },
  { name: 'University of Melbourne', aliases: ['Melbourne', '墨尔本大学'], country: 'au' },
  { name: 'University of Sydney', aliases: ['USYD', '悉尼大学'], country: 'au' },
  { name: 'Australian National University', aliases: ['ANU', '澳国立', '澳大利亚国立大学'], country: 'au' },
  { name: 'University of New South Wales', aliases: ['UNSW', '新南威尔士大学'], country: 'au' },
  { name: 'University of Queensland', aliases: ['UQ', '昆士兰大学'], country: 'au' },
  { name: 'Monash University', aliases: ['Monash', '莫纳什大学'], country: 'au' },
  { name: 'University of Toronto', aliases: ['UofT', '多伦多大学'], country: 'ca' },
  { name: 'McGill University', aliases: ['McGill', '麦吉尔'], country: 'ca' },
  { name: 'University of British Columbia', aliases: ['UBC', '英属哥伦比亚大学'], country: 'ca' },
  { name: 'Waterloo University', aliases: ['UWaterloo', '滑铁卢大学'], country: 'ca' },
];

export const SCHOOL_LIBRARY: SchoolEntry[] = [
  ...CN_TIER_1,
  ...CN_TIER_2,
  ...CN_TIER_3,
  ...HK_TW,
  ...INTL,
];

/** 用别名快速做前缀匹配（在 normalized text 上） */
export const SCHOOL_ALIAS_INDEX: Array<{ alias: string; entry: SchoolEntry }> = (() => {
  const list: Array<{ alias: string; entry: SchoolEntry }> = [];
  for (const e of SCHOOL_LIBRARY) {
    list.push({ alias: e.name, entry: e });
    for (const a of e.aliases) {
      if (!list.some((x) => x.alias === a)) list.push({ alias: a, entry: e });
    }
  }
  // 长别名优先匹配，避免短别名吃掉长别名（如 '清华' vs '清华大学'）
  list.sort((a, b) => b.alias.length - a.alias.length);
  return list;
})();
