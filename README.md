# 免费云服务导航（keting.eu.org）

面向中文个人开发者的**零成本**导航站：真实免费额度的云服务清单 + 29 个纯本地在线工具 + 实测教程 + 服务状态监测，全部跑在免费层上，无服务器成本。

- 线上地址：<https://keting.eu.org>
- 技术栈：**Cloudflare Pages + Pages Functions + Supabase（免费层）+ Workers KV + GitHub Actions**

---

## 一、功能全景

| 模块 | 页面 / 接口 | 说明 |
| --- | --- | --- |
| 服务导航 | `index.html` | 20+ 免费云服务，分类筛选 + 关键词搜索；社区收录经审核后动态合并展示 |
| 收录申请 | `submit.html` → `/api/submit` | 访客提交服务信息，写入 Supabase（Pages Function 服务端中转，密钥不暴露） |
| 审核后台 | `admin.html` → `/api/admin` | 站长登录后「通过 / 拒绝 / 下架 / 删除」，通过即上架；含流量统计面板（`/api/stats`） |
| 留言板 | `board.html` → `/api/messages` | 昵称 + 留言，蜜罐防机器人 + 每 IP 每天 5 条限流 |
| 状态监测 | `status.html` → `/api/status` | GitHub Actions 每 30 分钟触发 `/api/cron-probe` 探测 12 个服务官网，结果写 KV；数据超 2 小时自动提示陈旧 |
| 工具箱 | `tools.html` + `tool-*.html` | 29 个纯前端工具，数据不出浏览器；页内搜索 + 近 7 天热门榜（`/api/popular`） |
| 实测教程 | `tutorials.html` + 7 篇文章 | Oracle / Supabase / Neon / Cloudflare Workers / R2 / Vercel / 腾讯云轻量 |
| PWA | `manifest.json` + `sw.js` | 可安装到桌面，离线可打开工具箱；PNG 图标（含 maskable） |
| SEO | `sitemap.xml` / `robots.txt` / OG 图 | 全站 canonical + og:image（百度主动推送已暂停，脚本注释待恢复）；`_headers` 下发安全响应头 |

## 二、目录结构

```
├── index.html / submit.html / admin.html / board.html / status.html / tools.html
├── game.html                         # 小游戏「信仰交易录 · 万法商铺」（独立主题，不外链暗色）
├── tutorials.html + *.html            # 教程
├── tool-*.html                        # 29 个工具页（纯前端）
├── about.html / privacy.html / 404.html
├── assets/                            # og.png、PWA 图标、fav.js、dark.css（暗色）、pv.js（PV 埋点）
├── functions/
│   ├── _scheduled.js                  #（保留）Pages 侧定时入口
│   └── api/
│       ├── submit.js / messages.js    # 写接口（限流 + 清洗 + 蜜罐）
│       ├── admin.js / stats.js        # 后台（恒时比较鉴权）
│       ├── click.js / popular.js / services.js / status.js
│       ├── cron-probe.js              # 定时任务触发点（x-cron-token 鉴权）
│       └── _ratelimit.js              # KV 近似限流器（fail-open）
├── .github/workflows/status-probe.yml # 每 30 分钟触发探测
├── _headers                           # 安全响应头 + CSP Report-Only
├── manifest.json / sw.js / sitemap.xml / robots.txt / feed.xml
├── status-probe.js                    # 状态探测逻辑（被 functions/_scheduled.js 引用）
└── supabase-setup.sql / supabase-messages.sql   # 建表 + RLS（各跑一次）
```

## 三、环境变量与绑定清单

在 Cloudflare Pages 项目 → **设置 → 变量和密钥** 配置（保存后**重新部署**生效）：

| 变量 | 用途 | 必需 |
| --- | --- | --- |
| `SUPABASE_URL` | Supabase 项目 URL | 提交收录 / 留言板 |
| `SUPABASE_ANON_KEY` | anon / publishable key（前端安全级别） | 同上 |
| `SUPABASE_SERVICE_KEY` | service_role 密钥（**只放服务端**） | 审核后台 |
| `ADMIN_SECRET` | 后台密码 + 统计接口令牌 | 审核后台 / 流量统计 |
| `CRON_SECRET` | 状态探测接口令牌 | 状态监测 |
| `RL_MESSAGES` / `RL_SUBMIT` / `RL_CLICK` | 覆盖默认限额（5 / 3 / 200 次每天） | 可选 |
| `RL_CLICK_BUDGET` | 覆盖点击统计全局日预算（默认 250 次/天，保护 KV 1000 次写/天额度） | 可选 |

