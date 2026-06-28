// =====================================================
// QA 引擎 - 调度 question 到 LLM (走 /api/chat 后端代理)
// =====================================================
import type { ChatMessage } from '@/types';
import { askAboutAnalysis, ApiKeyMissingError, type AskContext } from './llmClient';

export async function askQuestion(
  question: string,
  ctx: AskContext,
  onMessage?: (msg: ChatMessage) => void
): Promise<ChatMessage> {
  // 生成 pending 消息
  const pendingMsg: ChatMessage = {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    role: 'assistant',
    content: '',
    timestamp: new Date().toISOString(),
    pending: true,
  };

  try {
    const answer = await askAboutAnalysis(question, ctx);
    return {
      ...pendingMsg,
      pending: false,
      content: answer,
    };
  } catch (e) {
    if (e instanceof ApiKeyMissingError) {
      return {
        ...pendingMsg,
        pending: false,
        error: true,
        content: `⚠️ AI 服务暂不可用\n\n${e.message}\n\n请联系管理员检查 Vercel 项目配置（MINIMAX_API_KEY 环境变量）。`,
      };
    }
    const errMsg = e instanceof Error ? e.message : String(e);
    return {
      ...pendingMsg,
      pending: false,
      error: true,
      content: `调用失败: ${errMsg}\n\n请检查网络连接后重试。`,
    };
  }
}