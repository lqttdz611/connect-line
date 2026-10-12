// One Line Drawing — backend API: tài khoản, đăng nhập, kiểm tra kết quả chơi, lưu tiến trình, bảng xếp hạng.
// Cần Node.js 20.12+.  Lần đầu: npm install.  Chạy: npm start
//
// Biến môi trường (đặt trong file .env cạnh server.js, xem .env.example):
//   MONGODB_URI=...           chuỗi kết nối MongoDB (bắt buộc)
//   MONGODB_DB=...            tên database, mặc định lấy từ chuỗi kết nối
//   PORT=3000                 cổng chạy
//   ALLOWED_ORIGINS=...       các địa chỉ frontend được gọi API, cách nhau bằng dấu phẩy
//   GAME_SECRET=...           chuỗi bí mật để ký chứng nhận qua màn của khách (nên đặt, xem .env.example)
//   COOKIE_SECURE=1           bật khi chạy qua HTTPS (bắt buộc khi đưa lên mạng)
//   COOKIE_SAMESITE=None      chỉ cần khi frontend và backend ở hai tên miền khác hẳn nhau (đi kèm COOKIE_SECURE=1)
//   FRONTEND_DIR=...          thư mục frontend đã build để backend phục vụ luôn (mặc định ../frontend/dist nếu có)
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
// đọc file .env nếu có (Node 20.12+ có sẵn, không cần thư viện dotenv)
try { process.loadEnvFile(path.join(__dirname, '.env')); } catch { /* không có .env thì dùng biến môi trường của hệ thống */ }
const { createStore, MODES } = require('./lib/store');
const auth = require('./lib/auth');
const game = require('./lib/game');

const PORT = Number(process.env.PORT) || 3000;
const { MAX_LEVEL } = game;
const ROUND_HOURS = 6;
const COOKIE_OPTS = { secure: process.env.COOKIE_SECURE === '1', sameSite: process.env.COOKIE_SAMESITE || 'Lax' };
const ALLOWED_ORIGINS = new Set((process.env.ALLOWED_ORIGINS ||
  'http://localhost:3000,http://localhost:5500,http://127.0.0.1:5500,http://localhost:5173,http://localhost:8080')
  .split(',').map(s => s.trim()).filter(Boolean));
// mặc định phục vụ bản build React (../frontend/dist, tạo bằng `npm run build` trong frontend)
const FRONTEND_DIR = path.resolve(process.env.FRONTEND_DIR || path.join(__dirname, '..', 'frontend', 'dist'));
const SERVE_FRONTEND = fs.existsSync(path.join(FRONTEND_DIR, 'index.html'));
let store; // gán sau khi kết nối MongoDB, xem cuối file

/* ---------- tiến trình ----------
   Trình duyệt không tự báo "đã qua màn": mỗi lượt chơi bắt đầu bằng POST /api/rounds (server ghi giờ),
   khi vẽ xong gửi cả đường vẽ lên POST /api/rounds/finish, server kiểm tra rồi mới ghi nhận. */
const emptyProgress = () => ({ unlocked: 1, level: 1, best: {} });
const isMode = m => MODES.includes(m);

