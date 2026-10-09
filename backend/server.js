// One Line Drawing — backend API: tài khoản, đăng nhập, lưu tiến trình, bảng xếp hạng.
// Cần Node.js 20.12+.  Lần đầu: npm install.  Chạy: npm start
//
// Biến môi trường (đặt trong file .env cạnh server.js, xem .env.example):
//   MONGODB_URI=...           chuỗi kết nối MongoDB (bắt buộc)
//   MONGODB_DB=...            tên database, mặc định lấy từ chuỗi kết nối
//   PORT=3000                 cổng chạy
//   ALLOWED_ORIGINS=...       các địa chỉ frontend được gọi API, cách nhau bằng dấu phẩy
//   COOKIE_SECURE=1           bật khi chạy qua HTTPS (bắt buộc khi đưa lên mạng)
//   COOKIE_SAMESITE=None      chỉ cần khi frontend và backend ở hai tên miền khác hẳn nhau (đi kèm COOKIE_SECURE=1)
//   FRONTEND_DIR=...          thư mục frontend để backend phục vụ luôn (mặc định ../frontend nếu có)
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
// đọc file .env nếu có (Node 20.12+ có sẵn, không cần thư viện dotenv)
try { process.loadEnvFile(path.join(__dirname, '.env')); } catch { /* không có .env thì dùng biến môi trường của hệ thống */ }
const { createStore } = require('./lib/store');
const auth = require('./lib/auth');

const PORT = Number(process.env.PORT) || 3000;
const MAX_LEVEL = 100;
const COOKIE_OPTS = { secure: process.env.COOKIE_SECURE === '1', sameSite: process.env.COOKIE_SAMESITE || 'Lax' };
const ALLOWED_ORIGINS = new Set((process.env.ALLOWED_ORIGINS ||
  'http://localhost:3000,http://localhost:5500,http://127.0.0.1:5500,http://localhost:5173,http://localhost:8080')
  .split(',').map(s => s.trim()).filter(Boolean));
const FRONTEND_DIR = path.resolve(process.env.FRONTEND_DIR || path.join(__dirname, '..', 'frontend'));
const SERVE_FRONTEND = fs.existsSync(path.join(FRONTEND_DIR, 'index.html'));
let store; // gán sau khi kết nối MongoDB, xem cuối file

/* ---------- tiến trình ---------- */
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const emptyProgress = () => ({ unlocked: 1, level: 1, best: {} });
function cleanProgress(p) {
  if (!p || typeof p !== 'object') return null;
  if (!int(p.unlocked, 1, MAX_LEVEL) || !int(p.level, 1, MAX_LEVEL)) return null;
  const best = {};
  for (const [k, v] of Object.entries(p.best || {})) {
    const L = Number(k);
    if (int(L, 1, MAX_LEVEL) && int(v, 0, 86400)) best[L] = v;
  }
  return { unlocked: p.unlocked, level: Math.min(p.level, p.unlocked), best };
}
const publicUser = u => ({ username: u.username, createdAt: u.createdAt, progress: { ...u.progress, level: Math.min(u.progress.level, u.progress.unlocked) } });

/* ---------- http helpers ---------- */
function send(res, code, body, headers = {}) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}
function readJson(req) {
  // Chỉ nhận JSON: form từ trang web khác không gửi được kiểu này nếu không qua CORS, nên chặn được CSRF.
  if (!(req.headers['content-type'] || '').startsWith('application/json')) return Promise.reject(new Error('json required'));
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > 16384) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
async function currentSession(req) {
  const token = auth.parseCookies(req.headers.cookie)[auth.COOKIE];
  if (!token) return null;
  const tokenHash = auth.hashToken(token);
  const s = await store.getSession(tokenHash);
  if (!s) return null;
  const user = await store.getUser(s.userId);
  return user ? { user, tokenHash } : null;
}
async function startSession(res, user, body) {
  const token = auth.newToken();
  const expiresAt = new Date(Date.now() + auth.SESSION_DAYS * 86400e3);
  await store.createSession(auth.hashToken(token), { userId: user._id, expiresAt });
  send(res, 200, body, { 'Set-Cookie': auth.sessionCookie(token, COOKIE_OPTS) });
}

const USERNAME = /^[A-Za-z0-9_.]{3,20}$/;
function credentials(body) {
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!USERNAME.test(username)) return { error: 'Tên đăng nhập gồm 3–20 ký tự: chữ không dấu, số, dấu _ hoặc dấu chấm.' };
  if (password.length < 6 || password.length > 100) return { error: 'Mật khẩu cần từ 6 đến 100 ký tự.' };
  return { username, password };
}

