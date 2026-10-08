// Pages Function：收录申请后台审核（/api/admin）
// 仅供站长使用，需要两个服务端环境变量（Pages → 设置 → 变量和密钥，配完需重新部署）：
//   SUPABASE_SERVICE_KEY = service_role 密钥（绕过 RLS，绝不能写进前端代码！）
//   ADMIN_SECRET         = 自定的后台密码（任意长随机字符串）
// 前端 admin.html 每次请求在 x-admin-token 头里带上 ADMIN_SECRET。
//
// 安全设计：
//   1. service_role 只存在于服务端环境变量，访客永远拿不到；
//   2. 校验失败一律返回统一 401 文案，不区分「密码错」和「未配置」，避免探测；
//   3. 应用层错误一律 HTTP 200 + ok:false（5xx 会被 Cloudflare 替换成错误页吞掉真实原因）。

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

function cleanEnv(v) {
  return typeof v === 'string' ? v.trim().replace(/^["']+|["']+$/g, '') : '';
}

// 恒时比较防时序侧信道（长度不同直接 false，内容用异或累积）
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function checkAuth(request, env) {
  const secret = cleanEnv(env.ADMIN_SECRET);
  const token = (request.headers.get('x-admin-token') || '').trim();
  return secret.length > 0 && safeEqual(token, secret);
}

function supabaseHeaders(env) {
  const key = cleanEnv(env.SUPABASE_SERVICE_KEY);
  return {
    'apikey': key,
    'Authorization': 'Bearer ' + key,
    'Content-Type': 'application/json'
  };
}

function requireConfig(env) {
  const SUPABASE_URL = cleanEnv(env.SUPABASE_URL).replace(/\/+$/, '');
  const hasKey = cleanEnv(env.SUPABASE_SERVICE_KEY).length > 0;
  if (!SUPABASE_URL || !hasKey) {
    return { error: json({
      ok: false,
      message: '服务端未配置：需在 Pages「变量和密钥」里添加 SUPABASE_SERVICE_KEY（service_role 密钥）与 ADMIN_SECRET（后台密码），保存后重新部署。',
      got: { url: !!SUPABASE_URL, serviceKey: hasKey }
    }) };
  }
  return { SUPABASE_URL };
}

// GET /api/admin?status=pending —— 列出申请（不传 status 列出全部，最多 200 条）
export async function onRequestGet(context) {
  try {
    const { request, env } = context;
    const cfg = requireConfig(env);
    if (cfg.error) return cfg.error;
    if (!checkAuth(request, env)) return json({ ok: false, message: '未授权：请先在页面输入后台密码' }, 401);

    const url = new URL(request.url);
    const status = (url.searchParams.get('status') || '').trim();
    const qs = new URLSearchParams({ select: '*', order: 'created_at.desc', limit: '200' });
    if (status === 'pending' || status === 'approved' || status === 'rejected') qs.set('status', 'eq.' + status);

    const res = await fetch(cfg.SUPABASE_URL + '/rest/v1/submissions?' + qs.toString(), {
      headers: supabaseHeaders(env)
    });
    const text = await res.text().catch(() => '');
    if (!res.ok) return json({ ok: false, upstreamStatus: res.status, message: 'Supabase 返回错误：' + text.slice(0, 300) });

    return json({ ok: true, rows: JSON.parse(text || '[]') });
  } catch (e) {
    return json({ ok: false, message: '服务内部错误：' + (e && e.message ? e.message : String(e)) });
  }
}

// POST /api/admin —— {action:"setStatus", id:1, status:"approved"} 或 {action:"delete", id:1}
export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const cfg = requireConfig(env);
    if (cfg.error) return cfg.error;
    if (!checkAuth(request, env)) return json({ ok: false, message: '未授权：请先在页面输入后台密码' }, 401);

    let b;
    try { b = await request.json(); } catch { return json({ ok: false, message: '请求格式错误' }, 400); }

    const id = Number(b.id);
    if (!Number.isInteger(id) || id <= 0) return json({ ok: false, message: 'id 不合法' }, 400);

    let method, qs, body;
    if (b.action === 'setStatus') {
      const status = String(b.status || '');
      if (status !== 'approved' && status !== 'rejected' && status !== 'pending') {
        return json({ ok: false, message: 'status 只能是 approved / rejected / pending' }, 400);
      }
      method = 'PATCH';
      qs = 'id=eq.' + id;
      body = JSON.stringify({ status });
    } else if (b.action === 'delete') {
      method = 'DELETE';
      qs = 'id=eq.' + id;
      body = undefined;
    } else {
      return json({ ok: false, message: '未知 action' }, 400);
    }

    const res = await fetch(cfg.SUPABASE_URL + '/rest/v1/submissions?' + qs, {
      method,
      headers: { ...supabaseHeaders(env), 'Prefer': 'return=minimal' },
      body
    });
    const text = await res.text().catch(() => '');
    if (!res.ok) return json({ ok: false, upstreamStatus: res.status, message: 'Supabase 返回错误：' + text.slice(0, 300) });

    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, message: '服务内部错误：' + (e && e.message ? e.message : String(e)) });
  }
}
