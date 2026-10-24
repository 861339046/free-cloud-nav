// keting.eu.org 全站页面浏览统计（PV）
// 复用 /api/click 的 KV 后端，键名 pv-<页面>-<YYYY-MM-DD>，与改造前完全一致。
//
// 去重策略：同一浏览器、同一页面、同一天只计一次（localStorage 标记），
// 避免每次刷新/回访都消耗 KV 写额度——服务端另有全局日预算兜底（见 functions/api/click.js），
// 双重保护 KV 免费层 1000 次写/天。统计失败静默忽略，不影响页面。
//
// 页面标识取路径名（/ → index，/tool-sha → tool-sha）；
// 如需自定义（如别名页），在 <body data-pv="xxx"> 上声明即可。
(function () {
  try {
    var page = (document.body && document.body.getAttribute('data-pv')) || '';
    if (!page) {
      var p = location.pathname.replace(/\/+$/, '') || '/index';
      page = p.replace(/^\//, '').replace(/\.html$/, '') || 'index';
    }
    var day = new Date().toISOString().slice(0, 10);
    var flag = 'pv:' + page + ':' + day;
    if (localStorage.getItem(flag)) return;
    localStorage.setItem(flag, '1');
    var body = JSON.stringify({ id: 'pv-' + page + '-' + day });
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/click', new Blob([body], { type: 'application/json' }));
    } else {
      fetch('/api/click', { method: 'POST', body: body, keepalive: true, headers: { 'Content-Type': 'application/json' } }).catch(function () {});
    }
  } catch (e) { /* 统计失败不影响页面 */ }
})();
