import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { formatTime } from '../utils/format';
import { MODES } from '../game/levels';

/** Top 20 người chơi. Tải lại mỗi 30 giây và mỗi khi refreshKey đổi (vừa lưu tiến trình, đăng nhập/đăng xuất). */
export default function Leaderboard({ mode, refreshKey }) {
  const [rows, setRows] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { rows } = await api.leaderboard(mode);
        if (!cancelled) setRows(rows);
      } catch { /* giữ dữ liệu cũ */ }
    };
    load();
    const t = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(t); };
  }, [mode, refreshKey]);

  if (!rows) return null;
  return (
    <section className="lb" id="lb">
      <h2>Bảng xếp hạng · {MODES[mode].label} <small>số màn đã qua · tổng thời gian kỷ lục</small></h2>
      {rows.length ? (
        <ol id="lbList">
          {rows.map((r, i) => (
            <li key={i} className={r.me ? 'me' : undefined}>
              <span className="n">{r.name}{r.me ? ' (bạn)' : ''}</span>
              <span>{r.solved} màn</span>
              <span className="t">{formatTime(r.totalTime | 0)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p id="lbEmpty">Chưa có ai trên bảng. Qua màn đầu tiên để ghi tên mình.</p>
      )}
    </section>
  );
}
