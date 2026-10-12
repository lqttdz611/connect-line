import { useState } from 'react';

export default function HelpPanel() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="link" id="helpBtn" type="button" onClick={() => setOpen((o) => !o)}>📖 Xem hướng dẫn chơi</button>
      {open && (
        <div className="help" id="help">
          <b>Cách chơi</b>
          <ul>
            <li>Chọn một điểm bất kỳ để bắt đầu, rồi kéo (hoặc chạm) sang điểm kề bên theo chiều ngang hoặc dọc.</li>
            <li>Đi qua <b>tất cả</b> các điểm, mỗi điểm đúng một lần, bằng một nét liền.</li>
            <li>Không đi vào ô có dấu ✕.</li>
            <li>Chạm lại điểm đã đi để quay lui về điểm đó. Kéo ngược lại để xoá bước vừa đi.</li>
            <li>Có 3 chế độ, mỗi chế độ 100 màn và tiến trình riêng: <b>Dễ</b> chọn điểm bắt đầu tuỳ ý; <b>Trung bình</b> bảng lớn hơn, phải bắt đầu từ điểm phát sáng; <b>Khó</b> bảng 7×6 tới 9×9, mỗi màn chỉ có vài cách đi, không có ô nào lộ sẵn điểm bắt đầu và không có gợi ý điểm đi tiếp.</li>
            <li>Càng lên màn cao bảng càng to và có nhiều ô chặn hơn. Màn nào cũng có lời giải.</li>
          </ul>
        </div>
      )}
    </>
  );
}
