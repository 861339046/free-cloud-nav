// Pages Function：定时探测免费服务可用性（Scheduled / Cron Trigger）
// 部署后需在 Cloudflare 控制台为 Pages 项目添加 Cron Trigger，例如每 30 分钟：
//   Pages 项目 → Settings → Functions → Cron Triggers → Add cron（Cron 表达式 */30 * * * *）
// 探测结果写入 KV（绑定名 CLICKS 同命名空间），键：status:<name>
//   { name, url, ok, code, ms, ts }
// 注意：免费 Workers 每日 10 万次请求额度；每 30 分钟 × 12 个目标 ≈ 576 次/天，远低于额度。

const TARGETS = [
  { name: 'Oracle Cloud', url: 'https://www.oracle.com/cloud/' },
  { name: 'Cloudflare', url: 'https://www.cloudflare.com/' },
  { name: 'Supabase', url: 'https://supabase.com/' },
  { name: 'Neon', url: 'https://neon.com/' },
  { name: 'Vercel', url: 'https://vercel.com/' },
  { name: 'GitHub', url: 'https://github.com/' },
  { name: 'Render', url: 'https://render.com/' },
  { name: 'Fly.io', url: 'https://fly.io/' },
  { name: 'Railway', url: 'https://railway.com/' },
  { name: 'Backblaze', url: 'https://www.backblaze.com/' },
  { name: '腾讯云', url: 'https://cloud.tencent.com/' },
  { name: 'keting.eu.org', url: 'https://keting.eu.org/' }
];

const TIMEOUT_MS = 8000;

async function probe(target) {
  const started = Date.now();
  try {
    const res = await fetch(target.url, {
      method: 'GET',
      headers: { 'user-agent': 'keting-status-monitor/1.0 (+https://keting.eu.org)' },
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    return {
      name: target.name,
      url: target.url,
      ok: res.status >= 200 && res.status < 400,
      code: res.status,
      ms: Date.now() - started,
      ts: Date.now()
    };
  } catch (e) {
    return {
      name: target.name,
      url: target.url,
      ok: false,
      code: 0,
      ms: Date.now() - started,
      ts: Date.now(),
      err: String(e && e.name || 'fetch_failed')
    };
  }
}

export async function onScheduled(event) {
  if (!event.env || !event.env.CLICKS) return;
  const results = await Promise.all(TARGETS.map(probe));
  for (const r of results) {
    try {
      await event.env.CLICKS.put('status:' + r.name, JSON.stringify(r));
    } catch (e) { /* 单条失败不影响其他 */ }
  }
}
