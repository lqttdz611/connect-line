// Gọi backend. VITE_API_BASE để trống: dùng cùng địa chỉ với trang (dev có proxy trong vite.config.js).
const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(method, path, body) {
  let res;
  try {
    res = await fetch(`${API_BASE}/api${path}`, {
      method,
      cache: 'no-store',
      credentials: 'include', // gửi kèm cookie đăng nhập
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Không kết nối được server.', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || 'Lỗi kết nối, thử lại sau.', res.status);
  return data;
}

export const api = {
  health: () => request('GET', '/health'),
  me: () => request('GET', '/me'),
  // receipts: chứng nhận qua màn lúc chơi thử, server gộp vào tài khoản
  register: (username, password, receipts, levels) => request('POST', '/auth/register', { username, password, receipts, levels }),
  login: (username, password, receipts) => request('POST', '/auth/login', { username, password, receipts }),
  logout: () => request('POST', '/auth/logout'),
  saveLevel: (mode, level) => request('PUT', '/progress', { mode, level }),
  // một lượt chơi: báo bắt đầu (server ghi giờ), vẽ xong thì nộp đường vẽ để server kiểm tra
  startRound: (mode, level) => request('POST', '/rounds', { mode, level }),
  finishRound: (roundId, path) => request('POST', '/rounds/finish', { roundId, path }),
  solution: (mode, level) => request('GET', `/solution?mode=${encodeURIComponent(mode)}&level=${level}`),
  leaderboard: (mode) => request('GET', `/leaderboard?mode=${encodeURIComponent(mode)}`),
};
