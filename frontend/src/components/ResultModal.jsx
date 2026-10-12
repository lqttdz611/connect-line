import { useEffect, useRef } from 'react';

/** Hộp thông báo nằm đè lên bảng chơi (qua màn, bỏ cuộc). */
export default function ResultModal({ title, text, mainLabel, onMain, altLabel, onAlt }) {
  const mainRef = useRef(null);
  useEffect(() => { mainRef.current?.focus(); }, []);
  return (
    <div className="overlay" id="overlay">
      <div className="modal">
        <h2 id="mTitle">{title}</h2>
        <p id="mText">{text}</p>
        <button className="btn primary" id="mMain" type="button" ref={mainRef} onClick={onMain}>{mainLabel}</button>
        {altLabel && <button className="btn" id="mAlt" type="button" onClick={onAlt}>{altLabel}</button>}
      </div>
    </div>
  );
}