/* ---------- routes ---------- */
const routes = {
  'GET /api/health': (req, res) => send(res, 200, { ok: true }),

  'POST /api/auth/register': async (req, res) => {
    const body = await readJson(req);
    const c = credentials(body);
    if (c.error) return send(res, 400, { error: c.error });
    const taken = { error: 'Tên đăng nhập này đã có người dùng.' };
    if (await store.findUserByName(c.username)) return send(res, 409, taken);
    // tiến trình chơi thử trước khi đăng ký được giữ lại
    const guest = cleanProgress(body.progress);
    const user = await store.createUser({
      _id: crypto.randomUUID(),
      username: c.username,
      usernameLower: c.username.toLowerCase(),
      passwordHash: await auth.hashPassword(c.password),
      createdAt: new Date(),
      progress: guest || emptyProgress(),
    });
    if (!user) return send(res, 409, taken); // hai người đăng ký cùng tên cùng lúc
    await startSession(res, user, { user: publicUser(user) });
  },

  'POST /api/auth/login': async (req, res) => {
    const body = await readJson(req);
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const key = `${req.socket.remoteAddress}|${username.toLowerCase()}`;
    if (auth.tooManyAttempts(key)) return send(res, 429, { error: 'Sai quá nhiều lần. Thử lại sau 15 phút.' });
    let user = username ? await store.findUserByName(username) : null;
    const ok = await auth.verifyPassword(password, user?.passwordHash);
    if (!user || !ok) { auth.recordFailure(key); return send(res, 401, { error: 'Sai tên đăng nhập hoặc mật khẩu.' }); }
    auth.clearFailures(key);
    const guest = cleanProgress(body.progress);
    // giữ màn đang chơi của tài khoản, chỉ gộp thêm các màn đã qua lúc chơi thử
    if (guest) user = await store.mergeProgress(user._id, guest, { keepLevel: true });
    await startSession(res, user, { user: publicUser(user) });
  },

  'POST /api/auth/logout': async (req, res) => {
    const s = await currentSession(req);
    if (s) await store.deleteSession(s.tokenHash);
    send(res, 200, { ok: true }, { 'Set-Cookie': auth.clearCookie(COOKIE_OPTS) });
  },

  'GET /api/me': async (req, res) => {
    const s = await currentSession(req);
    if (!s) return send(res, 401, { error: 'Chưa đăng nhập' });
    send(res, 200, { user: publicUser(s.user) });
  },

  'PUT /api/progress': async (req, res) => {
    const s = await currentSession(req);
    if (!s) return send(res, 401, { error: 'Chưa đăng nhập' });
    const progress = cleanProgress((await readJson(req)).progress);
    if (!progress) return send(res, 400, { error: 'Dữ liệu tiến trình không hợp lệ' });
    const user = await store.mergeProgress(s.user._id, progress);
    send(res, 200, { progress: user.progress });
  },

  'GET /api/leaderboard': async (req, res) => {
    const me = (await currentSession(req))?.user._id;
    const rows = (await store.leaderboard(20))
      .map(u => ({ name: u.username, solved: u.stats.solved, totalTime: u.stats.totalTime, me: u._id === me })); // không lộ id người khác
    send(res, 200, { rows });
  },
};

/* ---------- CORS: cho phép frontend chạy ở địa chỉ khác gọi API kèm cookie ---------- */
function cors(req, res) {
  const origin = req.headers.origin;
  if (!origin) return true;                       // cùng địa chỉ hoặc gọi từ công cụ như curl
  if (!ALLOWED_ORIGINS.has(origin)) return false;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Vary', 'Origin');
  return true;
}

/* ---------- server ---------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api/')) {
      const sameHost = req.headers.origin === `http://${req.headers.host}` || req.headers.origin === `https://${req.headers.host}`;
      if (!sameHost && !cors(req, res)) return send(res, 403, { error: 'Địa chỉ này không được phép gọi API' });
      if (req.method === 'OPTIONS') {
        res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600' });
        return res.end();
      }
      const handler = routes[`${req.method} ${url.pathname.replace(/\/$/, '')}`];
      return handler ? await handler(req, res) : send(res, 404, { error: 'Không có API này' });
    }
    // phục vụ luôn frontend (tiện khi chạy thử hoặc khi đưa cả hai lên cùng một server)
    if (!SERVE_FRONTEND) { res.writeHead(404); return res.end('Not found'); }
    const file = path.join(FRONTEND_DIR, url.pathname === '/' ? 'index.html' : path.normalize(decodeURIComponent(url.pathname)));
    if (!file.startsWith(FRONTEND_DIR + path.sep)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end('Not found'); }
      const type = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' }[path.extname(file)] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type });
      res.end(data);
    });
  } catch (e) {
    if (e?.name?.startsWith('Mongo')) {           // lỗi database: ghi log, không lộ chi tiết cho người chơi
      console.error('Lỗi MongoDB:', e.message);
      if (!res.headersSent) send(res, 503, { error: 'Máy chủ đang bận, thử lại sau.' });
    } else if (!res.headersSent) send(res, 400, { error: 'Yêu cầu không hợp lệ' });
  }
});

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('Thiếu MONGODB_URI. Tạo file backend/.env từ .env.example rồi điền chuỗi kết nối MongoDB.');
    process.exit(1);
  }
  try {
    store = await createStore(process.env.MONGODB_URI, process.env.MONGODB_DB);
  } catch (e) {
    console.error('Không kết nối được MongoDB:', e.message);
    console.error('Kiểm tra chuỗi kết nối, mật khẩu, và Network Access trên MongoDB Atlas (cho phép IP của máy này).');
    process.exit(1);
  }
  console.log(`MongoDB: đã kết nối, database "${store.dbName}"`);
  server.listen(PORT, () => {
    console.log(`API: http://localhost:${PORT}/api`);
    if (SERVE_FRONTEND) console.log(`Game: http://localhost:${PORT}  (frontend: ${FRONTEND_DIR})`);
  });
  const stop = async () => { server.close(); await store.close(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
main();
