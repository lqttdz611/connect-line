import { useReducer } from 'react';
import { adjacent } from './levels';

// Trạng thái một lượt chơi trên một màn. Đổi màn hoặc chơi lại thì component được tạo mới (key), nên state về ban đầu.
const initial = { path: [], done: false, showing: false, startedAt: null, endedAt: null };

function reducer(state, action) {
  switch (action.type) {
    case 'step': {
      const { lv, i, isTap } = action;
      if (state.done || i < 0 || lv.blocked[i]) return state;
      const { path } = state;
      if (!path.length) {
        if (lv.start != null && i !== lv.start) return state; // chế độ Khó: phải đi từ điểm cho trước
        return { ...state, path: [i], startedAt: Date.now() };
      }
      const head = path[path.length - 1];
      if (i === head) return state;
      const idx = path.indexOf(i);
      if (idx >= 0) {
        // chạm vào điểm đã đi: quay lui về điểm đó; kéo ngược: xoá bước vừa đi
        return isTap || idx === path.length - 2 ? { ...state, path: path.slice(0, idx + 1) } : state;
      }
      if (!adjacent(lv, i, head)) return state;
      const next = [...path, i];
      // chế độ Khó: điểm đích chỉ được đi vào ở bước cuối cùng
      if (lv.end != null && i === lv.end && next.length < lv.free) return state;
      if (next.length === lv.free) return { ...state, path: next, done: true, endedAt: Date.now() };
      return { ...state, path: next };
    }
    case 'reset':
      return initial;
    case 'giveUp':
      return { ...state, path: [], done: true, showing: true, endedAt: state.endedAt ?? Date.now() };
    case 'reveal':
      return { ...state, path: action.path };
    default:
      return state;
  }
}

export const useRound = () => useReducer(reducer, initial);