KV 绑定：**Settings → Functions → KV namespace bindings**，变量名 `CLICKS` → 命名空间 `nav-clicks`（点击计数、状态数据、限流计数共用）。

GitHub 仓库 Secrets：`CRON_SECRET`（与 Pages 环境变量同值）——供 Actions 调用 `/api/cron-probe`。

> 令牌轮换：同时改 Pages 环境变量与 GitHub Secrets 两处，改完重新部署。

## 四、部署

1. 推送本仓库到 GitHub（仓库 `861339046/free-cloud-nav`）
2. Cloudflare → **Workers & Pages → 创建 → Pages → 连接到 Git**，选择仓库
3. 构建设置：Framework preset **None**、Build command 留空、Build output directory `/`
4. **Settings → Custom domains** 绑定 `keting.eu.org`（CNAME 指向 Pages 地址，自动签发 HTTPS）
5. 按上文配好环境变量与 KV 绑定，重新部署

## 五、定时任务（状态监测）

`.github/workflows/status-probe.yml` 每 30 分钟 POST 一次 `https://keting.eu.org/api/cron-probe`（带 `x-cron-token`），由接口探测 12 个服务并写入 KV。说明：

- GitHub schedule 按 UTC 执行，高峰可能延迟数分钟到数小时（GitHub 已知现象），页面会按数据时间提示新鲜度；
- 仓库连续 60 天无活动会被暂停定时任务，有推送即恢复；
- 可在 Actions 页手动 **Run workflow** 立即测试； Pages 自带的 Cron Trigger 已下线，勿再依赖。
- 每次运行**先 GET 一次 `/api/services` 做 Supabase 保活**（服务端会查一次 `submissions` 表），避免免费项目因 7 天无数据库活动被自动暂停。

## 六、日常维护

- **新增服务**：后台「通过」即上架（动态区）；要固化进静态代码就在后台点「生成固化代码」粘进 `index.html` 的 `data` 数组（重名自动去重）
- **新增工具**：复制一个 `tool-*.html` 改内容，在 `tools.html` 加卡片，`sitemap.xml` 加条目
- **额度变动**：及时更新 `index.html` 对应条目的 `note`
- **安全头收紧**：CSP 现为 Report-Only，观察无违规报告后可改为强制（改 `_headers`）
- **暗色模式**：样式集中在 `assets/dark.css`，全站统一外链；新增页面在 `</head>` 前加一行 `<link rel="stylesheet" href="assets/dark.css" />` 即可

### 故障：后台报「error code: 1016」/ 登录失败

**原因**：Supabase 免费项目 7 天无数据库活动会被自动暂停；暂停后 `<ref>.supabase.co` 返回 NXDOMAIN（外部看和项目被删除一样），Cloudflare 侧表现为 HTTP 530 + `error code: 1016`。此时后台、留言板、提交收录、首页动态收录全部不可用；静态页面与 KV 点击统计不受影响。

**恢复**：登录 Supabase Dashboard → 选中项目 → **Resume project** → 等待 2–5 分钟。数据完整保留，暂停后 1 年内可恢复。用 `curl https://keting.eu.org/api/services` 验证返回 `{"ok":true,...}` 即恢复。

**防复发**：靠上面 `status-probe.yml` 的保活步骤。若仓库长期不推送（GitHub 60 天会停定时任务），记得每 1–2 个月去 Actions 页手动 **Run workflow** 一次。

## 七、安全设计要点

- 写接口（提交 / 留言 / 点击）全部经 KV 近似限流，fail-open，限额可用环境变量覆盖
- 用户输入服务端二次清洗（剥 `<>`、控制字符、限长）；后台渲染一律转义，链接走协议白名单
- 管理员令牌恒时比较（防时序侧信道）；失败统一 401 文案
- `_headers`：nosniff / XFO DENY / HSTS / Permissions-Policy / CSP Report-Only
- 密码只存 `sessionStorage`，关标签页即清除

## 八、注意事项

- 免费额度以各官网实时政策为准，本站仅作整理，不构成承诺
- Supabase 免费层有项目数与存储限制，表结构变更先跑对应 `supabase-*.sql`
- KV 写额度 1 千次/天，限流器即为此而设；若调高 `RL_CLICK` 请留意额度
