export default function AccountBar({ user, onLogin, onLogout }) {
  return (
    <div className="account" id="account">
      <span id="accText">{user ? `Đã đăng nhập: ${user.username}` : 'Bạn đang chơi thử. Đăng nhập để lưu tiến trình.'}</span>
      <button className="link" id="authBtn" type="button" onClick={user ? onLogout : onLogin}>
        {user ? 'Đăng xuất' : 'Đăng nhập / Đăng ký'}
      </button>
    </div>
  );
}
