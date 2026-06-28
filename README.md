# 博思人才评荐网 (Bosi Talent Recommendation Network)

猎头顾问专用简历与岗位匹配度智能分析工具。**在线访问**：<https://bosi-analyzer.vercel.app>

## 功能

- **5 大模块**：公司概况 / 岗位 JD / 岗位画像补充 / 简历上传 / 匹配度分析
- **5 维度评分**：学历 / 公司背景 / 明星项目经验 / 履历匹配 / **年龄（95 后优先）**
- **推荐档位**：≥90 强烈推荐 / 80-90 建议推荐给客户 / 70-80 可以推荐试试 / <70 不建议推荐
- **AI 对话**（MiniMax M3）：对评分依据进行自然语言追问
- **本地优先**：简历不上传服务器，所有解析在浏览器完成
- **历史记录 + Tier 名单管理 + 权重自定义**

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

1. **公司概况**（Module 1）：填写客户公司信息
2. **岗位 JD**（Module 2）：粘贴 JD 文本，自动提取关键字段
3. **岗位画像补充**（Module 3）：添加 deal-breaker、加分项、目标公司 tier
4. **上传简历**（Module 4）：拖入 PDF/DOCX/TXT，浏览器本地解析
5. **匹配度分析**（Module 5）：查看综合评分 + 5 维度详情 + AI 问答

## 评分逻辑（5 维度）

| 维度 | 默认权重 | 评分依据 |
|---|---|---|
| 学历 | 18% | 学校 tier + 学位 + 专业相关性 |
| 公司背景 | 22% | 公司 tier + 任职时长 + 跳槽检测 + 与目标 tier 匹配 |
| 明星项目经验 | 20% | 关键词命中 must/nice + 影响力信号 + 行业明星项目（豆包/通义/可灵等 30+） |
| 履历匹配 | 25% | 技能匹配 + 经验年限 + 行业 + 职级 |
| 年龄 | 15% | AI 行业 95 后优先（≤26 满分 100，95 后 85，80 后 14-35） |

## 技术栈

- **Vite + React 18 + TypeScript**：前端框架
- **TailwindCSS**：样式系统（深海军蓝 + 金色点缀）
- **Zustand + persist**：状态管理 + localStorage 持久化
- **pdfjs-dist**：PDF 解析（客户端）
- **mammoth**：DOCX 解析
- **framer-motion**：动画
- **react-dropzone**：拖拽上传
- **lucide-react**：图标
- **MiniMax M3 API**（fetch，OpenAI 兼容）：AI 对话（浏览器直连，无后端）

## 部署到 Vercel

本项目已配置 Vercel 一键部署：

```bash
# 方式 1：Vercel CLI
npm i -g vercel
vercel --prod

# 方式 2：网页导入
# 1. 访问 https://vercel.com/new
# 2. 导入 GitHub 仓库 Allen-he-0226/bosi-talent-analyzer
# 3. 框架自动识别为 Vite
# 4. 点击 Deploy
```

## 安全说明

- MiniMax M3 API Key 存在浏览器 localStorage，明文保存
- 简历解析完全在客户端完成，不上传任何服务器
- **生产部署风险**：因 API Key 在前端调用，任何人都能看到并使用你的 Key 额度。建议：
  - 增加后端代理 MiniMax M3 API
  - 在 Vercel 设置访问密码（Pro 计划）
  - 或在 API 控制台限制 Key 来源 IP

## 项目结构

```
src/
├── types/        # TS 类型定义
├── data/         # 默认数据 (tier 模板 / 关键词种子 / 明星项目 / 建议问题)
├── lib/          # 评分引擎 (5 维度) + 解析器 + LLM 客户端 + 格式化
├── store/        # Zustand 全局状态 + persist
└── components/
    ├── layout/   # Header / Footer
    ├── modules/  # 5 大业务模块
    └── ui/       # 通用 UI 组件 (Card / Score / Chat / Settings / History)
```

## License

MIT — 仅供博思猎头及合作伙伴内部使用。
