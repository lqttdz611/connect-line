import { useEffect, useRef, useState } from 'react';

/** Hộp đăng nhập / đăng ký. onSubmit(mode, username, password) ném lỗi có message để hiện ra. */
export default function AuthDialog({ initialMessage = '', onSubmit, onClose }) {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError] = useState(initialMessage);
  const [busy, setBusy] = useState(false);
  const userRef = useRef(null);
  const reg = mode === 'register';

  useEffect(() => { userRef.current?.focus(); }, []);

  const switchMode = () => { setMode(reg ? 'login' : 'register'); setError(''); };

  const submit = async (e) => {
    e.preventDefault();
    if (reg && password !== password2) { setError('Hai mật khẩu không khớp.'); return; }
    setBusy(true);
    setError('');
    try {
      await onSubmit(mode, username.trim(), password);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="authwrap" id="auth" role="dialog" aria-modal="true" aria-labelledby="authTitle"
      onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <form className="modal" id="authForm" noValidate onSubmit={submit}>
        <h2 id="authTitle">{reg ? 'Tạo tài khoản' : 'Đăng nhập'}</h2>
        <label className="field">Tên đăng nhập
          <input id="authUser" ref={userRef} name="username" autoComplete="username" required minLength={3} maxLength={20}
            autoCapitalize="off" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label className="field">Mật khẩu
          <input id="authPass" name="password" type="password" autoComplete={reg ? 'new-password' : 'current-password'}
            required minLength={6} maxLength={100} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {reg && (
          <label className="field" id="authPass2Row">Nhập lại mật khẩu
            <input id="authPass2" name="password2" type="password" autoComplete="new-password" required maxLength={100}
              value={password2} onChange={(e) => setPassword2(e.target.value)} />
          </label>
        )}
        {reg && (
          <p className="authhint" id="authHint">
            Tên 3–20 ký tự (chữ không dấu, số, _ và .), mật khẩu từ 6 ký tự. Tiến trình bạn đang chơi thử sẽ được giữ lại.
          </p>
        )}
        <p className="autherr" id="authErr" role="alert">{error}</p>
        <button className="btn primary" id="authSubmit" type="submit" disabled={busy}>{reg ? 'Đăng ký' : 'Đăng nhập'}</button>
        <button className="link" id="authSwitch" type="button" onClick={switchMode}>
          {reg ? 'Đã có tài khoản? Đăng nhập' : 'Chưa có tài khoản? Đăng ký'}
        </button>
        <button className="btn" id="authCancel" type="button" onClick={onClose}>Để sau</button>
      </form>
    </div>
  );
}
