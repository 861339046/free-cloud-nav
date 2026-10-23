// 推送 + 等待部署 + 全链路验证，一气呵成（网络抽风时推送自动重试）
const cp = require('child_process');
const fs = require('fs');

const repo = 'C:/Users/Administrator/WorkBuddy/2026-09-30-11-22-00/free-cloud-nav';
const out = repo + '/_chain.txt';
const TOKEN = 'Qfv0QtydQiSvxrfGoauh0hb0ysqs3FCL';
const SHA = 'b7f0012';
fs.writeFileSync(out, '');

function log(s) { fs.appendFileSync(out, s + '\n'); }
function curl(args) {
  const r = cp.spawnSync('curl', args, { encoding: 'utf8' });
  return String(r.stdout || '(no output)');
}
function sleep(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }

// 1. 推送（最多 10 次，每次间隔 20s）
let pushed = false;
for (let i = 1; i <= 10; i++) {
  const r = cp.spawnSync('git', ['-C', repo, 'push', 'origin', 'main'], { encoding: 'utf8', timeout: 120000 });
  log('push attempt ' + i + ' status=' + r.status + ' ' + String((r.stdout || '') + (r.stderr || '')).split('\n')[0]);
  if (r.status === 0) { pushed = true; break; }
  sleep(20000);
}
if (!pushed) { log('PUSH_FAILED'); process.exit(0); }
log('PUSH_OK');

// 2. 等 Cloudflare 构建（轮询 check-runs + 站点静态文件，最多 8 分钟）
let deployed = false;
for (let i = 1; i <= 12; i++) {
  sleep(40000);
  const cr = curl(['-s', '-m', '25', 'https://api.github.com/repos/861339046/free-cloud-nav/commits/' + SHA + '/check-runs']);
  let crInfo = 'parse_fail';
  try {
    const j = JSON.parse(cr);
    crInfo = 'check_runs=' + j.total_count;
    for (const c of (j.check_runs || [])) crInfo += ' [' + c.name + ' ' + c.status + ' ' + (c.conclusion || '') + ']';
  } catch (e) {}
  const staticCode = curl(['-s', '-m', '25', '-o', '/dev/null', '-w', '%{http_code}', 'https://keting.eu.org/status-probe.js']).trim();
  log(new Date().toISOString() + ' watch ' + i + ' static=HTTP_' + staticCode + ' ' + crInfo);
  if (staticCode === '200') { deployed = true; break; }
}

// 3. 全链路验证
log('--- FULL CHAIN VERIFY (deployed=' + deployed + ') ---');
log('static status-probe.js: HTTP_' + curl(['-s', '-m', '25', '-o', '/dev/null', '-w', '%{http_code}', 'https://keting.eu.org/status-probe.js']).trim());
const noTok = curl(['-s', '-m', '25', '-o', '/dev/null', '-w', '%{http_code}', 'https://keting.eu.org/api/cron-probe']).trim();
log('cron-probe no token: HTTP_' + noTok);
const withTok = curl(['-s', '-m', '90', '-w', '|HTTP_%{http_code}', '-H', 'x-cron-token: ' + TOKEN, 'https://keting.eu.org/api/cron-probe']);
log('cron-probe with token: ' + withTok.slice(0, 300));
const st = curl(['-s', '-m', '25', 'https://keting.eu.org/api/status']);
log('api/status: ' + st.slice(0, 500));
const runs = curl(['-s', '-m', '25', 'https://api.github.com/repos/861339046/free-cloud-nav/actions/runs?per_page=5']);
try {
  const j = JSON.parse(runs);
  log('actions runs total=' + j.total_count);
  for (const r of (j.workflow_runs || [])) log('  - ' + r.name + ' ' + r.status + ' ' + (r.conclusion || '') + ' ' + r.created_at);
} catch (e) { log('actions runs: parse_fail'); }
log('CHAIN_DONE');
