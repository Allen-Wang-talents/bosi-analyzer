// =====================================================
// 把飞书用户令牌同步到 Netlify Blobs
//
// 为什么需要: 飞书用户令牌 8.5KB, Netlify 环境变量单个值上限 5000 字符, 放不进去。
// 所以 Netlify 那套部署从 Blobs 里读令牌, 刷新后自己写回去。
//
// 为什么不用 @netlify/blobs SDK: 实测该 SDK 走签名 URL 通道, 写入的 blob
// 用同一个 API 读不到(SDK get 返回 undefined, API GET 返回 404)。
// 直接打 Blobs 的 REST 接口读写是通的, 所以这里手写 fetch。
//
// 用法:
//   NETLIFY_SITE_ID=<site_id> NETLIFY_AUTH_TOKEN=<token> node scripts/sync-feishu-token.mjs
//
// token 从 部署环境变量.txt 读(那个文件里有最新的一份)。
// 跑之前先确保 FEISHU_USER_ACCESS_TOKEN 是有效的 —— 过期的话脚本会先刷新一次。
// =====================================================
import { readFileSync, writeFileSync } from 'node:fs';

const SITE_ID = process.env.NETLIFY_SITE_ID;
const AUTH_TOKEN = process.env.NETLIFY_AUTH_TOKEN;
const ENV_FILE = new URL('../部署环境变量.txt', import.meta.url);
const STORE = 'bosi-secrets';
const KEY = 'feishu-user-token';

if (!SITE_ID || !AUTH_TOKEN) {
  console.error('需要 NETLIFY_SITE_ID 和 NETLIFY_AUTH_TOKEN 两个环境变量');
  process.exit(1);
}

const blobUrl = (key) => `https://api.netlify.com/api/v1/blobs/${SITE_ID}/${STORE}/${key}`;

function readEnvFile() {
  const vars = {};
  for (const line of readFileSync(ENV_FILE, 'utf8').split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx < 0) continue;
    vars[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return vars;
}

function jwtExpiry(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

async function refreshIfNeeded(vars) {
  const access = vars.FEISHU_USER_ACCESS_TOKEN;
  const exp = access ? jwtExpiry(access) : null;
  if (access && (exp === null || exp > Date.now() + 60_000)) {
    console.log('现有访问令牌还有效, 直接用');
    return vars;
  }

  console.log('访问令牌已过期, 先刷新一次...');
  const res = await fetch('https://accounts.feishu.cn/oauth/v3/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: vars.FEISHU_APP_ID,
      client_secret: vars.FEISHU_APP_SECRET,
      refresh_token: vars.FEISHU_USER_REFRESH_TOKEN,
    }),
  });
  const data = await res.json();
  if (!data.access_token) {
    throw new Error(`刷新失败: ${JSON.stringify(data).slice(0, 300)}`);
  }
  const next = {
    ...vars,
    FEISHU_USER_ACCESS_TOKEN: data.access_token,
    FEISHU_USER_REFRESH_TOKEN: data.refresh_token ?? vars.FEISHU_USER_REFRESH_TOKEN,
  };

  // 刷新令牌一次性 —— 换到新的必须立刻写回文件, 否则下次用旧的会失败
  const lines = readFileSync(ENV_FILE, 'utf8').split('\n').map((line) => {
    if (line.startsWith('FEISHU_USER_ACCESS_TOKEN=')) return `FEISHU_USER_ACCESS_TOKEN=${next.FEISHU_USER_ACCESS_TOKEN}`;
    if (line.startsWith('FEISHU_USER_REFRESH_TOKEN=')) return `FEISHU_USER_REFRESH_TOKEN=${next.FEISHU_USER_REFRESH_TOKEN}`;
    return line;
  });
  writeFileSync(ENV_FILE, lines.join('\n'));
  console.log('新令牌已写回 部署环境变量.txt');
  return next;
}

const vars = await refreshIfNeeded(readEnvFile());

const res = await fetch(blobUrl(KEY), {
  method: 'PUT',
  headers: {
    Authorization: `Bearer ${AUTH_TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    accessToken: vars.FEISHU_USER_ACCESS_TOKEN,
    refreshToken: vars.FEISHU_USER_REFRESH_TOKEN,
    savedAt: Date.now(),
  }),
});
if (!res.ok) {
  throw new Error(`写入 Blobs 失败: ${res.status} ${await res.text()}`);
}

// 写完立刻读回来核对 —— 不然「写成功但读不到」这种坑没法发现
const check = await fetch(blobUrl(KEY), { headers: { Authorization: `Bearer ${AUTH_TOKEN}` } });
const back = await check.json();
console.log('已写入 Blobs:', STORE, '/', KEY, '| 读回校验:', back?.accessToken === vars.FEISHU_USER_ACCESS_TOKEN ? '一致' : '不一致');
