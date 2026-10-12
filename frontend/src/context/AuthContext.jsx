import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { storage, RECEIPTS_KEY } from '../utils/storage';

/**
 * Trạng thái đăng nhập.
 *   status: 'loading' | 'offline' (không gọi được backend) | 'guest' | 'user'
 *   user:   { username, createdAt, progress } khi đã đăng nhập
 */
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [status, setStatus] = useState('loading');
  const [user, setUser] = useState(null);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await api.health();
      } catch {
        if (!cancelled) setStatus('offline');
        return;
      }
      try {
        const { user } = await api.me();
        if (!cancelled) { setUser(user); setStatus('user'); }
      } catch {
        if (!cancelled) setStatus('guest');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // các màn đã qua lúc chơi thử được gửi kèm dưới dạng chứng nhận do server ký;
  // tài khoản mới tiếp tục ở màn đang chơi thử (levels: { [chế độ]: màn })
  const signIn = useCallback(async (mode, username, password, levels) => {
    const call = mode === 'register' ? api.register : api.login;
    const { user } = await call(username, password, storage.get(RECEIPTS_KEY, []), levels);
    storage.set(RECEIPTS_KEY, []);
    setUser(user);
    setStatus('user');
    setExpired(false);
    return user;
  }, []);

  const logout = useCallback(async () => {
    try { await api.logout(); } catch { /* vẫn đăng xuất ở phía trình duyệt */ }
    setUser(null);
    setStatus('guest');
  }, []);

  // server trả 401 khi đang lưu: phiên đã hết hạn
  const sessionExpired = useCallback(() => {
    setUser(null);
    setStatus('guest');
    setExpired(true);
  }, []);

  const value = useMemo(
    () => ({ status, user, expired, signIn, logout, sessionExpired, clearExpired: () => setExpired(false) }),
    [status, user, expired, signIn, logout, sessionExpired],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
