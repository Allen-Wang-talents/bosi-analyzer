// =====================================================
// Netlify Function - 账号 (注册 / 登录 / 会话)
//
// 业务逻辑在 server/auth.ts, 这里只做适配 —— 账号数据存在 Netlify Blobs 里,
// 这个函数跑在 Netlify 上才有那个凭证。
// =====================================================
import { handleAuthRequest } from '../../server/auth.ts';

export const config = { timeout: 30 };

export default async function handler(req: Request): Promise<Response> {
  return handleAuthRequest(req);
}
