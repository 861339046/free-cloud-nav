// Pages Function：服务状态查询（公开）
// GET /api/status  —— 读取 KV 中 status:* 探测记录，返回各服务最近状态
// 无数据（未配 cron 或未绑定 KV）时返回 ok:false，前端显示提示。
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' }
  });
}

export async function onRequestGet(context) {
  const { env } = context;
  if (!env.CLICKS) return json({ ok: false, reason: 'KV_NOT_BOUND', items: [] }, 200);
  try {
    const list = await env.CLICKS.list({ prefix: 'status:' });
    const items = [];
    for (const k of list.keys) {
      const raw = await env.CLICKS.get(k.name);
      if (!raw) continue;
      try {
        const r = JSON.parse(raw);
        if (r && r.name) items.push(r);
      } catch (e) { /* 跳过坏记录 */ }
    }
    items.sort(function (a, b) {
      if (a.ok !== b.ok) return a.ok ? 1 : -1; // 异常的排前面
      return (b.ts || 0) - (a.ts || 0);
    });
    return json({ ok: true, items: items });
  } catch (e) {
    return json({ ok: false, reason: 'KV_ERROR', items: [] }, 200);
  }
}
