import { createServer } from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { pool } from './db.js';

export function attachRealtime(app) {
  const server = createServer(app);
  const io = new Server(server, { cors: { origin: '*' } });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers['x-access-token'];
    if (!token) return next(new Error('unauthorized'));
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      const numericId = Number(payload.id || payload.sub);
      if (!Number.isFinite(numericId)) return next(new Error('unauthorized'));
      socket.data.userId = numericId;
      return next();
    } catch {
      return next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const userId = Number(socket.data.userId);
    if (!Number.isFinite(userId)) {
      socket.disconnect(true);
      return;
    }
    socket.join(`user:${userId}`);

    socket.on('message:send', async ({ toUserId, content }) => {
      if (!toUserId || !content) return;
      // bloqueios
      const [blocks] = await pool.query('SELECT 1 FROM user_blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?) LIMIT 1', [userId, toUserId, toUserId, userId]);
      if (blocks.length) return;
      // Verifica amizade (não-direcional)
      const [friends] = await pool.query(
        'SELECT 1 FROM friendships WHERE user_min = LEAST(?, ?) AND user_max = GREATEST(?, ?) LIMIT 1',
        [userId, toUserId, userId, toUserId]
      );
      if (!friends.length) return;
      const [result] = await pool.query('INSERT INTO messages (sender_id, receiver_id, content) VALUES (?, ?, ?)', [userId, toUserId, content]);
      const [rows] = await pool.query('SELECT * FROM messages WHERE id = ?', [result.insertId]);
      io.to(`user:${toUserId}`).emit('message:new', rows[0]);
      io.to(`user:${userId}`).emit('message:sent', rows[0]);
    });

  socket.on('message:typing', ({ toUserId, typing }) => {
      if (!toUserId) return;
      io.to(`user:${toUserId}`).emit('message:typing', { fromUserId: userId, typing: !!typing });
    });

    socket.on('message:delivered', async ({ messageId }) => {
      if (!messageId) return;
      const [[msg]] = await pool.query('SELECT * FROM messages WHERE id = ?', [messageId]);
      if (!msg) return;
      if (msg.receiver_id !== userId) return;
      await pool.query('UPDATE messages SET delivered_at = IFNULL(delivered_at, NOW()) WHERE id = ?', [messageId]);
      io.to(`user:${msg.sender_id}`).emit('message:delivered', { messageId, by: userId });
    });

    socket.on('message:read', async ({ messageId }) => {
      if (!messageId) return;
      const [[msg]] = await pool.query('SELECT * FROM messages WHERE id = ?', [messageId]);
      if (!msg) return;
      if (msg.receiver_id !== userId) return;
      await pool.query('UPDATE messages SET read_at = NOW() WHERE id = ?', [messageId]);
      io.to(`user:${msg.sender_id}`).emit('message:read', { messageId, by: userId });
      // Também notifica o próprio leitor (para atualizar badges/listas em tempo real)
      io.to(`user:${userId}`).emit('message:read', { messageId, by: userId });
    });

    socket.on('message:edit', async ({ messageId, content }) => {
      if (!messageId || !content) return;
      const [[msg]] = await pool.query('SELECT * FROM messages WHERE id = ?', [messageId]);
      if (!msg || msg.sender_id !== userId) return;
      await pool.query('UPDATE messages SET content = ?, edited_at = NOW() WHERE id = ?', [content, messageId]);
      const peer = msg.receiver_id;
      io.to(`user:${peer}`).emit('message:edited', { id: messageId, content, edited_at: new Date() });
    });

    socket.on('message:delete', async ({ messageId }) => {
      if (!messageId) return;
      const [[msg]] = await pool.query('SELECT * FROM messages WHERE id = ?', [messageId]);
      if (!msg || msg.sender_id !== userId) return;
      await pool.query('UPDATE messages SET deleted_at = NOW() WHERE id = ?', [messageId]);
      io.to(`user:${msg.receiver_id}`).emit('message:deleted', { id: messageId });
    });

    socket.on('message:react', async ({ messageId, emoji }) => {
      if (!messageId || !emoji) return;
      const [[msg]] = await pool.query('SELECT * FROM messages WHERE id = ?', [messageId]);
      if (!msg) return;
      if (![msg.sender_id, msg.receiver_id].includes(userId)) return;
      await pool.query('INSERT IGNORE INTO message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)', [messageId, userId, emoji]);
      const peer = msg.sender_id === userId ? msg.receiver_id : msg.sender_id;
      io.to(`user:${peer}`).emit('message:reacted', { messageId, userId, emoji });
    });

    socket.on('friend:request', async ({ toUserId }) => {
      if (!toUserId || Number(toUserId) === userId) return;
      await pool.query('INSERT IGNORE INTO friend_requests (requester_id, receiver_id) VALUES (?, ?)', [userId, toUserId]);
      io.to(`user:${toUserId}`).emit('friend:request', { fromUserId: userId });
    });

    socket.on('friend:accept', async ({ requesterId }) => {
      if (!requesterId) return;
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await conn.query('UPDATE friend_requests SET status = "accepted" WHERE requester_id = ? AND receiver_id = ?', [requesterId, userId]);
        await conn.query(
          'INSERT IGNORE INTO friendships (user_id, friend_id) VALUES (LEAST(?, ?), GREATEST(?, ?))',
          [userId, requesterId, userId, requesterId]
        );
        await conn.commit();
        io.to(`user:${requesterId}`).emit('friend:accepted', { byUserId: userId });
      } catch (e) {
        await conn.rollback();
      } finally {
        conn.release();
      }
    });

    socket.on('friend:decline', async ({ requesterId }) => {
      if (!requesterId) return;
      await pool.query('UPDATE friend_requests SET status = "declined" WHERE requester_id = ? AND receiver_id = ?', [requesterId, userId]);
      io.to(`user:${requesterId}`).emit('friend:declined', { byUserId: userId });
    });

    // ===== Group conversations (salas) =====
    socket.on('conv:join', async ({ conversationId }) => {
      const convId = Number(conversationId);
      if (!Number.isFinite(convId)) return;
      const [mem] = await pool.query('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ? LIMIT 1', [convId, userId]);
      if (!mem.length) return; // not a member
      socket.join(`conv:${convId}`);
      socket.emit('conv:joined', { conversationId: convId });
      io.to(`conv:${convId}`).emit('conv:user:join', { userId });
    });

    socket.on('conv:leave', ({ conversationId }) => {
      const convId = Number(conversationId);
      if (!Number.isFinite(convId)) return;
      socket.leave(`conv:${convId}`);
      socket.emit('conv:left', { conversationId: convId });
      io.to(`conv:${convId}`).emit('conv:user:leave', { userId });
    });

    socket.on('conv:typing', ({ conversationId, typing }) => {
      const convId = Number(conversationId);
      if (!Number.isFinite(convId)) return;
      socket.to(`conv:${convId}`).emit('conv:typing', { userId, typing: !!typing });
    });

    socket.on('conv:message:send', async ({ conversationId, content, reply_to_id }) => {
      const convId = Number(conversationId);
      if (!Number.isFinite(convId) || !content) return;
      const [mem] = await pool.query('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ? LIMIT 1', [convId, userId]);
      if (!mem.length) return; // not a member
      const [r] = await pool.query('INSERT INTO conversation_messages (conversation_id, sender_id, content, reply_to_id) VALUES (?, ?, ?, ?)', [convId, userId, content, reply_to_id || null]);
      const [[message]] = await pool.query(
        `SELECT cm.*, COALESCE(u.nickname, u.name, u.email) AS sender_name, u.avatar_url AS sender_avatar
           FROM conversation_messages cm
           JOIN users u ON u.id = cm.sender_id
          WHERE cm.id = ?`,
        [r.insertId]
      );
      message.read_by = [];
      io.to(`conv:${convId}`).emit('conv:message:new', message);

      // Notificação (inbox) para membros mesmo fora da sala.
      // Evento separado para evitar duplicar mensagens em quem está com a sala aberta.
      const [members] = await pool.query('SELECT user_id FROM conversation_members WHERE conversation_id = ?', [convId]);
      for (const m of members) {
        const uid = Number(m.user_id);
        if (!Number.isFinite(uid) || uid === userId) continue;
        io.to(`user:${uid}`).emit('conv:message:notify', message);
      }
    });

    socket.on('conv:read', async ({ conversationId, last_read_message_id }) => {
      const convId = Number(conversationId);
      const lastId = Number(last_read_message_id);
      if (!Number.isFinite(convId) || !Number.isFinite(lastId)) return;
      await pool.query('UPDATE conversation_members SET last_read_message_id = ? WHERE conversation_id = ? AND user_id = ?', [lastId, convId, userId]);
      io.to(`conv:${convId}`).emit('conv:read', { conversationId: convId, userId, last_read_message_id: lastId });
    });
  });

  // guardar a referência para uso nos handlers REST
  app.set('io', io);
  return { server, io };
}
