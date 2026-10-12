import { useEffect, useMemo, useState } from 'react';
import { generate, MAX_LEVEL, MODES } from '../game/levels';
import { api } from '../api/client';
import { useRound } from '../game/useRound';
import { useClock } from '../game/useClock';
import { formatTime } from '../utils/format';
import Board, { hintFor } from './Board';
import PlayerCard from './PlayerCard';
import ResultModal from './ResultModal';

/** Một lượt chơi trên một màn: thẻ người chơi, bảng, nút Bỏ cuộc / Reset, hộp kết quả. */
export default function GameRound({ mode, level, unlocked, playerName, syncState, syncLabel, onStart, onWin, onGoLevel, onReplay }) {
  const lv = useMemo(() => generate(mode, level), [mode, level]);
  const [round, dispatch] = useRound();
  const seconds = useClock(round.startedAt, round.endedAt);
  const [modal, setModal] = useState(null);

  // chạm điểm đầu tiên: bắt đầu lượt chơi (server bắt đầu tính giờ)
  useEffect(() => {
    if (round.startedAt) onStart(level);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round.startedAt]);

  // qua màn: gửi cả đường vẽ để server kiểm tra
  useEffect(() => {
    if (!round.done || round.showing) return undefined;
    const time = Math.floor((round.endedAt - round.startedAt) / 1000);
    const prev = onWin(level, time, round.path);
    const last = level >= MAX_LEVEL;
    const t = setTimeout(() => setModal({
      title: last ? 'Bạn đã phá đảo!' : 'Hoàn thành!',
      text: `${MODES[mode].label} · Màn ${level} · ${lv.free} điểm · ${formatTime(time)}`
        + (prev != null && time < prev ? ' · Kỷ lục mới!' : prev != null ? ` · Kỷ lục: ${formatTime(prev)}` : ''),
      mainLabel: last ? 'Chơi lại từ màn 1' : 'Màn tiếp theo',
      onMain: () => onGoLevel(last ? 1 : level + 1),
      altLabel: 'Chơi lại màn này',
      onAlt: onReplay,
    }), 450);
    return () => clearTimeout(t);
    // chỉ chạy khi vừa qua màn
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round.done, round.showing]);

  // bỏ cuộc: vẽ dần lời giải (màn Khó không có sẵn lời giải trên máy, phải hỏi server)
  useEffect(() => {
    if (!round.showing) return undefined;
    let cancelled = false;
    let t;
    const play = (sol) => {
      let k = 0;
      const tick = () => {
        k += 1;
        dispatch({ type: 'reveal', path: sol.slice(0, k) });
        if (k < sol.length) t = setTimeout(tick, Math.max(40, (600 / sol.length) * 4));
        else t = setTimeout(() => setModal({
          title: 'Lời giải',
          text: 'Thử lại màn này hoặc xem lời giải thêm lần nữa.',
          mainLabel: 'Chơi lại màn này',
          onMain: onReplay,
          altLabel: 'Xem bảng lời giải',
          onAlt: () => setModal(null),
        }), 700);
      };
      tick();
    };
    if (lv.solution) play(lv.solution);
    else {
      api.solution(mode, level).then(
        (r) => { if (!cancelled) play(r.path); },
        () => {
          if (!cancelled) setModal({
            title: 'Chưa xem được lời giải',
            text: 'Cần kết nối tới server để xem lời giải màn này.',
            mainLabel: 'Chơi lại màn này',
            onMain: onReplay,
          });
        },
      );
    }
    return () => { cancelled = true; clearTimeout(t); };
  }, [round.showing, lv, mode, level, dispatch, onReplay]);

  const reset = () => (round.showing ? onReplay() : dispatch({ type: 'reset' }));
  const giveUp = () => { if (!round.done || round.showing) { if (!round.showing) dispatch({ type: 'giveUp' }); } };

  return (
    <>
      <PlayerCard
        name={playerName}
        syncState={syncState}
        syncLabel={syncLabel}
        level={level}
        unlocked={unlocked}
        seconds={seconds}
        score={`${round.path.length}/${lv.free}`}
        onPrev={() => onGoLevel(level - 1)}
        onNext={() => onGoLevel(level + 1)}
      />
      <div className="board" id="board">
        <Board
          lv={lv}
          path={round.path}
          done={round.done}
          showing={round.showing}
          hints={!MODES[mode].noHints}
          onStep={(i, isTap) => dispatch({ type: 'step', lv, i, isTap })}
        />
        <p className="hint" id="hint">{hintFor(lv, round.path, round.done, round.showing, !MODES[mode].noHints)}</p>
        {modal && <ResultModal {...modal} />}
      </div>
      <div className="actions">
        <button className="btn" id="giveup" type="button" onClick={giveUp}>Bỏ cuộc</button>
        <button className="btn" id="reset" type="button" onClick={reset}>Reset</button>
      </div>
    </>
  );
}
