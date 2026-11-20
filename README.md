# 博思AI人才推荐网 (Boss AI Talent Recommendation Network)

猎头顾问专用的「上传简历 → 自动推荐岗位」工具。**在线访问**：<https://bosi-analyzer.vercel.app>

## 两个页面

| 页面 | 干什么 |
|---|---|
| **岗位推荐**（主） | 上传一份简历，从飞书多维表格里的在招岗位池（8 个方向、240+ 个岗位）自动排出最匹配的 10 个，并给出推荐理由 |
| **深度评鉴**（次） | 原来的功能：手填公司概况 / 岗位 JD / 岗位画像，跑 5 维评鉴（学历 / 公司 / 项目 / 履历 / 年龄）+ AI 对话。从岗位推荐页点「在深度评鉴中打开」可以把岗位一键填进去 |

## 岗位推荐怎么算的

本地规则对全部岗位粗排 → LLM 只对 top 10 精排并写推荐理由。四个维度：

| 维度 | 权重 | 算什么 |
|---|---|---|
| 能力/领域匹配 | 38% | 岗位要求词（按 8 个方向分别建词表）在候选人履历里的覆盖率 + TF-IDF 语义相似度 |
| 人才画像契合 | 24% | 从画像正则挖出的硬约束：年龄 / 学历 / 职级（对标字节 N-M）/ 大厂背景 / 否定项 |
| 经验年限 | 14% | 候选人年限 vs 岗位要求年限 |
| 职能方向 + 职级 | 24% | 候选人当前方向 vs 表格分类，职位名解析出的职级 |

几个刻意的设计：

- **岗位没写 JD → 能力维度不评分**，权重摊给别的维度，同时按证据覆盖率打折。宁可排在有依据的岗位后面，也不要靠「方向看起来对」就排第一。
- **薪资带宽 / 合同点位 / 客户层级不进分数**，那是商业吸引力不是人岗契合。它们只做展示和筛选。优先级 P0/P1 只做 0~5 分的 tie-break 加分。
- **同一个客户在 top 10 里最多 3 个**，否则一个大客户能占满整页。
- 要求词表是**按方向分开**的。`Go` 这种短词必须大小写敏感 + 词边界匹配，否则会命中 `Google` / `logo`。

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 启动开发服务器
npm run dev
# 浏览器打开 http://localhost:5173

# 3. 生产构建
npm run build
npm run preview
```

## 岗位数据从哪来

线上运行时由 Vercel 后端读飞书多维表格「北京AI岗位汇总」（8 个分表），带 5 分钟服务端缓存。

本地开发：

```bash
# 用 lark-cli 用户身份拉一份快照到 data/jobs.snapshot.json
node scripts/fetch-jobs.ts
```

`npm run dev` 时 `/api/jobs` 会优先用飞书应用凭证，没有凭证就退回本地快照。

> 快照含客户真名 / 薪资 / 合同点位，**已 gitignore，且不能放 `public/`**（vite 会拷进 `dist/` 跟着部署上线）。

### 调匹配质量

匹配结果排得不对时，用这个脚本看每个岗位为什么拿这个分：

```bash
# 看 top 10 和维度拆解
node scripts/match-explain.ts --resume /tmp/某人的简历.txt

