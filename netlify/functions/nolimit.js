// ============================================================
// NooLimit — single-file Telegram Mini App + Bot
// Bot: @NoolimitsBot
// ============================================================

const crypto = require('crypto');

// ---------- Branding ----------
const APP_NAME = 'NooLimit';
const LOGO_URL = 'https://iili.io/nuLWzp2.jpg';
const BOT_USERNAME = 'NoolimitsBot';

// ---------- In-memory store (fine for testing) ----------
const USERS = new Map();
function getUser(id) { return USERS.get(String(id)) || null; }
function saveUser(id, u) { USERS.set(String(id), u); return u; }

function createUser(p) {
  const existing = getUser(p.id);
  if (existing) return existing;
  const user = {
    id: p.id, username: p.username || '', first_name: p.first_name || '',
    balance: 0, level: 1, xp: 0,
    referrals: 0, referredBy: null,
    tasksDone: [], lastDaily: 0, streak: 0,
    lastAdRewardAt: 0, adRewardsToday: 0,
    createdAt: Date.now(),
  };
  return saveUser(p.id, user);
}

const TASKS = [
  { id: 'follow_x',     reward: 30, title: 'Follow us on X' },
  { id: 'join_channel', reward: 40, title: 'Join our channel' },
  { id: 'daily_check',  reward: 10, title: 'Daily check-in' },
  { id: 'read_about',   reward: 15, title: 'Read About page' },
];

