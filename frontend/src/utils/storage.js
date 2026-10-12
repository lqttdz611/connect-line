// localStorage có thể bị chặn (chế độ ẩn danh, chặn cookie), nên mọi thao tác đều bọc try/catch.
export const storage = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* bỏ qua */ }
  },
};

// chứng nhận qua màn (server ký) lúc chơi chưa đăng nhập; gửi lên khi đăng nhập / đăng ký
export const RECEIPTS_KEY = 'olg-receipts';
