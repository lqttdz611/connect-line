import { useEffect, useState } from 'react';

/** Số giây đã trôi qua từ startedAt (dừng ở endedAt). */
export function useClock(startedAt, endedAt) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!startedAt || endedAt) return undefined;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [startedAt, endedAt]);
  if (!startedAt) return 0;
  return Math.max(0, Math.floor(((endedAt || now) - startedAt) / 1000));
}
