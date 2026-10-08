# 免费云服务导航 · 部署与上线指南

> 方案：**Cloudflare Pages（免费托管）+ 域名（可用免费 eu.org 二级域名，零成本；或付费域名）**
> 为什么选它：国内访问快、百度收录好、能建独立品牌——这三点正是「中文流量变现」的命门。
> 代码是纯静态站点 + 可选轻后端（Supabase 存提交申请、Pages Functions 做点击统计），全部免费层，零服务器成本。

---

## 步骤一：把代码推到 Git 仓库

1. 注册 GitHub（或 GitLab）账号
2. 新建仓库，名称建议 `free-cloud-nav`
3. 把本目录的 `index.html`、`robots.txt`、`sitemap.xml` 推上去

```bash
git init
git add .
git commit -m "free cloud nav"
git branch -M main
git remote add origin <你的仓库地址>
git push -u origin main
```

---

## 步骤二：用 Cloudflare Pages 部署

1. 注册 [Cloudflare](https://www.cloudflare.com/) 账号（免费）
2. 控制台 → **Workers & Pages** → **创建** → **Pages** → **连接到 Git**
3. 授权并选择 `free-cloud-nav` 仓库
4. 构建设置：
   - Framework preset：**None**
   - Build command：留空
   - Build output directory：`/`（根目录）
5. 点击部署，十几秒后得到 `xxx.pages.dev` 临时域名，先验证能打开

---

## 步骤三：绑定一个域名（免费二级域名或付费域名均可）

> **零成本方案（推荐新手）**：如果你还没有域名，可以申请免费的二级域名，例如 [eu.org](https://www.eu.org/)，无需花钱。申请通过后，直接跳到「步骤四」把它绑到 Cloudflare Pages 即可，下面的付费购买步骤全部可跳过。本项目即使用 `keting.eu.org` 免费二级域名上线。

- **推荐（付费）**：直接在 Cloudflare Registrar 购买（价格透明、自动接管 DNS）
- **或（付费）**：在阿里云 / 腾讯云买 `.cn` 或 `.com`，再把域名的 DNS 改成 Cloudflare 提供的 NS 服务器
- 命名建议：好记、含「free / 云 / 导航」含义的短域名
- **已有免费域名（如 eu.org）**：跳过付费步骤，直接进入步骤四绑定

---

## 步骤四：绑定自有域名（自动 HTTPS）

1. Cloudflare Pages → 项目 → **Custom domains** → 输入您的域名
2. 按提示在域名服务商处添加一条 **CNAME** 记录，指向 Pages 提供的地址
3. Cloudflare 会自动签发 SSL 证书，约 10–30 分钟后 `您的域名` 即可通过 HTTPS 访问

> 部署完成后，请把本仓库里的两处占位域名替换为您自己的：
> - `robots.txt` 中的 `https://您的域名/sitemap.xml`
> - `sitemap.xml` 中的 `https://您的域名/`

---

## 步骤五：让百度收录（中文流量关键）

1. 登录 [百度搜索资源平台](https://ziyuan.baidu.com)，添加并验证站点
2. 提交 `sitemap.xml`（本仓库已提供，记得先替换成真实域名）
3. 确认 `robots.txt` 允许抓取（本仓库已提供）
4. 持续更新内容（加实测教程类文章），收录与排名会逐步提升

---

## 后续维护

- **新增服务**：编辑 `index.html` 里的 `data` 数组，加一个对象即可（`name` / `cat` / `desc` / `note` / `url`）
- **免费额度变动**：各官网政策常变，留意后及时更新 `note` 字段
- **变现**：流量起来后可接入 Google AdSense，或做「精选付费收录」

---

## 提交收录后端（Supabase，免费层）

「+ 提交收录」页（`submit.html`）用 Supabase 免费层存申请，配置只需一次：

1. 注册 [Supabase](https://supabase.com/)（GitHub 登录，免费层无需绑卡），新建项目（区域建议 Singapore）
2. 控制台 → **SQL Editor** → 粘贴本仓库 `supabase-setup.sql` 全部内容 → Run（建 `submissions` 表 + 只许匿名插入的 RLS 策略）
3. 控制台 → **Project Settings → API**，复制 `Project URL` 和 `anon public` key
4. 打开 `submit.html`，把顶部两个常量 `SUPABASE_URL` / `SUPABASE_ANON_KEY` 换成自己的值
5. `git push` 上线即生效

审核流程：Supabase → **Table Editor → submissions**，`status` 为 `pending` 的是新申请；确认后把该服务手动加进 `index.html` 的 `data` 数组上墙。`anon` key 的 RLS 策略只允许插入、不允许读取，公开在前端是安全的（密钥泄露也只能被人塞垃圾数据，读不到任何内容）。

---

## 点击统计后端（Pages Functions + KV，免费层）

访客点击「访问官网」时，前端会向 `/api/click`（`functions/api/click.js`）发一次统计请求，用 Workers KV 计数。Cloudflare Pages 会自动识别 `functions/` 目录，无需额外配置；**未绑定 KV 时网站完全不受影响**。启用步骤：

1. Cloudflare 控制台 → **Workers & Pages → KV → Create namespace**，命名如 `nav-clicks`
2. Pages 项目 → **Settings → Functions → KV namespace bindings**：变量名填 `CLICKS`，选择上面的命名空间，保存
3. 下次部署生效；查看数据：浏览器访问 `https://keting.eu.org/api/click` 即可拿到全部计数 JSON

免费层额度：KV 读 10 万次/天、写 1 千次/天，小流量站点绰绰有余；点击数据是后续谈「付费收录 / 广告按效果计费」的谈判筹码。

---

## 注意事项

- 免费额度以各官网实时政策为准，本导航仅作整理，不构成承诺
- 域名需每年续费，建议在注册商处开启「自动续费」，避免站点失联
