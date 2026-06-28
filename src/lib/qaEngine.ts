// =====================================================
// QA 引擎 - 调度 question 到 LLM
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
        content: '⚠️ 请先在设置中配置 MiniMax M3 API Key 才能使用对话功能。\n\n设置路径：右上角 ⚙️ 设置 → API Key',
      };
    }
    const errMsg = e instanceof Error ? e.message : String(e);
    return {
      ...pendingMsg,
      pending: false,
      error: true,
      content: `调用失败: ${errMsg}\n\n请检查：1) API Key 是否正确；2) 网络是否通畅；3) 是否欠费。`,
    };
  }
}