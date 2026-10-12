# One Line Drawing

Game vẽ một nét: 3 chế độ chơi, mỗi chế độ 100 màn khó dần, tài khoản đăng nhập, lưu tiến trình, bảng xếp hạng.

| Chế độ | Cỡ bảng | Ô chặn | Luật thêm |
|---|---|---|---|
| Dễ | 3×3 → 7×8 | tới ~16% số ô | chọn điểm bắt đầu tuỳ ý |
| Trung bình | 5×5 → 7×8 | tới ~20% số ô | phải bắt đầu từ điểm phát sáng |
| Khó | 7×6 → 9×9 | ~20–22% số ô | 100 màn sinh sẵn bằng `shared/gen-hard-levels.mjs`: không có ô ngõ cụt (lộ điểm đầu), chỉ giữ cách xếp có ít đường giải nhất, không gợi ý điểm đi tiếp |

Thông số mỗi chế độ nằm trong `MODES` ở `shared/levels.js`. Mỗi chế độ có tiến trình và bảng xếp hạng riêng.

## Server kiểm tra kết quả

Trình duyệt không tự báo "đã qua màn". Mỗi lượt chơi:

1. Người chơi chạm điểm đầu tiên: frontend gọi `POST /api/rounds`, server ghi giờ bắt đầu (người đã đăng nhập chỉ được chơi màn đã mở).
2. Vẽ xong: frontend gửi cả đường vẽ lên `POST /api/rounds/finish`. Server dựng lại màn bằng chính code trong `shared/levels.js`, kiểm tra đường vẽ đi qua đủ mọi ô, không đi vào ô chặn, mỗi bước sang ô kề bên, đúng điểm bắt đầu. Thời gian do server tự tính; nhanh hơn 0,08 giây mỗi ô thì bị từ chối. Mỗi lượt chỉ nộp được một lần.
3. Đã đăng nhập: server ghi thẳng vào tài khoản. Chơi thử: server trả về một chứng nhận có chữ ký (HMAC với `GAME_SECRET`); khi đăng ký / đăng nhập, frontend gửi các chứng nhận này lên để gộp vào tài khoản (theo thứ tự màn, chứng nhận giả hoặc hết hạn 30 ngày bị bỏ qua).

Lời giải màn Khó chỉ nằm ở `backend/data/hardSolutions.json`, không có trong bản build gửi xuống trình duyệt; khi người chơi bấm Bỏ cuộc, frontend hỏi `GET /api/solution`.

Chơi khi không kết nối được server vẫn được, nhưng các màn qua lúc đó chỉ lưu trên máy, không tính vào tài khoản.

```
idea/
├── shared/                  code dùng chung cho frontend và backend
│   ├── levels.js            sinh màn, độ khó, kiểm tra đường vẽ (checkPath)
│   ├── hardLevels.js        100 màn Khó sinh sẵn (không kèm lời giải)
│   └── gen-hard-levels.mjs  sinh lại màn Khó: node shared/gen-hard-levels.mjs [giây mỗi màn]
├── backend/                 API (Node.js 20.12+, MongoDB)
│   ├── server.js            định tuyến API, CORS, phục vụ bản build frontend
│   ├── lib/auth.js          băm mật khẩu, phiên đăng nhập, chống dò mật khẩu
│   ├── lib/game.js          kiểm tra đường vẽ, lời giải, chứng nhận qua màn cho khách
│   ├── lib/store.js         đọc/ghi MongoDB (collection users, sessions, rounds)
│   ├── data/hardSolutions.json  lời giải màn Khó (chỉ server giữ)
│   ├── package.json
│   ├── .env                 chuỗi kết nối MongoDB, KHÔNG đưa lên git (đã có trong .gitignore)
│   └── .env.example         mẫu cho .env
└── frontend/                React 18 + Vite
    ├── index.html
    ├── vite.config.js       dev server cổng 5173, chuyển /api sang backend
    └── src/
        ├── main.jsx, App.jsx           khởi động, ghép các phần
        ├── styles.css
        ├── api/client.js               gọi API backend
        ├── context/AuthContext.jsx     trạng thái đăng nhập
        ├── context/ProgressContext.jsx tiến trình, tự lưu lên server
        ├── game/levels.js              lấy lại từ shared/levels.js
        ├── game/useRound.js            luật đi nét (reducer)
        ├── game/useClock.js            đồng hồ
        └── components/                 Board, PlayerCard, GameRound, AuthDialog, Leaderboard…
```

## Database (MongoDB)

Chuỗi kết nối nằm trong `backend/.env`:

```
MONGODB_URI=mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/connect-line
```

Tên database lấy từ đường dẫn trong chuỗi (`connect-line`). Khi chạy lần đầu, backend tự tạo:

| Collection | Nội dung | Index |
|---|---|---|
| `users` | `_id`, `username`, `usernameLower`, `passwordHash`, `createdAt`, `updatedAt`, `progress {easy, medium, hard}` (mỗi chế độ `{unlocked, level, best}`), `stats {easy, medium, hard}` (mỗi chế độ `{solved, totalTime}`) | `usernameLower` (unique), mỗi chế độ một index `stats.<chế độ>.solved` + `totalTime` cho bảng xếp hạng |
| `sessions` | `_id` (mã băm token), `userId`, `expiresAt`, `createdAt` | TTL trên `expiresAt` (MongoDB tự xoá phiên hết hạn), `userId` |
| `rounds` | `_id` (mã lượt chơi), `userId` (null nếu chơi thử), `mode`, `level`, `startedAt`, `expiresAt` | TTL trên `expiresAt` (lượt bỏ dở tự xoá sau 6 giờ) |

