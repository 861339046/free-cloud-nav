// Pages Function 内部模块：KV 近似限流器（写接口防刷）
// 用法：
//   import { checkRateLimit } from './_ratelimit.js';
//   const rl = await checkRateLimit(request, env, 'messages', 5);
//   if (!rl.ok) return json({ ok: false, message: rl.message }, 429);
//
// 设计要点：
//   - 键：rl:<api>:<IP>:<UTC 日期>， expirationTtl 2 天自动过期
//   - 计数在 KV 最终一致模型下是近似的（足够防刷，不追求精确）
//   - fail-open：KV 未绑定 / 读失败 / 写失败一律放行，限流故障不能拖垮业务
//   - 限额可用 Pages 环境变量覆盖：RL_<API 大写>（如 RL_MESSAGES=10）

const DAY_MS = 24 * 60 * 60 * 1000;

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

function clientIp(request) {
  // Cloudflare 边缘一定会带上 CF-Connecting-IP；兜底用 x-forwarded-for 首段
  const cf = request.headers.get('cf-connecting-ip');
  if (cf) return cf.trim();
  const xff = request.headers.get('x-forwarded-for') || '';
  const first = xff.split(',')[0].trim();
  return first || 'unknown';
}

function parseLimit(raw, fallback) {
  const n = parseInt(raw, 10);
  return isFinite(n) && n > 0 && n <= 100000 ? n : fallback;
}

// 返回 { ok: true, remaining, limit } 或 { ok: false, remaining, limit, message }
export async function checkRateLimit(request, env, api, defaultLimit) {
  const limit = parseLimit(env['RL_' + api.toUpperCase()], defaultLimit);
  let kv = null;
  try { kv = env.CLICKS; } catch (e) { kv = null; }
  if (!kv) return { ok: true, remaining: limit, limit }; // fail-open：未绑定 KV

  const key = 'rl:' + api + ':' + clientIp(request) + ':' + todayUTC();
  let n = 0;
  try {
    n = parseInt((await kv.get(key)) || '0', 10) || 0;
  } catch (e) {
    return { ok: true, remaining: limit, limit }; // fail-open：读失败
  }
  if (n >= limit) {
    return { ok: false, remaining: 0, limit, message: '操作太频繁了，请明天再试（每位访客每天最多 ' + limit + ' 次）' };
  }
  try {
    await kv.put(key, String(n + 1), { expirationTtl: Math.floor(DAY_MS * 2 / 1000) });
  } catch (e) {
    // 写失败也放行：宁可少数一次计数，不误伤正常访客
  }
  return { ok: true, remaining: limit - n - 1, limit };
}
