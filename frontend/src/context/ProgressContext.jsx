import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { MAX_LEVEL, MODE_KEYS } from '../game/levels';
import { api } from '../api/client';
import { storage, RECEIPTS_KEY } from '../utils/storage';
import { useAuth } from './AuthContext';

/**
 * Tiến trình người chơi, tách theo chế độ: modes[mode] = { unlocked, level, best: { [màn]: giây } }.
 * Luôn lưu vào trình duyệt. Qua màn được server xác nhận: lượt chơi báo bắt đầu (beginRound),
 * vẽ xong gửi cả đường vẽ (recordWin). Đã đăng nhập thì server ghi thẳng vào tài khoản và trả về
 * tiến trình chính thức; chơi thử thì server trả chứng nhận, gửi kèm khi đăng nhập.
 *   sync: 'local' | 'saving' | 'saved' | 'error'
 */
const ProgressContext = createContext(null);
const EMPTY = { unlocked: 1, level: 1, best: {} };
const KEY = 'olg-progress-v3';
const MODE_KEY = 'olg-mode';

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n | 0));
function normalize(p) {
  const unlocked = clamp(p?.unlocked || 1, 1, MAX_LEVEL);
  return { unlocked, level: clamp(p?.level || 1, 1, unlocked), best: { ...(p?.best || {}) } };
}
const normalizeAll = (all) => Object.fromEntries(MODE_KEYS.map((m) => [m, normalize(all?.[m])]));
const emptyAll = () => normalizeAll({});

function loadLocal() {
  const saved = storage.get(KEY, null);
  if (saved) return normalizeAll(saved);
  // bản 3 chế độ đầu tiên: Trung bình cũ nay là Dễ, Khó cũ nay là Trung bình
  const v2 = storage.get('olg-progress-v2', null);
  if (v2) return normalizeAll({ easy: v2.medium, medium: v2.hard });
  // bản chưa có chế độ chơi: các màn đó nay là chế độ Dễ
  const legacy = storage.get('olg-progress', null);
  return normalizeAll(legacy ? { easy: legacy } : {});
}

export function ProgressProvider({ children }) {
  const { status, user, sessionExpired } = useAuth();
  const [modes, setModes] = useState(loadLocal);
  const [mode, setModeState] = useState(() => (MODE_KEYS.includes(storage.get(MODE_KEY, '')) ? storage.get(MODE_KEY, '') : 'easy'));
  const [sync, setSync] = useState('local');
  const [savedAt, setSavedAt] = useState(0);
  const lastSent = useRef({});   // màn đang chơi đã lưu lên server, theo chế độ
  const roundRef = useRef(null);  // Promise<roundId | null> của lượt đang chơi
  const prevStatus = useRef(status);
  const modesRef = useRef(modes);
  modesRef.current = modes;

  // đăng nhập: dùng tiến trình của tài khoản (server đã gộp phần chơi thử vào)
  // đăng xuất: xoá tiến trình khỏi trình duyệt, để máy dùng chung không lộ tiến trình người trước
  useEffect(() => {
    if (user) {
      const all = normalizeAll(user.progress);
      lastSent.current = Object.fromEntries(MODE_KEYS.map((m) => [m, all[m].level]));
      setModes(all);
      setSync('saved');
    } else if (prevStatus.current === 'user' && status === 'guest') {
      setModes(emptyAll());
      storage.set(RECEIPTS_KEY, []);
      setSync('local');
    }
    prevStatus.current = status;
  }, [user, status]);

  useEffect(() => { storage.set(KEY, modes); }, [modes]);
  useEffect(() => { storage.set(MODE_KEY, mode); }, [mode]);

  // lưu màn đang chơi lên server (để máy khác mở đúng màn)
  useEffect(() => {
    if (!user) return undefined;
    const changed = MODE_KEYS.filter((m) => modes[m].level !== lastSent.current[m]);
    if (!changed.length) return undefined;
    const timer = setTimeout(async () => {
      try {
        for (const m of changed) {
          await api.saveLevel(m, modes[m].level);
          lastSent.current[m] = modes[m].level;
        }
      } catch (e) {
        // 403: màn vừa mở nhưng server chưa nhận kết quả qua màn; khi nhận xong sẽ lưu lại
        if (e.status === 401) sessionExpired();
        else if (e.status !== 403) setSync('error');
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [modes, user, sessionExpired]);

  const setMode = useCallback((m) => { if (MODE_KEYS.includes(m)) setModeState(m); }, []);

  const setLevel = useCallback((L) => {
    setModes((all) => ({ ...all, [mode]: { ...all[mode], level: clamp(L, 1, all[mode].unlocked) } }));
  }, [mode]);

  /** Người chơi vừa chạm điểm đầu tiên: báo server bắt đầu tính giờ. */
  const beginRound = useCallback((L) => {
    roundRef.current = status === 'user' || status === 'guest'
      ? api.startRound(mode, L).then((r) => r.roundId, () => null)
      : Promise.resolve(null);
  }, [mode, status]);

  /**
   * Ghi nhận qua màn ở chế độ hiện tại: cập nhật ngay trên máy, rồi gửi đường vẽ cho server kiểm tra.
   * Trả về kỷ lục cũ (nếu có) để hiện thông báo.
   */
  const recordWin = useCallback((L, seconds, path) => {
    const prev = modesRef.current[mode].best[L];
    setModes((all) => {
      const p = all[mode];
      const cur = p.best[L];
      const best = cur == null || seconds < cur ? { ...p.best, [L]: seconds } : p.best;
      const unlocked = L >= p.unlocked && L < MAX_LEVEL ? L + 1 : p.unlocked;
      return { ...all, [mode]: { ...p, unlocked, best } };
    });
    const round = roundRef.current;
    roundRef.current = null;
    if (round) {
      (async () => {
        const roundId = await round;
        if (!roundId) return;
        if (user) setSync('saving');
        try {
          const r = await api.finishRound(roundId, path);
          if (r.receipt) {
            storage.set(RECEIPTS_KEY, [...storage.get(RECEIPTS_KEY, []), r.receipt].slice(-400));
          } else if (r.progress) {
            // tiến trình chính thức từ server; giữ màn người chơi đang mở trên máy này
            setModes((all) => ({ ...all, [r.mode]: normalize({ ...r.progress, level: all[r.mode].level }) }));
            setSync('saved');
            setSavedAt(Date.now());
          }
        } catch (e) {
          if (e.status === 401) sessionExpired();
          else if (user) setSync('error');
        }
      })();
    }
    return prev;
  }, [mode, user, sessionExpired]);

  const value = useMemo(
    () => ({ mode, setMode, modes, progress: modes[mode], sync, savedAt, setLevel, beginRound, recordWin }),
    [mode, setMode, modes, sync, savedAt, setLevel, beginRound, recordWin],
  );
  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}

export const useProgress = () => useContext(ProgressContext);