# 看某个岗位命中了哪些词、漏了哪些词 (id 从上面的输出里拿)
node scripts/match-explain.ts --resume /tmp/简历.txt --explain <岗位id>
```

它走本地解析（不调 LLM），所以同一份简历每次结果一样，方便对比改了词表/权重之后的变化。

## 首次使用配置

### 1. 配置 MiniMax M3 API Key
- 右上角 **设置** → **API Key** 标签
- 从 [api.minimaxi.com](https://api.minimaxi.com/) 获取 API Key
- 粘贴并保存（Key 仅存在本地浏览器 localStorage）

### 2. 内置 Tier 名单（开箱即用）
代码已内置完整 tier 数据：
- **学校**：8 档（清北/藤校 → 普通本科，约 100 所院校）
- **公司**：3 档（字节/阿里/腾讯 → 中小互联网，AI 行业精选 60+ 公司）

如需自定义：**设置** → **导入/导出** 标签，上传 JSON 即可覆盖。

JSON 格式：
```json
{
  "version": "1.0",
  "schoolTiers": [
    { "tier": 1, "label": "清北", "schools": ["清华大学", "北京大学"] }
  ],
  "companyTiers": [
    { "tier": 1, "label": "头部大厂", "companies": ["字节跳动", "阿里巴巴"] }
  ]
}
```
- tier 数字越小代表越强（tier 1 = 最强）
- 数字 4 在公司 tier 中表示未识别（兜底）

### 3. （可选）调整评分权重
- **设置** → **评分权重** 标签
- 5 个维度可独立调节（学历 18 / 公司 22 / 项目 20 / 履历 25 / 年龄 15）
- 提供预设：默认 / 重能力 / 重背景 / 纯 95 后优先

## 使用流程

### 岗位推荐
1. **上传简历**：拖入 PDF/DOCX/TXT，浏览器本地解析（也可粘贴文本）
2. **自动匹配**：本地规则秒出排序，LLM 后台补推荐理由
3. **看详情**：点岗位卡片，抽屉里看 JD、画像、匹配拆解、AI 理由
4. **转深度评鉴**：满意就点「在深度评鉴中打开」，岗位自动填成 JD

### 深度评鉴
1. **公司概况**（Module 1）：填写客户公司信息
2. **岗位 JD**（Module 2）：粘贴 JD 文本，自动提取关键字段
3. **岗位画像补充**（Module 3）：添加 deal-breaker、加分项、目标公司 tier
4. **上传简历**（Module 4）：拖入 PDF/DOCX/TXT，浏览器本地解析
5. **匹配度分析**（Module 5）：查看综合评分 + 5 维度详情 + AI 问答

## 深度评鉴的评分逻辑（5 维度）

| 维度 | 默认权重 | 评分依据 |
|---|---|---|
| 学历 | 18% | 学校 tier + 学位 + 专业相关性 |
| 公司背景 | 22% | 公司 tier + 任职时长 + 跳槽检测 + 与目标 tier 匹配 |
| 明星项目经验 | 20% | 关键词命中 must/nice + 影响力信号 + 行业明星项目（豆包/通义/可灵等 30+） |
| 履历匹配 | 25% | 技能匹配 + 经验年限 + 行业 + 职级 |
| 年龄 | 15% | AI 行业 95 后优先（≤26 满分 100，95 后 85，80 后 14-35） |

## 技术栈

- **Vite + React 19 + TypeScript**：前端框架
- **TailwindCSS**：样式系统（深海军蓝 + 金色点缀）
- **Zustand + persist**：状态管理 + localStorage 持久化
- **pdfjs-dist**：PDF 解析（客户端）
- **mammoth**：DOCX 解析
- **framer-motion**：动画
- **react-dropzone**：拖拽上传
- **lucide-react**：图标
- **Vercel Serverless**：`/api/jobs`（读飞书）、`/api/chat`、`/api/rank`
- **飞书多维表格 Open API**：岗位池数据源

## 部署到 Vercel

本项目已配置 Vercel 一键部署：

```bash
# 方式 1：Vercel CLI
npm i -g vercel
vercel --prod

