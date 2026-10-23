// 推送重试 -> 等部署（线上文件含 ocistatus）-> 全链路复验
const cp = require('child_process');
const fs = require('fs');

const repo = 'C:/Users/Administrator/WorkBuddy/2026-09-30-11-22-00/free-cloud-nav';
const out = repo + '/_chain3.txt';
const TOKEN = 'Qfv0QtydQiSvxrfGoauh0hb0ysqs3FCL';
fs.writeFileSync(out, '');

function log(s) { fs.appendFileSync(out, s + '\n'); }
function curl(args) {
  const r = cp.spawnSync('curl', args, { encoding: 'utf8' });
  return String(r.stdout || '(no output)');
}
function sleep(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }

// 1. 推送重试（最多 15 次，每次间隔 25s）
let pushed = false;
for (let i = 1; i <= 15; i++) {
  const r = cp.spawnSync('git', ['-C', repo, 'push', 'origin', 'main'], { encoding: 'utf8', timeout: 120000 });
  log('push attempt ' + i + ' status=' + r.status + ' ' + String((r.stdout || '') + (r.stderr || '')).split('\n')[0]);
  if (r.status === 0) { pushed = true; break; }
  sleep(25000);
}
if (!pushed) { log('PUSH_FAILED'); process.exit(0); }
log('PUSH_OK');

// 2. 等部署：线上 /status-probe.js 出现 ocistatus 即新版已上线
let deployed = false;
for (let i = 1; i <= 12; i++) {
  sleep(40000);
  const body = curl(['-s', '-m', '25', 'https://keting.eu.org/status-probe.js']);
  const live = body.indexOf('ocistatus.oraclecloud.com') !== -1;
  log(new Date().toISOString() + ' watch ' + i + ' live_new_version=' + live);
  if (live) { deployed = true; break; }
}

// 3. 全链路复验
log('--- FULL CHAIN VERIFY (deployed=' + deployed + ') ---');
log('static has ocistatus: ' + (curl(['-s', '-m', '25', 'https://keting.eu.org/status-probe.js']).indexOf('ocistatus.oraclecloud.com') !== -1));
log('cron-probe no token: HTTP_' + curl(['-s', '-m', '25', '-o', '/dev/null', '-w', '%{http_code}', 'https://keting.eu.org/api/cron-probe']).trim());
const withTok = curl(['-s', '-m', '90', '-w', '|HTTP_%{http_code}', '-H', 'x-cron-token: ' + TOKEN, 'https://keting.eu.org/api/cron-probe']);
log('cron-probe with token: ' + withTok.slice(0, 300));
const st = curl(['-s', '-m', '25', 'https://keting.eu.org/api/status']);
log('api/status: ' + st.slice(0, 1200));
const runs = curl(['-s', '-m', '25', 'https://api.github.com/repos/861339046/free-cloud-nav/actions/runs?per_page=5']);
try {
  const j = JSON.parse(runs);
  log('actions runs total=' + j.total_count);
  for (const r of (j.workflow_runs || [])) log('  - ' + r.name + ' ' + r.status + ' ' + (r.conclusion || '') + ' ' + r.created_at);
} catch (e) { log('actions runs: parse_fail'); }
log('CHAIN3_DONE');
