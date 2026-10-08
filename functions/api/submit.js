// Pages Function：收录申请中转（POST /api/submit）
// 为什么要有这一层：国内访客直连 *.supabase.co 不通（被墙），
// 但 Cloudflare 边缘节点到 Supabase 是通的 —— 由 Function 服务端转发即可。
// 附带好处：Supabase 密钥不再出现在前端代码里。
//
// 需要在 Pages 项目 → 设置 → 变量和密钥 里配置两个文本变量：
//   SUPABASE_URL       = https://xxxx.supabase.co
//   SUPABASE_ANON_KEY  = sb_publishable_xxx（或旧的 anon JWT）
// 数据库表和 RLS 策略见仓库根目录 supabase-setup.sql（只需跑一次）。

const MAX_FIELDS = {
  name: 40, category: 20, url: 200, description: 150, note: 150, email: 80
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

function validInput(b) {
  if (!b || typeof b !== 'object') return '请求格式错误';
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

export async function onRequestPost(context) {
  const { request, env } = context;

  const SUPABASE_URL = (env.SUPABASE_URL || '').replace(/\/+$/, '');
  const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return json({ ok: false, message: '服务端未配置 Supabase（请在 Pages 变量和密钥里添加 SUPABASE_URL / SUPABASE_ANON_KEY）' }, 500);
  }

  let b;
  try { b = await request.json(); } catch { return json({ ok: false, message: '请求格式错误' }, 400); }

  // 蜜罐：机器人填了直接假成功
  if (b.website) return json({ ok: true });

  const err = validInput(b);
  if (err) return json({ ok: false, message: err }, 400);

  const payload = [{
    name: b.name.trim(),
    category: b.category.trim(),
    url: b.url.trim(),
    description: b.description.trim(),
    note: (b.note || '').trim() || null,
    email: (b.email || '').trim() || null,
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
    return json({ ok: false, message: '转发到 Supabase 失败（网络异常），请稍后重试' }, 502);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    // 透传 Supabase 的错误码，便于诊断（如表不存在 42P01 / RLS 拒绝 42501 / 密钥无效 401）
    return json({ ok: false, status: res.status, message: 'Supabase 返回错误：' + text.slice(0, 300) }, 502);
  }

  return json({ ok: true });
}