// ---------- Telegram helpers ----------
function tgUrl(m) { return `https://api.telegram.org/bot${process.env.BOT_TOKEN}/${m}`; }
async function tg(method, payload) {
  try {
    const r = await fetch(tgUrl(method), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return r.json();
  } catch (e) { console.error(e); return { ok: false }; }
}

function verifyInitData(initData, botToken) {
  try {
    const p = new URLSearchParams(initData);
    const hash = p.get('hash');
    if (!hash) return null;
    p.delete('hash');
    const dcs = [...p.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
    const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const computed = crypto.createHmac('sha256', secret).update(dcs).digest('hex');
    if (computed !== hash) return null;
    const authDate = Number(p.get('auth_date') || 0);
    if (Math.floor(Date.now() / 1000) - authDate > 86400) return null;
    return JSON.parse(p.get('user') || 'null');
  } catch { return null; }
}

function publicUser(u) {
  return {
    id: u.id, username: u.username, first_name: u.first_name,
    balance: u.balance, level: u.level, xp: u.xp,
    referrals: u.referrals, streak: u.streak,
  };
}

// ============================================================
// BOT HANDLER
// ============================================================
async function handleBot(update) {
  const msg = update.message || update.callback_query?.message;
  const from = update.message?.from || update.callback_query?.from;
  if (!msg || !from) return;

  const chatId = msg.chat.id;
  const text = (update.message?.text || '').trim();
  const cmd = text.split(' ')[0].toLowerCase();
  const WEBAPP_URL = process.env.WEBAPP_URL || `https://${BOT_USERNAME.toLowerCase()}.netlify.app`;
  const user = createUser(from);

  const launchBtn = {
    inline_keyboard: [[{ text: `🚀 Launch ${APP_NAME}`, web_app: { url: WEBAPP_URL } }]],
  };

  if (cmd === '/start') {
    const ref = text.match(/ref_(\d+)/);
    if (ref && !user.referredBy && Number(ref[1]) !== from.id) {
      const r = getUser(Number(ref[1]));
      if (r) {
        r.balance += 50; r.referrals += 1; saveUser(r.id, r);
        user.referredBy = r.id; user.balance += 25; saveUser(user.id, user);
        tg('sendMessage', { chat_id: r.id, text: '🎉 New referral! +50 NL' });
      }
    }
    return tg('sendMessage', {
      chat_id: chatId,
      text:
        `👋 Welcome to *${APP_NAME}*, ${from.first_name}!\n\n` +
        `Complete tasks, earn NL, level up.\n` +
        `_Points have no cash value — entertainment only._`,
      parse_mode: 'Markdown',
      reply_markup: launchBtn,
    });
  }

  if (cmd === '/balance') {
    return tg('sendMessage', {
      chat_id: chatId,
      text: `💰 Balance: *${user.balance} NL*\n🏆 Level: ${user.level}\n⚡ XP: ${user.xp}`,
      parse_mode: 'Markdown',
    });
  }

  if (cmd === '/daily') {
    const now = Date.now(), DAY = 86400000;
    if (now - user.lastDaily < DAY) {
      const h = Math.ceil((DAY - (now - user.lastDaily)) / 3600000);
      return tg('sendMessage', { chat_id: chatId, text: `⏳ Come back in ~${h}h.` });
    }
    user.streak = now - user.lastDaily < DAY * 2 ? user.streak + 1 : 1;
    user.lastDaily = now;
    const reward = 10 + user.streak * 5;
    user.balance += reward;
    saveUser(user.id, user);
    return tg('sendMessage', {
      chat_id: chatId,
      text: `✅ Daily claimed! +${reward} NL\n🔥 Streak: ${user.streak}`,
    });
  }

  if (cmd === '/invite') {
    const link = `https://t.me/${BOT_USERNAME}?start=ref_${from.id}`;
    return tg('sendMessage', {
      chat_id: chatId,
      text: `🎁 *Your invite link:*\n\`${link}\`\n\n+50 NL per friend (optional)`,
      parse_mode: 'Markdown',
    });
  }

  if (cmd === '/help') {
    return tg('sendMessage', {
      chat_id: chatId,
      text:
        `*${APP_NAME} Commands*\n\n` +
        `/start – Register\n/balance – Balance\n/daily – Daily reward\n` +
        `/invite – Referral link\n/tasks – Open app\n/help – Menu\n\n` +
        `NL is an in-app token with no monetary value.`,
      parse_mode: 'Markdown',
      reply_markup: launchBtn,
    });
  }

  if (cmd === '/tasks') {
    return tg('sendMessage', {
      chat_id: chatId,
      text: '🎯 Open the Mini App:',
      reply_markup: launchBtn,
    });
  }

  if (cmd === '/admin' && String(from.id) === process.env.ADMIN_ID) {
    return tg('sendMessage', {
      chat_id: chatId,
      text: `*Admin*\n/broadcast <msg>\n/stats`,
      parse_mode: 'Markdown',
    });
  }

  if (cmd === '/stats' && String(from.id) === process.env.ADMIN_ID) {
    return tg('sendMessage', { chat_id: chatId, text: `📊 Users: ${USERS.size}` });
  }

  if (cmd === '/broadcast' && String(from.id) === process.env.ADMIN_ID) {
    const m = text.replace('/broadcast', '').trim();
    if (!m) return tg('sendMessage', { chat_id: chatId, text: 'Usage: /broadcast <msg>' });
    let sent = 0;
    for (const u of USERS.values()) {
      try { await tg('sendMessage', { chat_id: u.id, text: m }); sent++; } catch {}
      await new Promise(r => setTimeout(r, 40));
    }
    return tg('sendMessage', { chat_id: chatId, text: `📢 Sent to ${sent}/${USERS.size}` });
  }
}

// ============================================================
// TASKS API
// ============================================================
async function handleTasks(body) {
  const u = verifyInitData(body.initData, process.env.BOT_TOKEN);
  if (!u) return { status: 403, data: { error: 'Invalid auth' } };

  const user = createUser(u);
  const action = body.action;

  if (action === 'list') {
    return { status: 200, data: {
      tasks: TASKS.map(t => ({ ...t, done: user.tasksDone.includes(t.id) })),
      user: publicUser(user),
    }};
  }

  if (action === 'complete') {
    const t = TASKS.find(x => x.id === body.taskId);
    if (!t) return { status: 404, data: { error: 'Unknown task' } };
    if (user.tasksDone.includes(t.id)) return { status: 400, data: { error: 'Already done' } };
    user.tasksDone.push(t.id);
    user.balance += t.reward;
    user.xp += t.reward;
    user.level = Math.floor(user.xp / 500) + 1;
    saveUser(user.id, user);
    return { status: 200, data: { ok: true, user: publicUser(user), reward: t.reward } };
  }

  if (action === 'reward_ad') {
    const now = Date.now();
    if (user.lastAdRewardAt && now - user.lastAdRewardAt < 90_000)
      return { status: 429, data: { error: 'Too soon — wait a moment.' } };
    user.adRewardsToday = (user.adRewardsToday || 0) + 1;
    if (user.adRewardsToday > 20)
      return { status: 429, data: { error: 'Daily ad reward limit reached.' } };
    const R = 25;
    user.balance += R; user.xp += R;
    user.level = Math.floor(user.xp / 500) + 1;
    user.lastAdRewardAt = now;
    saveUser(user.id, user);
    return { status: 200, data: { ok: true, user: publicUser(user), reward: R } };
  }

  if (action === 'profile') {
    return { status: 200, data: { user: publicUser(user) } };
  }

  return { status: 400, data: { error: 'Unknown action' } };
}

// ============================================================
// HTML
// ============================================================
const HTML = (cfg) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no" />
<meta name="description" content="${APP_NAME} – entertainment Mini App. Points have no cash value." />
<title>${APP_NAME}</title>
<link rel="icon" type="image/jpeg" href="${LOGO_URL}" />
<link rel="apple-touch-icon" href="${LOGO_URL}" />
<meta property="og:title" content="${APP_NAME}" />
<meta property="og:image" content="${LOGO_URL}" />
<meta name="twitter:card" content="summary_large_image" />
<script src="https://telegram.org/js/telegram-web-app.js"><\/script>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0f0f17;color:#fff;min-height:100vh;padding:16px}
.screen{max-width:480px;margin:0 auto}
.hidden{display:none!important}
.brand{display:flex;align-items:center;gap:10px;margin-bottom:14px}
.brand img{width:42px;height:42px;border-radius:12px;object-fit:cover;box-shadow:0 0 0 2px rgba(79,157,255,.35)}
.brand h1{font-size:22px;font-weight:800}
.muted{opacity:.6;font-size:12px}
.spinner{width:40px;height:40px;margin:40px auto 16px;border:4px solid rgba(255,255,255,.15);border-top-color:#4f9dff;border-radius:50%;animation:spin .9s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.stats{display:flex;gap:12px;margin-bottom:12px}
.stat{flex:1;background:#1a1a26;padding:12px;border-radius:12px;text-align:center}
.stat span{display:block;font-size:20px;font-weight:700}
.stat small{opacity:.6;font-size:11px}
.policy-note{font-size:11px;opacity:.55;margin-bottom:14px;text-align:center}
.tabs{display:flex;gap:8px;margin-bottom:16px}
.tab{flex:1;padding:10px;border:none;border-radius:10px;background:#1a1a26;color:#fff;font-size:13px;cursor:pointer}
.tab.active{background:#4f9dff}
.card{background:#1a1a26;padding:16px;border-radius:12px;margin-bottom:12px}
#taskList{list-style:none;display:flex;flex-direction:column;gap:8px}
#taskList li{display:flex;justify-content:space-between;align-items:center;background:#1a1a26;padding:14px;border-radius:12px}
#taskList small{display:block;opacity:.6;font-size:11px;margin-top:4px}
#taskList button{padding:8px 14px;border:none;border-radius:8px;background:#4f9dff;color:#fff;font-weight:600;cursor:pointer}
#taskList button:disabled{background:#2a2a3a;opacity:.6}
.btn{display:inline-block;padding:12px 20px;background:#4f9dff;color:#fff;border:none;border-radius:10px;font-weight:600;cursor:pointer;text-decoration:none;margin:8px 0}
.blocked-logo{width:80px;height:80px;border-radius:20px;object-fit:cover;margin:0 auto 16px;display:block}
</style>
</head>
<body>
<div id="loader" class="screen">
  <img src="${LOGO_URL}" class="blocked-logo" />
  <div class="spinner"></div>
  <p style="text-align:center">Loading…</p>
</div>

<div id="blocked" class="screen hidden">
  <img src="${LOGO_URL}" class="blocked-logo" />
  <h1 style="text-align:center">🚫 Access Denied</h1>
  <p style="text-align:center">${APP_NAME} only works inside Telegram.</p>
  <div style="text-align:center">
    <a href="https://t.me/${BOT_USERNAME}" class="btn">Open @${BOT_USERNAME}</a>
  </div>
</div>

<div id="app" class="screen hidden">
  <div class="brand">
    <img src="${LOGO_URL}" />
    <h1>${APP_NAME}</h1>
  </div>
  <div class="stats">
    <div class="stat"><span id="balance">0</span><small>NL</small></div>
    <div class="stat"><span id="level">1</span><small>Level</small></div>
    <div class="stat"><span id="streak">0</span><small>Streak</small></div>
  </div>
  <p class="policy-note">Points are for in-app progression only. No cash value.</p>

  <nav class="tabs">
    <button class="tab active" data-tab="tasks">🎯 Tasks</button>
    <button class="tab" data-tab="bonus">🎬 Bonus</button>
    <button class="tab" data-tab="invite">🎁 Invite</button>
    <button class="tab" data-tab="profile">👤 Profile</button>
  </nav>

  <section id="tab-tasks" class="tab-panel"><ul id="taskList"></ul></section>

  <section id="tab-bonus" class="tab-panel hidden">
    <div class="card">
      <h2>Watch & Earn</h2>
      <p class="muted">Watch a short ad to earn bonus NL. Optional — never required.</p>
      <button id="watchAdBtn" class="btn">🎬 Watch ad (+25 NL)</button>
      <p id="adStatus" class="muted"></p>
    </div>
  </section>

  <section id="tab-invite" class="tab-panel hidden">
    <div class="card">
      <h2>Invite friends</h2>
      <p>Inviting is optional. +50 NL you, +25 NL them.</p>
      <button id="copyInvite" class="btn">📋 Copy invite link</button>
      <p id="inviteLink" class="muted"></p>
    </div>
  </section>

  <section id="tab-profile" class="tab-panel hidden">
    <div class="card">
      <p id="profileInfo"></p>
      <p style="margin-top:12px"><a href="/api/about" style="color:#4f9dff">About & Privacy</a></p>
    </div>
  </section>
</div>

<script>
const tg = window.Telegram?.WebApp;
const initData = tg?.initData;
const $ = (id) => document.getElementById(id);
const show = (el) => { document.querySelectorAll('.screen').forEach(s=>s.classList.add('hidden')); el.classList.remove('hidden'); };

async function api(action, extra={}) {
  const r = await fetch('/api/tasks', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ initData, action, ...extra })});
  return r.json();
}
function renderUser(u){
  $('balance').textContent = u.balance;
  $('level').textContent = u.level;
  $('streak').textContent = u.streak || 0;
  $('profileInfo').innerHTML = '<b>'+u.first_name+'</b>'+(u.username?' (@'+u.username+')':'')+
    '<br>Balance: '+u.balance+' NL<br>Level: '+u.level+'<br>Referrals: '+u.referrals+
    '<br><br><small class="muted">NL is an in-app token only. No monetary value.</small>';
}
async function loadTasks(){
  const d = await api('list');
  const list = $('taskList'); list.innerHTML='';
  d.tasks.forEach(t=>{
    const li = document.createElement('li');
    li.innerHTML = '<div><strong>'+t.title+'</strong><small>+'+t.reward+' NL</small></div>'+
      '<button '+(t.done?'disabled':'')+' data-id="'+t.id+'">'+(t.done?'✅ Done':'Claim')+'</button>';
    li.querySelector('button').onclick = ()=>completeTask(t.id);
    list.appendChild(li);
  });
  renderUser(d.user);
}
async function completeTask(id){
  const r = await api('complete',{taskId:id});
  if(r.ok){ tg?.HapticFeedback?.notificationOccurred('success'); renderUser(r.user); loadTasks(); }
  else tg?.showAlert?.(r.error||'Failed');
}
async function init(){
  if(!initData) return show($('blocked'));
  tg.ready(); tg.expand();
  try { tg.setHeaderColor?.('#0f0f17'); tg.setBackgroundColor?.('#0f0f17'); } catch {}

  try{
    const r = await api('profile');
    if(r.error) return show($('blocked'));
    renderUser(r.user);
    await loadTasks();
    show($('app'));
  }catch{ show($('blocked')); }

  document.querySelectorAll('.tab').forEach(btn=>{
    btn.onclick = ()=>{
      document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p=>p.classList.add('hidden'));
      btn.classList.add('active');
      $('tab-'+btn.dataset.tab).classList.remove('hidden');
    };
  });

  $('copyInvite').onclick = async ()=>{
    const r = await api('profile');
    const link = 'https://t.me/${BOT_USERNAME}?start=ref_'+r.user.id;
    $('inviteLink').textContent = link;
    try{ navigator.clipboard.writeText(link); }catch{}
    tg?.showAlert?.('Link copied!');
  };

  $('watchAdBtn').onclick = async ()=>{
    const btn = $('watchAdBtn'); btn.disabled = true;
    $('adStatus').textContent = 'Crediting…';
    const credit = await api('reward_ad');
    if(credit.ok){ renderUser(credit.user); $('adStatus').textContent = '✅ +25 NL added!'; }
    else $('adStatus').textContent = credit.error || 'Could not credit.';
    btn.disabled = false;
  };
}
window.addEventListener('load', init);
<\/script>
</body>
</html>`;

const ABOUT = (cfg) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>About · ${APP_NAME}</title>
<link rel="icon" type="image/jpeg" href="${LOGO_URL}" />
<style>
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0f0f17;color:#fff;padding:24px;line-height:1.6;max-width:640px;margin:0 auto}
.brand{display:flex;align-items:center;gap:12px;margin-bottom:16px}
.brand img{width:56px;height:56px;border-radius:14px;object-fit:cover}
h1{font-size:24px;margin:0}
h2{font-size:16px;margin:20px 0 6px;color:#4f9dff}
a{color:#4f9dff}
</style>
</head>
<body>
<div class="brand"><img src="${LOGO_URL}" /><h1>About ${APP_NAME}</h1></div>
<p>${APP_NAME} is a Telegram Mini App for entertainment. Users complete simple in-app tasks to earn "NL", a virtual progression token used only inside the app.</p>
<h2>Points Policy</h2>
<p>NL has <b>no monetary value</b>. It cannot be withdrawn, sold, traded, or exchanged for cash, crypto, or goods.</p>
<h2>Advertising</h2>
<p>${APP_NAME} displays optional rewarded ads. Watching ads is always a choice and never required to use the app.</p>
<h2>Data</h2>
<p>We store your Telegram user ID, username, and in-app progress. We do not store messages, contacts, or payment information.</p>
<h2>Content</h2>
<p>${APP_NAME} contains no adult content, gambling, real-money rewards, or financial services.</p>
<h2>Contact</h2>
<p>Bot: <a href="https://t.me/${BOT_USERNAME}">@${BOT_USERNAME}</a></p>
<p><a href="/">← Back to app</a></p>
</body>
</html>`;

// ============================================================
// NETLIFY HANDLER
// ============================================================
exports.handler = async (event) => {
  const path = event.path.replace(/\/+$/, '') || '/';
  const method = event.httpMethod;

  if (path === '/api/bot' && method === 'POST') {
    try { await handleBot(JSON.parse(event.body || '{}')); } catch (e) { console.error(e); }
    return { statusCode: 200, body: 'ok' };
  }

  if (path === '/api/tasks' && method === 'POST') {
    try {
      const body = JSON.parse(event.body || '{}');
      const { status, data } = await handleTasks(body);
      return json(status, data);
    } catch { return json(400, { error: 'Bad request' }); }
  }

  if (path === '/api/ads') {
    return json(200, {
      enabled: process.env.ADS_ENABLED === 'true',
      provider: process.env.ADS_PROVIDER || 'adsgram',
      adsgramBlockId: process.env.ADSGRAM_BLOCK_ID || '',
    });
  }

  if (path === '/api/about') {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: ABOUT({}),
    };
  }

  if (path === '/' || path === '/index.html') {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: HTML({}),
    };
  }

  return { statusCode: 404, body: 'Not found' };
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
