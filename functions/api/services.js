// Pages Function：已通过收录的公开只读接口（GET /api/services）
// 首页加载时调用本接口，把「审核通过」的社区收录动态渲染上墙——
// 站长在 /admin 点「通过」后，访客刷新首页即可看到，无需改代码重新部署。
//
// 环境：复用 Pages 变量和密钥里的 SUPABASE_URL / SUPABASE_SERVICE_KEY。
// 安全：只返回公开字段（name/category/url/description/note），绝不返回 email；
//       读走 service 密钥（服务端），前端拿不到任何密钥。

function json(data, status = 200) {
  const headers = { 'content-type': 'application/json; charset=utf-8' };
  if (status === 200) headers['cache-control'] = 'public, max-age=60'; // 边缘/浏览器缓存 1 分钟，省额度
  return new Response(JSON.stringify(data), { status, headers });
}

function cleanEnv(v) {
  return typeof v === 'string' ? v.trim().replace(/^["']+|["']+$/g, '') : '';
}

export async function onRequestGet(context) {
  try {
    const { env } = context;
    const SUPABASE_URL = cleanEnv(env.SUPABASE_URL).replace(/\/+$/, '');
    const SERVICE_KEY = cleanEnv(env.SUPABASE_SERVICE_KEY);
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return json({ ok: false, services: [], message: '未配置' });
    }

    const qs = new URLSearchParams({
      select: 'id,name,category,url,description,note',
      status: 'eq.approved',
      order: 'created_at.desc',
      limit: '100'
    });
    const res = await fetch(SUPABASE_URL + '/rest/v1/submissions?' + qs.toString(), {
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': 'Bearer ' + SERVICE_KEY
      }
    });
    const text = await res.text().catch(() => '');
    if (!res.ok) return json({ ok: false, services: [], upstreamStatus: res.status });

    const rows = JSON.parse(text || '[]');
    const services = rows.map(r => ({
      name: r.name,
      cat: r.category,
      url: r.url,
      desc: r.description,
      note: r.note || '免费额度以官网为准。'
    }));
    return json({ ok: true, services });
  } catch (e) {
    return json({ ok: false, services: [], message: '服务内部错误' });
  }
}
