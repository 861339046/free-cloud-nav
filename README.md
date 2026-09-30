# 免费云服务导航 · 部署与上线指南

> 方案：**Cloudflare Pages（免费托管）+ 自有域名（约 ¥60/年）**
> 为什么选它：国内访问快、百度收录好、能建独立品牌——这三点正是「中文流量变现」的命门。
> 代码是纯静态站点，零服务器成本，无需后端。

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

## 步骤三：买一个域名（约 ¥60/年）

- **推荐**：直接在 Cloudflare Registrar 购买（价格透明、自动接管 DNS）
- **或**：在阿里云 / 腾讯云买 `.cn` 或 `.com`，再把域名的 DNS 改成 Cloudflare 提供的 NS 服务器
- 命名建议：好记、含「free / 云 / 导航」含义的短域名

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

## 注意事项

- 免费额度以各官网实时政策为准，本导航仅作整理，不构成承诺
- 域名需每年续费，建议在注册商处开启「自动续费」，避免站点失联
