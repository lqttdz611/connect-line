import { MODES, MODE_KEYS } from '../game/levels';

/** Chọn chế độ chơi. Mỗi chế độ giữ tiến trình riêng, hiện màn đã mở tới đâu. */
export default function ModePicker({ mode, modes, onChange }) {
  return (
    <div className="modes" id="modes" role="radiogroup" aria-label="Chế độ chơi">
      {MODE_KEYS.map((m) => (
        <button
          key={m}
          id={`mode-${m}`}
          type="button"
          role="radio"
          aria-checked={mode === m}
          className={mode === m ? 'mode active' : 'mode'}
          onClick={() => onChange(m)}
        >
          <b>{MODES[m].label}</b>
          <small>Màn {modes[m].unlocked}</small>
        </button>
      ))}
    </div>
  );
}
