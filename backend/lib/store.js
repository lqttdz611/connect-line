// Lớp lưu dữ liệu bằng MongoDB.
//   users:    tài khoản + tiến trình + thống kê cho bảng xếp hạng
//   sessions: phiên đăng nhập, MongoDB tự xoá khi hết hạn (TTL index)
const { MongoClient } = require('mongodb');

const statsOf = progress => {
  const times = Object.values(progress.best || {});
  return { solved: times.length, totalTime: times.reduce((a, b) => a + b, 0) };
};

async function createStore(uri, dbName) {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000, appName: 'connect-line' });
  await client.connect();
  const db = client.db(dbName || undefined);          // mặc định: tên database trong chuỗi kết nối
  const users = db.collection('users');
  const sessions = db.collection('sessions');

  await Promise.all([
    users.createIndex({ usernameLower: 1 }, { unique: true }),
    users.createIndex({ 'stats.solved': -1, 'stats.totalTime': 1 }),
    sessions.createIndex({ userId: 1 }),
    // phiên hết hạn tự bị xoá; nếu database không hỗ trợ TTL thì getSession vẫn bỏ qua phiên hết hạn
    sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
      .catch(e => console.warn('Không tạo được TTL index cho sessions:', e.message)),
  ]);

  return {
    dbName: db.databaseName,

    // ---- người dùng ----
    findUserByName: username => users.findOne({ usernameLower: username.toLowerCase() }),
    getUser: id => users.findOne({ _id: id }),

    /** Tạo tài khoản. Trả về null nếu tên đã có người dùng. */
    async createUser(user) {
      const doc = { ...user, stats: statsOf(user.progress) };
      try { await users.insertOne(doc); } catch (e) { if (e.code === 11000) return null; throw e; }
      return doc;
    },

    /**
     * Gộp tiến trình mới vào tài khoản, ngay trên database nên hai máy lưu cùng lúc không đè mất nhau:
     * màn mở cao nhất ($max), thời gian nhanh nhất từng màn ($min).
     * keepLevel: giữ màn đang chơi của tài khoản (dùng khi đăng nhập kèm tiến trình chơi thử).
     */
    async mergeProgress(id, incoming, { keepLevel = false } = {}) {
      const update = {
        $max: { 'progress.unlocked': incoming.unlocked },
        $set: { updatedAt: new Date() },
      };
      const mins = {};
      for (const [L, t] of Object.entries(incoming.best)) mins[`progress.best.${L}`] = t;
      if (Object.keys(mins).length) update.$min = mins;
      if (!keepLevel) update.$set['progress.level'] = incoming.level;
      const user = await users.findOneAndUpdate({ _id: id }, update, { returnDocument: 'after' });
      if (!user) return null;
      user.stats = statsOf(user.progress);
      await users.updateOne({ _id: id }, { $set: { stats: user.stats } });
      return user;
    },

    leaderboard: (limit = 20) => users
      .find({ 'stats.solved': { $gt: 0 } }, { projection: { username: 1, stats: 1 } })
      .sort({ 'stats.solved': -1, 'stats.totalTime': 1 })
      .limit(limit)
      .toArray(),

    // ---- phiên đăng nhập (chỉ lưu mã băm của token) ----
    getSession: tokenHash => sessions.findOne({ _id: tokenHash, expiresAt: { $gt: new Date() } }),
    createSession: (tokenHash, { userId, expiresAt }) => sessions.insertOne({ _id: tokenHash, userId, expiresAt, createdAt: new Date() }),
    deleteSession: tokenHash => sessions.deleteOne({ _id: tokenHash }),

    close: () => client.close(),
  };
}

module.exports = { createStore };
