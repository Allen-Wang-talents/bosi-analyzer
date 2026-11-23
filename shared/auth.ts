// =====================================================
// 账号体系 —— 前后端共用的类型与账号归一化规则
//
// 账号标识: 手机号 或 邮箱, 自动识别 (含 @ 就是邮箱)。
// 归一化: 手机号只留数字 (去掉 +86 前缀、空格、横线、括号), 邮箱转小写 ——
// 这样同一个人的两种写法能对上号。
// =====================================================

export type AccountType = 'phone' | 'email';

/** 对外的用户信息 (不含密码相关字段) */
export type AuthUser = {
  id: string;
  /** 归一化后的账号 —— 手机号是纯数字, 邮箱是小写 */
  account: string;
  accountType: AccountType;
  phone?: string;
  email?: string;
  name?: string;
  /** 所在公司名称 (注册时必填) */
  company: string;
  createdAt: number;
  lastLoginAt: number;
};

export const MIN_PASSWORD_LEN = 6;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type NormalizedAccount = {
  type: AccountType;
  /** 拿来当唯一键的归一化结果 */
  key: string;
  /** 展示用 */
  display: string;
};

/** 把用户填的账号归一化 —— 填得不对返回 null */
export function normalizeAccount(raw: string): NormalizedAccount | null {
  const text = (raw ?? '').trim();
  if (!text) return null;

  if (text.includes('@')) {
    const email = text.toLowerCase();
    if (!EMAIL_RE.test(email)) return null;
    return { type: 'email', key: email, display: email };
  }

  let digits = text.replace(/[\s\-()（）+]/g, '');
  if (digits.startsWith('86') && digits.length === 13) digits = digits.slice(2);
  if (!/^\d{7,15}$/.test(digits)) return null;
  return { type: 'phone', key: digits, display: digits };
}
