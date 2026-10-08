// Pages Function：服务点击统计（轻后端）
// 路径：/api/click  —— Cloudflare Pages 会自动识别 functions/ 目录，无需配置路由。
//
// 数据存储：Workers KV，绑定名必须是 CLICKS
//   创建：Cloudflare 控制台 → Workers & Pages → KV → Create namespace（如 nav-clicks）
//   绑定：Pages 项目 → Settings → Functions → KV namespace bindings
//         变量名 CLICKS → 选择上面创建的命名空间，保存后下次部署生效。
//   未绑定时不影响网站：接口返回 ok:false，前端静默忽略。
//
// 免费层额度：KV 读 10 万次/天、写 1 千次/天 —— 小流量站点完全够用。

const KEY_PREFIX = 'clicks:';
const MAX_ID_LEN = 60;

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
  // 只允许字母数字、连字符、下划线和常见中文字符，防注入与键滥用
  if (!/^[a-zA-Z0-9_\u4e00-\u9fa5-]+$/.test(id)) return null;
  return id;
}

// POST /api/click  body: {"id":"Oracle Cloud"} —— 记录一次点击
export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.CLICKS) return json({ ok: false, reason: 'KV_NOT_BOUND' }, 200);

  let body;
  try { body = await request.json(); } catch { return json({ ok: false, reason: 'BAD_JSON' }, 400); }

  const id = safeId(body && body.id);
  if (!id) return json({ ok: false, reason: 'BAD_ID' }, 400);

  const key = KEY_PREFIX + id;
  let count = 0;
  try {
    count = parseInt(await env.CLICKS.get(key) || '0', 10) || 0;
    await env.CLICKS.put(key, String(count + 1));
  } catch (e) {
    return json({ ok: false, reason: 'KV_ERROR' }, 500);
  }
  return json({ ok: true, id, count: count + 1 });
}

// GET /api/click            —— 返回全部计数（自己看数据用）
// GET /api/click?id=Oracle  —— 查询单项计数
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
