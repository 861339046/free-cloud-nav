// Pages Function：服务点击统计（轻后端）
// 路径：/api/click  —— Cloudflare Pages 会自动识别 functions/ 目录，无需配置路由。
//
// 数据存储：Workers KV，绑定名必须是 CLICKS
//   创建：Cloudflare 控制台 → Workers & Pages → KV → Create namespace（如 nav-clicks）
//   绑定：Pages 项目 → Settings → Functions → KV namespace bindings
//         变量名 CLICKS → 选择上面创建的命名空间，保存后下次部署生效。
//   未绑定时不影响网站：接口返回 ok:false，前端静默忽略。
//
// 免费层额度：KV 读 10 万次/天、写 1 千次/天。POST 流程为
//「全局预算只读检查 → 每 IP 限流 → 落计数」，每个被计入的 POST 恰好 3 次写
//（预算计数 + 限流计数 + 点击计数），全天写量 ≤ 3 × 预算，硬顶保护免费额度；
// 默认预算 250 次/天（≈750 写，留足 messages/submit 与余量），RL_CLICK_BUDGET 可覆盖。
// 超预算 / 超限流的请求都是 0 写 early-exit，统计暂停但访客无感知；
// PV 侧另有浏览器每日去重（assets/pv.js），双保险。
//   - GET 全量列表（不带 id）需要 x-admin-token 头与环境变量 ADMIN_SECRET 恒时比对，
//     单项计数（带 id）保持公开，首页展示用。

import { checkRateLimit } from './_ratelimit.js';

const KEY_PREFIX = 'clicks:';
const MAX_ID_LEN = 60;
// 全局日预算默认值（次/天）：保护 KV 免费写额度，env RL_CLICK_BUDGET 可覆盖
const DEFAULT_BUDGET = 250;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' }
  });
}

function safeId(raw) {
  if (typeof raw !== 'string') return null;
  const id = raw.trim();
  if (!id || id.length > MAX_ID_LEN) return null;
  // 白名单：字母数字、连字符、下划线、点、空格、间隔号与常用中文。
  // 空格/点/间隔号是服务名刚需（"Oracle Cloud"、"Fly.io"、"信仰交易录 · 万法商铺"），
  // 少了它们这些卡片的点击统计从来记不进去。
  if (!/^[a-zA-Z0-9_\u4e00-\u9fa5\-. ·]+$/.test(id)) return null;
  return id;
}

// 恒时比较防时序侧信道（与 admin.js 保持一致）
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// POST /api/click  body: {"id":"Oracle Cloud"} —— 记录一次点击
// 写成本控制：全局预算检查（只读，超限 0 写 early-exit）→ 每 IP 限流 → 落计数。
// 因此每个被计入的 POST 恰好 3 次 KV 写，全天写量 ≤ 3 × 预算，绝不摸免费层上限。
export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.CLICKS) return json({ ok: false, reason: 'KV_NOT_BOUND' }, 200);

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, reason: 'BAD_JSON' }, 400); }

  const id = safeId(body && body.id);
  if (!id) return json({ ok: false, reason: 'BAD_ID' }, 400);

  try {
    // 全局日预算（只读检查）：超限直接返回，0 次 KV 写，统计暂停但访客无感知
    const day = new Date().toISOString().slice(0, 10);
    const budgetKey = 'rl:click:budget:' + day;
    const used = parseInt(await env.CLICKS.get(budgetKey) || '0', 10) || 0;
    if (used >= budgetLimit(env)) return json({ ok: false, reason: 'BUDGET_EXHAUSTED' }, 200);

    // 每 IP 限流：超限请求同样 0 写（checkRateLimit 超限时不落计数）
    const rl = await checkRateLimit(request, env, 'click', 200);
    if (!rl.ok) return json({ ok: false, reason: 'RATE_LIMITED', message: rl.message }, 429);

    await env.CLICKS.put(budgetKey, String(used + 1), { expirationTtl: 172800 });
    const key = KEY_PREFIX + id;
    const count = parseInt(await env.CLICKS.get(key) || '0', 10) || 0;
    await env.CLICKS.put(key, String(count + 1));
    return json({ ok: true, id, count: count + 1 });
  } catch (e) {
    return json({ ok: false, reason: 'KV_ERROR' }, 500);
  }
}

function budgetLimit(env) {
  const v = parseInt((env.RL_CLICK_BUDGET || '').trim(), 10);
  return (Number.isFinite(v) && v > 0) ? v : DEFAULT_BUDGET;
}

// GET /api/click            —— 返回全部计数（需 x-admin-token，自己看数据用）
// GET /api/click?id=Oracle  —— 查询单项计数（公开，首页展示用）
export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.CLICKS) return json({ ok: false, reason: 'KV_NOT_BOUND' }, 200);

  const url = new URL(request.url);
  const single = safeId(url.searchParams.get('id') || '');

  try {
    if (single) {
      const v = parseInt(await env.CLICKS.get(KEY_PREFIX + single) || '0', 10) || 0;
      return json({ ok: true, id: single, count: v });
    }
    // 全量列表含全站点击分布，属于敏感运营数据：要求管理员令牌
    const secret = (env.ADMIN_SECRET || '').trim();
    const token = (request.headers.get('x-admin-token') || '').trim();
    if (!secret || !safeEqual(token, secret)) {
      return json({ ok: false, message: '未授权' }, 401);
    }
    const list = await env.CLICKS.list({ prefix: KEY_PREFIX });
    const out = {};
    for (const k of list.keys) {
      out[k.name.slice(KEY_PREFIX.length)] = parseInt(await env.CLICKS.get(k.name) || '0', 10) || 0;
    }
    return json({ ok: true, stats: out });
  } catch (e) {
    return json({ ok: false, reason: 'KV_ERROR' }, 500);
  }
}
