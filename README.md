# One Line Drawing

Game vẽ một nét: 100 màn khó dần, tài khoản đăng nhập, lưu tiến trình, bảng xếp hạng.

```
idea/
├── backend/                 API (Node.js 20.12+, MongoDB)
│   ├── server.js            định tuyến API, CORS, phục vụ frontend (tuỳ chọn)
│   ├── lib/auth.js          băm mật khẩu, phiên đăng nhập, chống dò mật khẩu
│   ├── lib/store.js         đọc/ghi MongoDB (collection users, sessions)
│   ├── package.json
│   ├── .env                 chuỗi kết nối MongoDB, KHÔNG đưa lên git (đã có trong .gitignore)
│   └── .env.example         mẫu cho .env
└── frontend/                trang game, HTML/CSS/JS thuần, không cần build
    ├── index.html
    ├── css/style.css
    └── js/
        ├── config.js        địa chỉ backend (API_BASE)
        ├── levels.js        tạo màn chơi, độ khó
        ├── game.js          bảng chơi, thao tác vẽ, đồng hồ
        ├── sync.js          đăng nhập, lưu tiến trình, bảng xếp hạng
        └── main.js          khởi động game
```

## Database (MongoDB)

Chuỗi kết nối nằm trong `backend/.env`:

```
MONGODB_URI=mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/connect-line
```

Tên database lấy từ đường dẫn trong chuỗi (`connect-line`). Khi chạy lần đầu, backend tự tạo:

| Collection | Nội dung | Index |
|---|---|---|
| `users` | `_id`, `username`, `usernameLower`, `passwordHash`, `createdAt`, `updatedAt`, `progress {unlocked, level, best}`, `stats {solved, totalTime}` | `usernameLower` (unique), `stats.solved` + `stats.totalTime` cho bảng xếp hạng |
| `sessions` | `_id` (mã băm token), `userId`, `expiresAt`, `createdAt` | TTL trên `expiresAt` (MongoDB tự xoá phiên hết hạn), `userId` |

Tiến trình được gộp ngay trên database bằng `$max` (màn mở cao nhất) và `$min` (thời gian nhanh nhất từng màn), nên hai máy lưu cùng lúc không đè mất nhau.

Trên MongoDB Atlas, vào **Network Access** và thêm IP của máy chạy backend (hoặc `0.0.0.0/0` khi thử nghiệm), nếu không sẽ báo lỗi không kết nối được.

## Chạy nhanh (một lệnh)

```bash
cd backend
npm install      # lần đầu
npm start
```

Mở http://localhost:3000. Backend tự phục vụ luôn thư mục `frontend`.

## Chạy tách riêng

```bash
# cửa sổ 1: backend
cd backend
npm install && npm start                        # API ở http://localhost:3000/api

# cửa sổ 2: frontend, dùng bất kỳ server tĩnh nào, ví dụ:
npx serve frontend -l 5500       # hoặc Live Server của VS Code (cổng 5500)
```

Mở http://localhost:5500. Lưu ý dùng `localhost` cho cả hai, đừng trộn `localhost` với `127.0.0.1`, nếu không cookie đăng nhập sẽ không được gửi.

Frontend chạy ở cổng khác thì thêm cổng đó vào `ALLOWED_ORIGINS` của backend (mặc định đã có 3000, 5500, 5173, 8080).

## Đưa lên mạng

- `frontend/js/config.js`: đổi `API_BASE` thành địa chỉ API, ví dụ `https://api.tenmien.com`.
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
| POST | `/api/auth/register` | | `{username, password, progress?}`: tạo tài khoản, đăng nhập luôn |
| POST | `/api/auth/login` | | `{username, password, progress?}` |
| POST | `/api/auth/logout` | | Xoá phiên |
| GET | `/api/me` | ✓ | Tài khoản + tiến trình |
| PUT | `/api/progress` | ✓ | `{progress: {unlocked, level, best}}` |
| GET | `/api/leaderboard` | | Top 20: số màn đã qua, tổng thời gian kỷ lục |

Frontend gọi API với `credentials: 'include'` để gửi cookie đăng nhập.

## Mở rộng (shop, bảng xếp hạng…)

- Thêm trường cho người dùng (ví dụ `coins`, `inventory`) và hàm đọc/ghi tương ứng trong `backend/lib/store.js`, viết route mới trong `routes` của `backend/server.js`, dùng `currentSession(req)` để biết ai đang gọi.
- Mua bán bằng tiền ảo nên dùng cập nhật có điều kiện, ví dụ `updateOne({_id, coins: {$gte: gia}}, {$inc: {coins: -gia}, $push: {inventory: item}})`, để không bị trừ tiền âm khi bấm mua nhiều lần cùng lúc.
- Chưa có: quên mật khẩu, đổi mật khẩu, đăng nhập Google/Facebook.
