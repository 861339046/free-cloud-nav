// Pages Function：外部定时触发状态探测（GitHub Actions cron 等外部调度器调用）
// GET/POST /api/cron-probe，请求头：x-cron-token: <CRON_SECRET>
//
// 背景：Cloudflare 新版面板已移除 Pages 项目的 Cron Trigger 入口，因此改用
// 「GitHub Actions 定时任务 → 调用本接口 → 接口内执行探测并写 KV」的链路。
// 公开仓库的 Actions 定时任务免费；私有仓库也在每月 2000 分钟免费额度内（本任务每次 <10 秒）。
//
// 安全设计：
//   - 必须配置环境变量 CRON_SECRET，未配置时端点整体禁用（403），避免被白嫖算力；
//   - 令牌用常量时间比较，防时序侧信道；
//   - 只写 status:* 键，不读不删，撞库风险可控。

import { runStatusProbes } from '../../status-probe.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status: status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' }
  });
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function handle(context) {
  var env = context.env;
  var secret = typeof env.CRON_SECRET === 'string' ? env.CRON_SECRET.trim() : '';
  if (!secret) return json({ ok: false, reason: 'CRON_SECRET_NOT_SET', message: '站点未配置 CRON_SECRET，端点已禁用' }, 403);
  var token = context.request.headers.get('x-cron-token') || '';
  if (!safeEqual(token, secret)) return json({ ok: false, reason: 'BAD_TOKEN' }, 403);
  if (!env.CLICKS) return json({ ok: false, reason: 'KV_NOT_BOUND', message: 'Pages 项目未绑定 KV 命名空间' }, 500);
  try {
    var r = await runStatusProbes(env);
    return json({ ok: true, total: r.total, written: r.written, healthy: r.ok });
  } catch (e) {
    return json({ ok: false, reason: 'PROBE_FAILED', message: String(e && e.message || e) }, 500);
  }
}

export async function onRequestGet(context) { return handle(context); }
export async function onRequestPost(context) { return handle(context); }