# 方式 2：网页导入
# 1. 访问 https://vercel.com/new
# 2. 导入 GitHub 仓库 Allen-Wang-talents/bosi-analyzer
# 3. 框架自动识别为 Vite
# 4. 点击 Deploy
```

Vercel 环境变量：

| 变量 | 用途 |
|---|---|
| `FEISHU_APP_ID` | 飞书应用 App ID（读岗位池） |
| `FEISHU_APP_SECRET` | 飞书应用 App Secret |
| `MINIMAX_API_KEY` | MiniMax API Key（AI 解析 / 对话 / 精排） |

> 飞书应用要先申请 `base:record:read` 权限并被加为「北京AI岗位汇总」的只读协作者，否则读不到岗位。

## 部署到 Netlify（国内可访问的镜像）

`*.vercel.app` 在中国大陆被 DNS 污染（解析到 Twitter 的 IP），所以国内打不开。
Netlify 的 `*.netlify.app` 能直连，这套镜像就是为此存在的 —— **和 Vercel 跑的是同一份代码**
（业务逻辑在 `server/`，只有 req/res 适配层各写一份：Vercel 用 `api/`，Netlify 用 `netlify/functions/`）。

线上地址：<https://bosi-analyzer.netlify.app>

```bash
# CLI 装在临时目录，不污染系统 npm
npm --cache /tmp/npmcache i --prefix /tmp/netlify-tool netlify-cli
export PATH="/tmp/netlify-tool/node_modules/.bin:$PATH"

cd ~/Allen\ claude\ code/resume-analyzer
netlify deploy --prod --no-build --dir=dist --functions=netlify/functions
```

**三个必须知道的坑：**

1. **环境变量的值上限 5000 字符。** 飞书的 `FEISHU_USER_ACCESS_TOKEN` / `FEISHU_USER_REFRESH_TOKEN`
   都是 8.5KB 的 JWT，**放不进去**。所以 Netlify 这边只能配应用身份
   （`FEISHU_APP_ID` + `FEISHU_APP_SECRET`），必须先开通飞书的 `base:record:read` 权限并加只读协作者。
2. **site 级环境变量只能用 API 建，不能用 `netlify env:set`**（该命令在无 TTY 下静默失败）。
   正确的接口是 `POST /api/v1/accounts/<account_slug>/env?site_id=<site_id>`，
   body 形如 `[{"key": "...", "values": [{"context": "production", "value": "..."}]}]`。
   **不要带 `scopes` 字段** —— 免费计划会报 403「Upgrade your Netlify account to set specific scopes」。
3. **改了环境变量必须重新部署**，函数运行时环境变量是部署时注入的。

Netlify 环境变量：

| 变量 | 用途 | 长度 |
|---|---|---|
| `FEISHU_APP_ID` | 飞书应用 App ID（读岗位池） | 20 |
| `FEISHU_APP_SECRET` | 飞书应用 App Secret | 32 |
| `MINIMAX_API_KEY` | MiniMax API Key（AI 解析 / 对话 / 精排） | 125 |

## 安全说明

- MiniMax M3 API Key 存在浏览器 localStorage，明文保存
- **简历解析在客户端完成**，但 AI 解析 / 精排会把简历要点发给后端 → MiniMax。发给 LLM 的是**结构化简报**，不含 rawText、联系方式、生日
- **岗位的合同点位 / 预计收费永远不发给 LLM**
- 岗位池快照不进 git，也不进 `dist/`
- **生产部署风险**：因 API Key 在前端调用，任何人都能看到并使用你的 Key 额度。建议：
  - 增加后端代理 MiniMax M3 API
  - 在 Vercel 设置访问密码（Pro 计划）
  - 或在 API 控制台限制 Key 来源 IP

## 项目结构

```
api/             # Vercel Serverless: jobs / chat / rank
server/          # 服务端逻辑 (飞书读取)
shared/          # 前后端共用的岗位类型与映射
scripts/         # 本地工具 (拉岗位快照 / 匹配诊断)
src/
├── types/       # TS 类型定义
├── data/        # 默认数据 (tier 模板 / 岗位要求词表 / 明星项目 / 建议问题)
├── lib/         # 岗位匹配引擎 + 5 维评分引擎 + 解析器 + LLM 客户端
├── store/       # Zustand 全局状态 (分析 + 岗位推荐)
└── components/
    ├── layout/  # Header / Footer
    ├── modules/ # 业务模块
    └── ui/      # 通用 UI 组件 (Card / Score / Chat / Settings / History)
```

## License

MIT — 仅供博思猎头及合作伙伴内部使用。
