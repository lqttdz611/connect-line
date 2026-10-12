import { useRef } from 'react';
import { adjacent } from '../game/levels';

const GAP = 58;
const R = 13;
const pos = (lv, i) => [(i % lv.cols) * GAP + GAP / 2, ((i / lv.cols) | 0) * GAP + GAP / 2];

/** Bảng chơi SVG. Kéo hoặc chạm để vẽ; gọi onStep(ô, laChạm). */
export default function Board({ lv, path, done, showing, hints = true, onStep }) {
  const svgRef = useRef(null);
  const dragging = useRef(false);

  const cellAt = (e) => {
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    const cx = Math.floor(p.x / GAP);
    const cy = Math.floor(p.y / GAP);
    if (cx < 0 || cy < 0 || cx >= lv.cols || cy >= lv.rows) return -1;
    const i = cy * lv.cols + cx;
    const [x, y] = pos(lv, i);
    return Math.hypot(p.x - x, p.y - y) <= GAP * 0.46 ? i : -1; // chỉ tính khi gần tâm điểm
  };

  const onPointerDown = (e) => {
    if (done) return;
    const i = cellAt(e);
    if (i < 0) return;
    e.preventDefault();
    svgRef.current.setPointerCapture(e.pointerId);
    dragging.current = true;
    onStep(i, true);
  };
  const onPointerMove = (e) => {
    if (dragging.current && !done) onStep(cellAt(e), false);
  };
  const endDrag = () => { dragging.current = false; };

  const head = path[path.length - 1];
  const inPath = new Set(path);
  const cells = [...Array(lv.cols * lv.rows).keys()];
  const nexts = new Set(hints && !done && path.length ? cells.filter((i) => !lv.blocked[i] && !inPath.has(i) && adjacent(lv, i, head)) : []);
  const mustStart = !path.length && lv.start != null ? lv.start : null;

  return (
    <svg
      id="grid"
      ref={svgRef}
      className={showing ? 'sol' : done ? 'win' : undefined}
      viewBox={`0 0 ${lv.cols * GAP} ${lv.rows * GAP}`}
      style={{ maxWidth: lv.cols * GAP * 1.15 }}
      aria-label="Bảng chơi"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {cells.map((i) => {
        const [x, y] = pos(lv, i);
        if (lv.blocked[i]) {
          return (
            <g key={i} className="blk">
              <rect x={x - 19} y={y - 19} width={38} height={38} rx={8} />
              <path d={`M${x - 8} ${y - 8}L${x + 8} ${y + 8}M${x + 8} ${y - 8}L${x - 8} ${y + 8}`} />
            </g>
          );
        }
        if (inPath.has(i)) return null;
        if (i === mustStart) {
          return (
            <g key={i} className="start">
              <circle className="dot next" cx={x} cy={y} r={R - 1} />
              <circle className="startcore" cx={x} cy={y} r={4} />
            </g>
          );
        }
        if (i === lv.end) {
          return (
            <g key={i} className="goal">
              <circle className={nexts.has(i) ? 'dot next' : 'dot'} cx={x} cy={y} r={R - 1} />
              <circle className="goalring" cx={x} cy={y} r={R + 5} />
            </g>
          );
        }
        return <circle key={i} className={nexts.has(i) ? 'dot next' : 'dot'} cx={x} cy={y} r={R - 1} />;
      })}
      {path.slice(1).map((i, k) => {
        const [x1, y1] = pos(lv, path[k]);
        const [x2, y2] = pos(lv, i);
        return <line key={`s${k}`} className="seg" x1={x1} y1={y1} x2={x2} y2={y2} />;
      })}
      {path.map((i, k) => {
        const [x, y] = pos(lv, i);
        const last = k === path.length - 1;
        return (
          <g key={`n${k}`} className={last ? 'node head' : 'node'}>
            {last && !done && <circle className="halo" cx={x} cy={y} r={R + 8} />}
            <circle cx={x} cy={y} r={R} />
            <text x={x} y={y}>{k + 1}</text>
          </g>
        );
      })}
    </svg>
  );
}

export const hintFor = (lv, path, done, showing, hints = true) => {
  if (showing) return 'Đây là một lời giải';
  if (done) return 'Tuyệt vời!';
  if (!path.length) {
    if (lv.end != null) return 'Đi từ điểm phát sáng, kết thúc ở điểm có vòng tròn';
    return lv.start != null ? 'Bắt đầu từ điểm phát sáng' : 'Chạm vào một điểm bất kỳ để bắt đầu vẽ';
  }
  const head = path[path.length - 1];
  const inPath = new Set(path);
  const canMove = [...Array(lv.cols * lv.rows).keys()].some((i) => !lv.blocked[i] && !inPath.has(i) && adjacent(lv, i, head)
    && !(i === lv.end && path.length + 1 < lv.free));
  if (!canMove) return 'Hết đường! Chạm lại điểm cũ để quay lui';
  return hints ? 'Chạm điểm phát sáng để tiếp tục vẽ' : 'Đi tiếp sang điểm kề bên';
};
