// Pages Function：定时探测免费服务可用性（Scheduled 事件入口）
// 探测逻辑已抽到仓库根目录 status-probe.js，与 functions/api/cron-probe.js 共用。
//
// 注意：Cloudflare 新版面板已下掉 Pages 项目的 Cron Trigger 入口（Pages 进入维护期，
// 新特性只进 Workers），本文件保留作为「万一入口恢复」的兼容路径——配置了 Cron 就会跑，
// 没配置也不影响任何东西。当前实际触发方式见 functions/api/cron-probe.js：
// GitHub Actions 每 30 分钟调用一次 /api/cron-probe（令牌见环境变量 CRON_SECRET）。
//
// 探测结果写入 KV（绑定名 CLICKS 同命名空间），键：status:<name>
//   { name, url, ok, code, ms, ts }

import { runStatusProbes } from '../status-probe.js';

export async function onScheduled(event) {
  if (!event.env || !event.env.CLICKS) return;
  try {
    await runStatusProbes(event.env);
  } catch (e) { /* 探测失败等下一轮 */ }
}
