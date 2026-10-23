// Pages Function：公开热门榜
// GET /api/popular?days=7&top=8  —— 聚合 KV 中最近 N 天 pv-tool-* 点击，返回 Top 工具列表
// 数据来源与 /api/click 同一命名空间（绑定名 CLICKS）。未绑定时返回空列表，前端隐藏模块。
const KEY_PREFIX = 'clicks:pv-tool-';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' }
  });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.CLICKS) return json({ ok: false, reason: 'KV_NOT_BOUND', items: [] }, 200);

  const url = new URL(request.url);
  let days = parseInt(url.searchParams.get('days') || '7', 10);
  if (!isFinite(days) || days < 1 || days > 90) days = 7;
  let top = parseInt(url.searchParams.get('top') || '8', 10);
  if (!isFinite(top) || top < 1 || top > 30) top = 8;

  try {
    // 计算日期窗口（UTC，与埋点侧 toISOString().slice(0,10) 对齐）
    const cutoff = new Date(Date.now() - days * 86400000);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const list = await env.CLICKS.list({ prefix: KEY_PREFIX });
    const agg = {};
    for (const k of list.keys) {
      // 键形如 clicks:pv-tool-uuid-2026-10-23：末 10 位是日期
      const name = k.name;
      const date = name.slice(-10);
      if (date < cutoffStr) continue;
      const tool = name.slice(KEY_PREFIX.length, -11); // 去掉前缀与 -日期
      if (!tool) continue;
      const v = parseInt(await env.CLICKS.get(name) || '0', 10) || 0;
      agg[tool] = (agg[tool] || 0) + v;
    }
    const items = Object.keys(agg)
      .map(function (t) { return { tool: t, pv: agg[t] }; })
      .sort(function (a, b) { return b.pv - a.pv; })
      .slice(0, top);
    return json({ ok: true, days: days, items: items });
  } catch (e) {
    return json({ ok: false, reason: 'KV_ERROR', items: [] }, 200);
  }
}
