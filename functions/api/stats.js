// Pages Function：流量统计查询（后台专用）
// GET /api/stats  —— 请求头 x-admin-token 需与环境变量 ADMIN_SECRET 一致
// 返回：总点击、按 id 汇总 Top、按日期 PV（含 pv-index-/pv-tool- 埋点键）
const KEY_PREFIX = 'clicks:';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' }
  });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.CLICKS) return json({ ok: false, reason: 'KV_NOT_BOUND' }, 200);
  if (!env.ADMIN_SECRET) return json({ ok: false, reason: 'ADMIN_SECRET_NOT_SET' }, 200);
  const token = request.headers.get('x-admin-token') || '';
  if (token !== env.ADMIN_SECRET) return json({ ok: false, message: '未授权' }, 401);

  try {
    const list = await env.CLICKS.list({ prefix: KEY_PREFIX });
    const byId = {};
    const byDate = {};
    let total = 0;
    for (const k of list.keys) {
      const name = k.name.slice(KEY_PREFIX.length);
      const v = parseInt(await env.CLICKS.get(k.name) || '0', 10) || 0;
      total += v;
      // 日期埋点键：xxx-2026-10-23
      const dm = name.match(/^(.*)-(\d{4}-\d{2}-\d{2})$/);
      if (dm) {
        byId[dm[1]] = (byId[dm[1]] || 0) + v;
        byDate[dm[2]] = (byDate[dm[2]] || 0) + v;
      } else {
        byId[name] = (byId[name] || 0) + v;
      }
    }
    const topIds = Object.keys(byId)
      .map(function (k) { return { id: k, count: byId[k] }; })
      .sort(function (a, b) { return b.count - a.count; })
      .slice(0, 50);
    const dates = Object.keys(byDate).sort().slice(-30);
    return json({
      ok: true,
      total: total,
      keys: list.keys.length,
      topIds: topIds,
      byDate: dates.map(function (d) { return { date: d, pv: byDate[d] }; })
    });
  } catch (e) {
    return json({ ok: false, reason: 'KV_ERROR' }, 200);
  }
}
