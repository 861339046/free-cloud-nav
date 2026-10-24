// Pages Function：收录申请中转（POST /api/submit）
// 为什么要有这一层：国内访客直连 *.supabase.co 不通（被墙），
// 但 Cloudflare 边缘节点到 Supabase 是通的 —— 由 Function 服务端转发即可。
// 附带好处：Supabase 密钥不再出现在前端代码里。
//
// 需要在 Pages 项目 → 设置 → 变量和密钥 里配置两个文本变量（生产环境）：
//   SUPABASE_URL       = https://xxxx.supabase.co
//   SUPABASE_ANON_KEY  = sb_publishable_xxx（或旧的 anon JWT）
// 数据库表和 RLS 策略见仓库根目录 supabase-setup.sql（只需跑一次）。
//
// 限流：POST 每 IP 每天 3 次（KV 近似计数，可用 RL_SUBMIT 覆盖），429 拒绝；
//       限流器 fail-open，KV 故障不会影响正常提交。

import { checkRateLimit } from './_ratelimit.js';

const MAX_FIELDS = {
  name: 40, category: 20, url: 200, description: 150, note: 150, email: 80
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

// 清洗环境变量：去掉首尾空白和误粘贴的引号
function cleanEnv(v) {
  return typeof v === 'string' ? v.trim().replace(/^["']+|["']+$/g, '') : '';
}

// 清洗用户输入：去掉尖括号（防存储型 XSS 进入库）、剔除控制字符、合并空白、按字段限长。
// 首页对输出做了转义，这里是纵深防御：即使前端被绕过，落库的也是干净文本。
function sanitize(v, max) {
  return String(v == null ? '' : v)
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function validInput(b) {
  const name = (b.name || '').trim();
  const category = (b.category || '').trim();
  const url = (b.url || '').trim();
  const description = (b.description || '').trim();
  const email = (b.email || '').trim();
  if (!name || name.length > MAX_FIELDS.name) return '服务名称必填且不超过 40 字';
  if (!category) return '请选择分类';
  if (!/^https?:\/\/.+\..+/.test(url) || url.length > MAX_FIELDS.url) return '官网链接需以 http(s):// 开头';
  if (description.length < 10 || description.length > MAX_FIELDS.description) return '简介需 10–150 字';
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return '邮箱格式不正确';
  return null;
}

async function handleSubmit(context) {
  const { request, env } = context;

  const SUPABASE_URL = cleanEnv(env.SUPABASE_URL).replace(/\/+$/, '');
  const SUPABASE_ANON_KEY = cleanEnv(env.SUPABASE_ANON_KEY);
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    // 注意：应用层错误一律返回 HTTP 200 + ok:false。
    // 502/5xx 状态码会被 Cloudflare 替换成自家错误页，把真实错误信息吞掉。
    return json({ ok: false, message: '服务端未配置 Supabase（Pages 变量和密钥里需有 SUPABASE_URL / SUPABASE_ANON_KEY，保存后需重新部署）', got: { url: !!SUPABASE_URL, key: !!SUPABASE_ANON_KEY } });
  }

  let b;
  try { b = await request.json(); } catch { return json({ ok: false, message: '请求格式错误' }, 400); }

  // 蜜罐：机器人填了直接假成功
  if (b.website) return json({ ok: true });

  // 限流：蜜罐之后、入库之前（机器人不消耗真实访客配额）
  const rl = await checkRateLimit(request, env, 'submit', 3);
  if (!rl.ok) return json({ ok: false, message: rl.message }, 429);

  // 统一清洗后再校验（保证校验看到的就是最终落库的内容）
  const s = {
    name: sanitize(b.name, MAX_FIELDS.name),
    category: sanitize(b.category, MAX_FIELDS.category),
    url: sanitize(b.url, MAX_FIELDS.url),
    description: sanitize(b.description, MAX_FIELDS.description),
    note: sanitize(b.note, MAX_FIELDS.note),
    email: sanitize(b.email, MAX_FIELDS.email)
  };

  const err = validInput(s);
  if (err) return json({ ok: false, message: err }, 400);

  const payload = [{
    name: s.name,
    category: s.category,
    url: s.url,
    description: s.description,
    note: s.note || null,
    email: s.email || null,
    status: 'pending'
  }];

  let res;
  try {
    res = await fetch(SUPABASE_URL + '/rest/v1/submissions', {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    return json({ ok: false, message: '转发到 Supabase 失败（网络异常）：' + (e && e.message) });
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    // 透传 Supabase 的错误码，便于诊断（如表不存在 42P01 / RLS 拒绝 42501 / 密钥无效 401）
    return json({ ok: false, upstreamStatus: res.status, message: 'Supabase 返回错误：' + text.slice(0, 300) });
  }

  return json({ ok: true });
}

// POST /api/submit —— 提交申请
export async function onRequestPost(context) {
  try {
    return await handleSubmit(context);
  } catch (e) {
    return json({ ok: false, message: '服务内部错误：' + (e && e.message ? e.message : String(e)) });
  }
}

// GET /api/submit —— 探针：返回 JSON 说明函数已部署（若返回网页说明部署还没带上本函数）
export async function onRequestGet() {
  return json({ ok: true, service: 'submit-api', method: 'POST' });
}
