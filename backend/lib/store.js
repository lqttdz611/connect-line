// Lớp lưu dữ liệu bằng MongoDB.
//   users:    tài khoản + tiến trình + thống kê cho bảng xếp hạng, tách theo chế độ chơi
//             progress: { easy: {unlocked, level, best}, medium: {...}, hard: {...} }
//             stats:    { easy: {solved, totalTime}, medium: {...}, hard: {...} }
//   sessions: phiên đăng nhập, MongoDB tự xoá khi hết hạn (TTL index)
//   rounds:   lượt chơi đang diễn ra (server ghi giờ bắt đầu để tự tính thời gian), tự xoá sau 6 giờ
const { MongoClient } = require('mongodb');

const MODES = ['easy', 'medium', 'hard'];
const PROGRESS_VERSION = 2;

const statsOf = progress => {
  const times = Object.values(progress?.best || {});
  return { solved: times.length, totalTime: times.reduce((a, b) => a + b, 0) };
};
const allStats = progress => Object.fromEntries(MODES.map(m => [m, statsOf(progress[m])]));

async function createStore(uri, dbName) {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000, appName: 'connect-line' });
  await client.connect();
  const db = client.db(dbName || undefined);          // mặc định: tên database trong chuỗi kết nối
  const users = db.collection('users');
  const sessions = db.collection('sessions');
  const rounds = db.collection('rounds');

  // Chuyển dữ liệu cũ sang cách chia chế độ hiện tại (progressVersion 2):
  //   - trước khi có chế độ chơi ({unlocked, level, best}): các màn đó nay là chế độ Dễ
  //   - bản 3 chế độ đầu tiên: Trung bình cũ nay là Dễ, Khó cũ nay là Trung bình (màn giữ nguyên)
  for await (const u of users.find({ progressVersion: { $ne: PROGRESS_VERSION } })) {
    const old = u.progress || {};
    const progress = old.unlocked != null ? { easy: old } : { easy: old.medium, medium: old.hard };
    for (const m of MODES) if (!progress[m]) delete progress[m];
    await users.updateOne({ _id: u._id }, { $set: { progress, stats: allStats(progress), progressVersion: PROGRESS_VERSION } });
  }

  await Promise.all([
    users.createIndex({ usernameLower: 1 }, { unique: true }),
    ...MODES.map(m => users.createIndex({ [`stats.${m}.solved`]: -1, [`stats.${m}.totalTime`]: 1 })),
    sessions.createIndex({ userId: 1 }),
    // phiên / lượt chơi hết hạn tự bị xoá; nếu database không hỗ trợ TTL thì lúc đọc vẫn bỏ qua bản hết hạn
    ...[sessions, rounds].map(c => c.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
      .catch(e => console.warn(`Không tạo được TTL index cho ${c.collectionName}:`, e.message))),
  ]);

  async function refreshStats(id, mode, user) {
    if (!user) return null;
    const stats = statsOf(user.progress[mode]);
    user.stats = { ...user.stats, [mode]: stats };
    await users.updateOne({ _id: id }, { $set: { [`stats.${mode}`]: stats } });
    return user;
  }

  return {
    dbName: db.databaseName,
    MODES,

    // ---- người dùng ----
    findUserByName: username => users.findOne({ usernameLower: username.toLowerCase() }),
    getUser: id => users.findOne({ _id: id }),

    /** Tạo tài khoản. Trả về null nếu tên đã có người dùng. */
    async createUser(user) {
      const doc = { ...user, stats: allStats(user.progress), progressVersion: PROGRESS_VERSION };
      try { await users.insertOne(doc); } catch (e) { if (e.code === 11000) return null; throw e; }
      return doc;
    },

    /**
     * Ghi nhận qua màn (server đã kiểm tra đường vẽ). Cập nhật ngay trên database nên hai máy
     * cùng lúc không đè mất nhau: màn mở cao nhất ($max), thời gian nhanh nhất ($min).
     */
    async recordWin(id, mode, level, time, maxLevel) {
      const p = `progress.${mode}`;
      const user = await users.findOneAndUpdate({ _id: id }, {
        $max: { [`${p}.unlocked`]: Math.min(level + 1, maxLevel), [`${p}.level`]: 1 }, // level: chỉ tạo nếu chưa có
        $min: { [`${p}.best.${level}`]: time },
        $set: { updatedAt: new Date() },
      }, { returnDocument: 'after' });
      return refreshStats(id, mode, user);
    },

    /** Đổi màn đang chơi; chỉ được chọn màn đã mở. Trả về null nếu màn chưa mở. */
    async setLevel(id, mode, level) {
      const p = `progress.${mode}`;
      const filter = level === 1 ? { _id: id } : { _id: id, [`${p}.unlocked`]: { $gte: level } };
      return users.findOneAndUpdate(filter, { $set: { [`${p}.level`]: level } }, { returnDocument: 'after' });
    },

    leaderboard: (mode, limit = 20) => users
      .find({ [`stats.${mode}.solved`]: { $gt: 0 } }, { projection: { username: 1, [`stats.${mode}`]: 1 } })
      .sort({ [`stats.${mode}.solved`]: -1, [`stats.${mode}.totalTime`]: 1 })
      .limit(limit)
      .toArray(),

    // ---- phiên đăng nhập (chỉ lưu mã băm của token) ----
    getSession: tokenHash => sessions.findOne({ _id: tokenHash, expiresAt: { $gt: new Date() } }),
    createSession: (tokenHash, { userId, expiresAt }) => sessions.insertOne({ _id: tokenHash, userId, expiresAt, createdAt: new Date() }),
    deleteSession: tokenHash => sessions.deleteOne({ _id: tokenHash }),

    // ---- lượt chơi ----
    createRound: round => rounds.insertOne(round),
    /** Lấy và xoá lượt chơi (mỗi lượt chỉ nộp được một lần). */
    takeRound: id => rounds.findOneAndDelete({ _id: id, expiresAt: { $gt: new Date() } }),

    close: () => client.close(),
  };
}

module.exports = { createStore, MODES };
