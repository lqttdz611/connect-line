import { MAX_LEVEL } from '../game/levels';
import { formatTime } from '../utils/format';

const SYNC_TEXT = {
  local: 'Lưu trên máy này',
  saving: 'Đang lưu…',
  saved: 'Đã lưu lên server',
  error: 'Chưa lưu được, sẽ thử lại',
};

export default function PlayerCard({ name, syncState, syncLabel, level, unlocked, seconds, score, onPrev, onNext }) {
  return (
    <div className="card">
      <div className="avatar" id="avatar" aria-hidden="true">{(name.trim()[0] || 'B').toUpperCase()}</div>
      <div className="who">
        <b id="pname">{name}</b>
        <span className="sync" id="sync" data-state={syncState === 'saved' ? 'cloud' : syncState}>
          {syncLabel || SYNC_TEXT[syncState]}
        </span>
      </div>
      <div className="stat">
        <small className="lvlnav">
          <button id="prev" type="button" aria-label="Màn trước" disabled={level <= 1} onClick={onPrev}>‹</button>
          <span id="lvlLabel">Màn {level}/{MAX_LEVEL}</span>
          <button id="next" type="button" aria-label="Màn sau" disabled={level >= unlocked} onClick={onNext}>›</button>
        </small>
        <b id="timer">{formatTime(seconds)}</b>
      </div>
      <div className="sep" />
      <div className="stat">
        <small>Điểm</small>
        <b id="score">{score}</b>
      </div>
    </div>
  );
}
