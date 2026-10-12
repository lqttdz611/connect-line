// Luật chơi phía server: dựng lại màn từ code dùng chung (../shared), kiểm tra đường vẽ,
// giữ lời giải màn Khó, và ký "giấy chứng nhận" qua màn cho người chơi chưa đăng nhập.
const crypto = require('node:crypto');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const HARD_SOLUTIONS = require('../data/hardSolutions.json');

const MAX_LEVEL = 100;
const MIN_SECONDS_PER_CELL = 0.08; // nhanh hơn mức này thì không phải người vẽ
const RECEIPT_DAYS = 30;

let levels;                         // module shared/levels.js (ESM), nạp trong init()
let SECRET;

async function init() {
  levels = await import(pathToFileURL(path.join(__dirname, '..', '..', 'shared', 'levels.js')).href);
  SECRET = process.env.GAME_SECRET;
  if (!SECRET) {
    SECRET = crypto.randomBytes(32).toString('hex');
    console.warn('Chưa đặt GAME_SECRET trong .env: chứng nhận qua màn của khách sẽ mất hiệu lực mỗi lần khởi động lại server.');
  }
}

const isMode = m => typeof m === 'string' && Object.hasOwn(levels.MODES, m);
const isLevel = L => Number.isInteger(L) && L >= 1 && L <= MAX_LEVEL;
const level = (mode, L) => levels.generate(mode, L);

/** Kiểm tra đường vẽ. Trả về null nếu hợp lệ, hoặc lý do bị từ chối. */
function judge(mode, L, drawn, seconds) {
  const lv = level(mode, L);
  if (!levels.checkPath(lv, drawn)) return 'Đường vẽ không hợp lệ.';
  if (seconds < lv.free * MIN_SECONDS_PER_CELL) return 'Thời gian hoàn thành không hợp lệ.';
  return null;
}

const solution = (mode, L) => (levels.MODES[mode].preset ? HARD_SOLUTIONS[L - 1] : level(mode, L).solution);

/* ---------- chứng nhận qua màn cho khách: {mode, level, time} kèm chữ ký HMAC ---------- */
const sign = payload => crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');

function makeReceipt(mode, L, time) {
  const payload = Buffer.from(JSON.stringify({ m: mode, l: L, t: time, at: Date.now() })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

/** Trả về {mode, level, time} nếu chứng nhận đúng chữ ký và còn hạn, ngược lại null. */
function readReceipt(receipt) {
  if (typeof receipt !== 'string' || receipt.length > 300) return null;
  const [payload, sig] = receipt.split('.');
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  try {
    const { m, l, t, at } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!isMode(m) || !isLevel(l) || !Number.isInteger(t) || Date.now() - at > RECEIPT_DAYS * 86400e3) return null;
    return { mode: m, level: l, time: t };
  } catch {
    return null;
  }
}

module.exports = { init, MAX_LEVEL, isMode, isLevel, judge, solution, makeReceipt, readReceipt, modes: () => Object.keys(levels.MODES) };