/** Gộp các chứng nhận qua màn lúc chơi thử vào tài khoản, theo thứ tự màn (màn chưa mở thì bỏ qua). */
async function applyReceipts(user, receipts) {
  if (!Array.isArray(receipts)) return user;
  const wins = receipts.slice(0, 400).map(game.readReceipt).filter(Boolean)
    .sort((a, b) => a.mode.localeCompare(b.mode) || a.level - b.level);
  for (const w of wins) {
    if (w.level > (user.progress?.[w.mode]?.unlocked || 1)) continue;
    user = await store.recordWin(user._id, w.mode, w.level, w.time, MAX_LEVEL) || user;
  }
  return user;
}
const publicProgress = all => Object.fromEntries(MODES.map(m => {
  const p = all?.[m] || emptyProgress();
  return [m, { unlocked: p.unlocked, level: Math.min(p.level || 1, p.unlocked), best: p.best || {} }];
}));
const publicUser = u => ({ username: u.username, createdAt: u.createdAt, progress: publicProgress(u.progress) });

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
    req.on('data', c => { size += c.length; if (size > 65536) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
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
    let user = await store.createUser({
      _id: crypto.randomUUID(),
      username: c.username,
      usernameLower: c.username.toLowerCase(),
      passwordHash: await auth.hashPassword(c.password),
      createdAt: new Date(),
      progress: Object.fromEntries(MODES.map(m => [m, emptyProgress()])),
    });
    if (!user) return send(res, 409, taken); // hai người đăng ký cùng tên cùng lúc
    user = await applyReceipts(user, body.receipts); // các màn đã qua lúc chơi thử
    // tiếp tục ở màn đang chơi thử (nếu màn đó đã mở)
    for (const m of MODES) {
      const L = body.levels?.[m];
      if (game.isLevel(L) && L > 1) user = await store.setLevel(user._id, m, L) || user;
    }
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
    user = await applyReceipts(user, body.receipts); // giữ màn đang chơi, gộp thêm các màn đã qua lúc chơi thử
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

  // đổi màn đang chơi (chỉ được chọn màn đã mở)
  'PUT /api/progress': async (req, res) => {
    const s = await currentSession(req);
    if (!s) return send(res, 401, { error: 'Chưa đăng nhập' });
    const body = await readJson(req);
    if (!isMode(body.mode) || !game.isLevel(body.level)) return send(res, 400, { error: 'Dữ liệu không hợp lệ' });
    const user = await store.setLevel(s.user._id, body.mode, body.level);
    if (!user) return send(res, 403, { error: 'Màn này chưa mở' });
    send(res, 200, { mode: body.mode, progress: publicProgress(user.progress)[body.mode] });
  },

  // bắt đầu một lượt chơi: server ghi lại giờ bắt đầu
  'POST /api/rounds': async (req, res) => {
    const s = await currentSession(req);
    const body = await readJson(req);
    if (!isMode(body.mode) || !game.isLevel(body.level)) return send(res, 400, { error: 'Dữ liệu không hợp lệ' });
    if (s && body.level > (s.user.progress?.[body.mode]?.unlocked || 1)) return send(res, 403, { error: 'Màn này chưa mở' });
    const now = Date.now();
    const roundId = auth.newToken();
    await store.createRound({
      _id: roundId, userId: s?.user._id ?? null, mode: body.mode, level: body.level,
      startedAt: new Date(now), expiresAt: new Date(now + ROUND_HOURS * 3600e3),
    });
    send(res, 200, { roundId });
  },

  // nộp đường vẽ: kiểm tra hợp lệ, tự tính thời gian, rồi mới ghi nhận qua màn
  'POST /api/rounds/finish': async (req, res) => {
    const s = await currentSession(req);
    const body = await readJson(req);
    const round = typeof body.roundId === 'string' ? await store.takeRound(body.roundId) : null;
    if (!round) return send(res, 404, { error: 'Lượt chơi không tồn tại hoặc đã hết hạn' });
    if (round.userId !== (s?.user._id ?? null)) return send(res, 403, { error: 'Lượt chơi không thuộc về bạn' });
    const elapsed = (Date.now() - round.startedAt.getTime()) / 1000;
    const reason = game.judge(round.mode, round.level, body.path, elapsed);
    if (reason) return send(res, 422, { error: reason });
    const time = Math.floor(elapsed);
    if (!s) return send(res, 200, { mode: round.mode, level: round.level, time, receipt: game.makeReceipt(round.mode, round.level, time) });
    const user = await store.recordWin(s.user._id, round.mode, round.level, time, MAX_LEVEL);
    send(res, 200, { mode: round.mode, level: round.level, time, progress: publicProgress(user.progress)[round.mode] });
  },

  // lời giải, khi người chơi bỏ cuộc (màn Khó không gửi sẵn lời giải xuống trình duyệt)
  'GET /api/solution': async (req, res, url) => {
    const mode = url.searchParams.get('mode');
    const level = Number(url.searchParams.get('level'));
    if (!isMode(mode) || !game.isLevel(level)) return send(res, 400, { error: 'Dữ liệu không hợp lệ' });
    send(res, 200, { path: game.solution(mode, level) });
  },

  'GET /api/leaderboard': async (req, res, url) => {
    const me = (await currentSession(req))?.user._id;
    const mode = url.searchParams.get('mode') || 'medium';
    if (!isMode(mode)) return send(res, 400, { error: 'Chế độ chơi không hợp lệ' });
    const rows = (await store.leaderboard(mode, 20))
      .map(u => ({ name: u.username, solved: u.stats[mode].solved, totalTime: u.stats[mode].totalTime, me: u._id === me })); // không lộ id người khác
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
      return handler ? await handler(req, res, url) : send(res, 404, { error: 'Không có API này' });
    }
    // phục vụ luôn frontend (tiện khi chạy thử hoặc khi đưa cả hai lên cùng một server)
    if (!SERVE_FRONTEND) { res.writeHead(404); return res.end('Chưa có bản build frontend. Chạy `npm run build` trong thư mục frontend, hoặc dùng `npm run dev`.'); }
    const file = path.join(FRONTEND_DIR, url.pathname === '/' ? 'index.html' : path.normalize(decodeURIComponent(url.pathname)));
    if (!file.startsWith(FRONTEND_DIR + path.sep)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end('Not found'); }
      const type = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2' }[path.extname(file)] || 'application/octet-stream';
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
  await game.init();
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
