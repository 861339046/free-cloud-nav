// Pages Function：工具箱留言板（GET /api/messages 列表 · POST /api/messages 提交）
// 复用 Supabase 变量：SUPABASE_URL / SUPABASE_ANON_KEY（同 submit.js）
// 表与 RLS 见仓库根目录 supabase-messages.sql（只需跑一次）。
//
// 设计要点：
//   - GET：anon 可 select（RLS），返回最近 50 条，按时间倒序
//   - POST：清洗（剥尖括号/控制字符/限长）后 insert；蜜罐字段假成功
//   - POST 限流：每 IP 每天 5 条（KV 近似计数，可用 RL_MESSAGES 覆盖），429 拒绝
//   - 应用层错误一律 HTTP 200 + ok:false，避免被 Cloudflare 错误页吞掉信息

import { checkRateLimit } from './_ratelimit.js';

const MAX = { nickname: 20, content: 300, tool: 40 };
const URL_RE = /^https?:\/\/.+\..+/;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' }
  });
}
function cleanEnv(v) {
  return typeof v === 'string' ? v.trim().replace(/^["']+|["']+$/g, '') : '';
}
function sanitize(v, max) {
  return String(v == null ? '' : v)
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

async function supabase(env, path, opts) {
  const url = cleanEnv(env.SUPABASE_URL).replace(/\/+$/, '');
  const key = cleanEnv(env.SUPABASE_ANON_KEY);
  if (!url || !key) return { ok: false, reason: 'NOT_CONFIGURED' };
  return fetch(url + '/rest/v1/' + path, Object.assign({
    headers: {
      'apikey': key,
      'Authorization': 'Bearer ' + key,
      'Content-Type': 'application/json'
    }
  }, opts || {}));
}

// GET /api/messages?limit=50 —— 最近留言
export async function onRequestGet(context) {
  const { env } = context;
  let limit = 50;
  try {
    const u = new URL(context.request.url);
    const q = parseInt(u.searchParams.get('limit') || '50', 10);
    if (isFinite(q) && q > 0 && q <= 100) limit = q;
  } catch (e) {}
  let res;
  try {
    res = await supabase(env, 'messages?select=id,nickname,content,tool,created_at&order=created_at.desc&limit=' + limit);
  } catch (e) {
    return json({ ok: false, reason: 'FETCH_FAILED', message: String(e && e.message || e) });
  }
  if (!res.ok) {
    return json({ ok: false, reason: res.status === 401 ? 'BAD_KEY' : 'UPSTREAM', message: 'Supabase 查询失败' });
  }
  if (res.ok === false) return json({ ok: false, reason: 'NOT_CONFIGURED', rows: [] });
  let rows = [];
  try { rows = await res.json(); } catch (e) { return json({ ok: false, reason: 'BAD_JSON' }); }
  if (!Array.isArray(rows)) return json({ ok: false, reason: 'BAD_SHAPE', rows: [] });
  return json({ ok: true, rows: rows });
}

// POST /api/messages —— 提交留言
export async function onRequestPost(context) {
  const { request, env } = context;
  let b;
  try { b = await request.json(); } catch { return json({ ok: false, message: '请求格式错误' }, 400); }

  // 蜜罐：机器人填了直接假成功
  if (b.website) return json({ ok: true });

  // 限流：蜜罐之后、入库之前（机器人不消耗真实访客配额）
  const rl = await checkRateLimit(request, env, 'messages', 5);
  if (!rl.ok) return json({ ok: false, message: rl.message }, 429);

  const s = {
    nickname: sanitize(b.nickname, MAX.nickname),
    content: sanitize(b.content, MAX.content),
    tool: sanitize(b.tool, MAX.tool)
  };
  if (!s.nickname) s.nickname = '匿名访客';
  if (s.content.length < 2) return json({ ok: false, message: '留言至少 2 个字' }, 400);
  if (s.content.length > MAX.content) return json({ ok: false, message: '留言不超过 300 字' }, 400);

  let res;
  try {
    res = await supabase(env, 'messages', {
      method: 'POST',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify([{
        nickname: s.nickname,
        content: s.content,
        tool: s.tool || null
      }])
    });
  } catch (e) {
    return json({ ok: false, message: '转发到 Supabase 失败（网络异常）：' + (e && e.message) });
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return json({ ok: false, upstreamStatus: res.status, message: '留言保存失败：' + text.slice(0, 200) });
  }
  if (res.ok === false) return json({ ok: false, message: '服务端未配置 Supabase（SUPABASE_URL / SUPABASE_ANON_KEY）' });
  return json({ ok: true });
}
