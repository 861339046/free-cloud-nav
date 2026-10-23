// 共享探测逻辑：免费服务官网可用性探测 + 写入 KV
// 被两处引用：
//   functions/_scheduled.js     —— Pages 原生 Scheduled 事件（若面板恢复 Cron 入口即自动生效）
//   functions/api/cron-probe.js —— HTTP 触发（GitHub Actions 定时任务调用，见 .github/workflows/status-probe.yml）
// 探测结果写入 KV（绑定名 CLICKS，命名空间 nav-clicks），键：status:<name>
//   { name, url, ok, code, ms, ts }
// 免费 Workers 每日 10 万次请求额度；每 30 分钟 × 12 个目标 ≈ 576 次/天，远低于额度。

const TARGETS = [
  // 注意：不要用 www.oracle.com/cloud/ 营销页——Akamai 会按 IP 段返回 403（误报宕机）。
  // ocistatus 是 Oracle 官方状态页，语义上也更适合做可用性监控。
  { name: 'Oracle Cloud', url: 'https://ocistatus.oraclecloud.com/' },
  { name: 'Cloudflare', url: 'https://www.cloudflare.com/' },
  { name: 'Supabase', url: 'https://supabase.com/' },
  { name: 'Neon', url: 'https://neon.com/' },
  { name: 'Vercel', url: 'https://vercel.com/' },
  // 注意：不要用 github.com 首页——Akamai 会间歇性按 IP 段返回 403（误报宕机）。
  // api.github.com 是开放式 API 入口，任何 UA 都稳定 200，且语义上就是「服务可用」。
  { name: 'GitHub', url: 'https://api.github.com/' },
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

// 并发探测全部目标并写入 KV；单条写入失败不影响其他
// 返回 { total, written, ok } 供调用方记录日志/响应
export async function runStatusProbes(env) {
  const results = await Promise.all(TARGETS.map(probe));
  let written = 0;
  for (const r of results) {
    try {
      await env.CLICKS.put('status:' + r.name, JSON.stringify(r));
      written++;
    } catch (e) { /* 单条失败不影响其他 */ }
  }
  return {
    total: results.length,
    written: written,
    ok: results.filter(function (r) { return r.ok; }).length
  };
}