Khi backend khởi động, tiến trình đã lưu từ các bản trước được tự chuyển theo cách chia chế độ hiện tại (trường `progressVersion` trong `users`).

Kết quả qua màn được ghi ngay trên database bằng `$max` (màn mở cao nhất) và `$min` (thời gian nhanh nhất từng màn), nên hai máy chơi cùng lúc không đè mất nhau.

Nên đặt thêm `GAME_SECRET` (chuỗi ngẫu nhiên) trong `backend/.env`. Không đặt thì server tự tạo mỗi lần khởi động, và chứng nhận qua màn của khách chưa kịp đăng nhập sẽ mất hiệu lực sau khi khởi động lại.

Trên MongoDB Atlas, vào **Network Access** và thêm IP của máy chạy backend (hoặc `0.0.0.0/0` khi thử nghiệm), nếu không sẽ báo lỗi không kết nối được.

## Chạy khi phát triển

```bash
# cửa sổ 1: backend
cd backend
npm install      # lần đầu
npm start        # API ở http://localhost:3000/api

# cửa sổ 2: frontend
cd frontend
npm install      # lần đầu
npm run dev      # mở http://localhost:5173
```

Vite tự chuyển mọi request `/api` sang backend (xem `vite.config.js`), nên không cần cấu hình CORS hay địa chỉ API khi phát triển. Sửa code React là trang tự cập nhật.

## Chạy bản hoàn chỉnh (một server)

```bash
cd frontend && npm run build     # tạo frontend/dist
cd ../backend && npm start       # mở http://localhost:3000
```

Backend tự phục vụ `frontend/dist`, nên chỉ cần đưa một server lên mạng. Khi đưa lên, nhớ mang theo cả thư mục `shared/` cạnh `backend/` (backend đọc `../shared/levels.js`).

## Đưa lên mạng

- Nếu backend phục vụ luôn frontend (cách trên) thì không cần cấu hình gì thêm cho frontend.
- Nếu đưa frontend lên chỗ khác (Vercel, Netlify…): tạo `frontend/.env` với `VITE_API_BASE=https://api.tenmien.com` trước khi `npm run build`.
- Backend (biến môi trường):
  - `ALLOWED_ORIGINS=https://tenmien.com`
  - `COOKIE_SECURE=1` (bắt buộc khi chạy HTTPS)
  - `COOKIE_SAMESITE=None`: chỉ cần khi frontend và backend ở hai tên miền khác hẳn nhau. Nếu là `tenmien.com` và `api.tenmien.com` thì không cần.
- Đặt backend sau nginx/Caddy có HTTPS.

Trên Windows PowerShell, đặt biến môi trường như sau: `$env:PORT=4000; npm start`

## API

| Phương thức | Đường dẫn | Cần đăng nhập | Mô tả |
|---|---|---|---|
| GET | `/api/health` | | Kiểm tra server |
| POST | `/api/auth/register` | | `{username, password, receipts?, levels?}`: tạo tài khoản, đăng nhập luôn. `receipts`: chứng nhận qua màn lúc chơi thử, `levels`: `{easy?, medium?, hard?}` màn đang chơi |
| POST | `/api/auth/login` | | `{username, password, receipts?}` |
| POST | `/api/auth/logout` | | Xoá phiên |
| GET | `/api/me` | ✓ | Tài khoản + tiến trình |
| PUT | `/api/progress` | ✓ | `{mode, level}`: đổi màn đang chơi (chỉ màn đã mở). `mode` là `easy`, `medium` hoặc `hard` |
| POST | `/api/rounds` | | `{mode, level}` → `{roundId}`: bắt đầu lượt chơi, server ghi giờ |
| POST | `/api/rounds/finish` | | `{roundId, path}`: nộp đường vẽ. Hợp lệ thì trả `{time, progress}` (đã đăng nhập) hoặc `{time, receipt}` (chơi thử); sai trả 422 |
| GET | `/api/solution?mode=hard&level=1` | | Lời giải một màn (khi bỏ cuộc) |
| GET | `/api/leaderboard?mode=medium` | | Top 20 của một chế độ: số màn đã qua, tổng thời gian kỷ lục |

Frontend gọi API trong `src/api/client.js`, với `credentials: 'include'` để gửi cookie đăng nhập.

## Mở rộng (shop, bảng xếp hạng…)

- Thêm trường cho người dùng (ví dụ `coins`, `inventory`) và hàm đọc/ghi tương ứng trong `backend/lib/store.js`, viết route mới trong `routes` của `backend/server.js`, dùng `currentSession(req)` để biết ai đang gọi.
- Mua bán bằng tiền ảo nên dùng cập nhật có điều kiện, ví dụ `updateOne({_id, coins: {$gte: gia}}, {$inc: {coins: -gia}, $push: {inventory: item}})`, để không bị trừ tiền âm khi bấm mua nhiều lần cùng lúc.
- Chưa có: quên mật khẩu, đổi mật khẩu, đăng nhập Google/Facebook.
