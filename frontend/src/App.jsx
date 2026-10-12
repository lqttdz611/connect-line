import { useCallback, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ProgressProvider, useProgress } from './context/ProgressContext';
import AccountBar from './components/AccountBar';
import AuthDialog from './components/AuthDialog';
import ModePicker from './components/ModePicker';
import GameRound from './components/GameRound';
import HelpPanel from './components/HelpPanel';
import Leaderboard from './components/Leaderboard';

function GameScreen() {
  const auth = useAuth();
  const { mode, setMode, modes, progress, sync, savedAt, setLevel, beginRound, recordWin } = useProgress();
  const [round, setRound] = useState(0); // tăng lên để chơi lại cùng màn
  const [dialogOpen, setDialogOpen] = useState(false);

  const goLevel = useCallback((L) => { setLevel(L); setRound((r) => r + 1); }, [setLevel]);
  const replay = useCallback(() => setRound((r) => r + 1), []);

  const online = auth.status === 'guest' || auth.status === 'user';
  const showDialog = dialogOpen || auth.expired;
  const closeDialog = () => { setDialogOpen(false); auth.clearExpired(); };

  return (
    <div className="app">
      <div>
        <p className="brand">Trò chơi trí tuệ</p>
        <h1>One Line Drawing</h1>
      </div>

      {online && <AccountBar user={auth.user} onLogin={() => setDialogOpen(true)} onLogout={auth.logout} />}

      <ModePicker mode={mode} modes={modes} onChange={setMode} />

      <GameRound
        key={`${mode}-${progress.level}-${round}`}
        mode={mode}
        level={progress.level}
        unlocked={progress.unlocked}
        playerName={auth.user ? auth.user.username : online ? 'Khách' : 'Bạn'}
        syncState={sync}
        syncLabel={auth.status === 'guest' ? 'Chưa đăng nhập · lưu trên máy này' : undefined}
        onStart={beginRound}
        onWin={recordWin}
        onGoLevel={goLevel}
        onReplay={replay}
      />

      <HelpPanel />

      {showDialog && (
        <AuthDialog
          initialMessage={auth.expired ? 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.' : ''}
          onClose={closeDialog}
          onSubmit={async (authMode, username, password) => {
            await auth.signIn(authMode, username, password, Object.fromEntries(Object.entries(modes).map(([m, p]) => [m, p.level])));
            closeDialog();
          }}
        />
      )}

      {online && <Leaderboard mode={mode} refreshKey={`${savedAt}-${auth.user?.username || ''}`} />}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ProgressProvider>
        <GameScreen />
      </ProgressProvider>
    </AuthProvider>
  );
}
