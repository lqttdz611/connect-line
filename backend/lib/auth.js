// Mật khẩu: băm bằng scrypt + salt riêng. Phiên: token ngẫu nhiên trong cookie HttpOnly.
const crypto = require('node:crypto');

const SESSION_DAYS = 30;
const COOKIE = 'olg_session';

function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16);
    crypto.scrypt(password, salt, 64, (err, key) => err ? reject(err) : resolve(`scrypt$${salt.toString('hex')}$${key.toString('hex')}`));
  });
}

// Hash giả để khi tên đăng nhập không tồn tại vẫn tốn thời gian như thật (tránh dò tên qua thời gian phản hồi).
const DUMMY_HASH = `scrypt$${'0'.repeat(32)}$${'0'.repeat(128)}`;

function verifyPassword(password, stored = DUMMY_HASH) {
  return new Promise(resolve => {
    const [, saltHex, keyHex] = stored.split('$');
    crypto.scrypt(password, Buffer.from(saltHex, 'hex'), 64, (err, key) => {
      if (err) return resolve(false);
      const expected = Buffer.from(keyHex, 'hex');
      resolve(expected.length === key.length && crypto.timingSafeEqual(expected, key));
    });
  });
}

const newToken = () => crypto.randomBytes(32).toString('base64url');
const hashToken = t => crypto.createHash('sha256').update(t).digest('hex');

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function sessionCookie(token, { secure, sameSite = 'Lax' }) {
  const attrs = [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', `SameSite=${sameSite}`, `Max-Age=${SESSION_DAYS * 86400}`];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}
const clearCookie = ({ secure, sameSite = 'Lax' }) => `${COOKIE}=; Path=/; HttpOnly; SameSite=${sameSite}; Max-Age=0${secure ? '; Secure' : ''}`;

// Chặn dò mật khẩu: tối đa 8 lần sai mỗi 15 phút cho mỗi IP + tên đăng nhập.
const failures = new Map();
const WINDOW = 15 * 60 * 1000, MAX_FAILS = 8;
function tooManyAttempts(key) {
  const f = failures.get(key);
  if (!f || Date.now() - f.first > WINDOW) return false;
  return f.count >= MAX_FAILS;
}
function recordFailure(key) {
  const f = failures.get(key);
  if (!f || Date.now() - f.first > WINDOW) failures.set(key, { first: Date.now(), count: 1 });
  else f.count++;
}
const clearFailures = key => failures.delete(key);

module.exports = {
  COOKIE, SESSION_DAYS, hashPassword, verifyPassword, newToken, hashToken,
  parseCookies, sessionCookie, clearCookie, tooManyAttempts, recordFailure, clearFailures,
};
