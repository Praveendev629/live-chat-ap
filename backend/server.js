
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// ─── Socket.io ────────────────────────────────────────────────
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
});

// ─── Middleware ───────────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Uploads folder
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

// ─── MongoDB ──────────────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => { console.error('❌ MongoDB error:', err); process.exit(1); });

// ─── Models ───────────────────────────────────────────────────
const userSchema = new mongoose.Schema({
  name:      { type: String, required: true },
  role:      { type: String, enum: ['admin', 'student'], default: 'student' },
  online:    { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});
const User = mongoose.model('User', userSchema);

const messageSchema = new mongoose.Schema({
  senderId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  message:    { type: String, default: '' },
  fileUrl:    { type: String, default: null },
  fileType:   { type: String, default: null },
  fileName:   { type: String, default: null },
  timestamp:  { type: Date, default: Date.now },
  read:       { type: Boolean, default: false },
});
const Message = mongoose.model('Message', messageSchema);

// ─── Multer ───────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename:    (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, Date.now() + '-' + safe);
  }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// ─── Online tracking ──────────────────────────────────────────
const onlineUsers = new Map(); // userId -> socketId

async function getAdmin() {
  let admin = await User.findOne({ role: 'admin' });
  if (!admin) {
    admin = await User.create({ name: 'Admin', role: 'admin', online: false });
    console.log('Admin created:', admin._id);
  }
  return admin;
}

// ─── Socket.io ────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('🔌 Socket connected:', socket.id);

  socket.on('join', async (userId) => {
    try {
      if (!userId) return;
      onlineUsers.set(String(userId), socket.id);
      socket.userId = String(userId);
      await User.findByIdAndUpdate(userId, { online: true });
      io.emit('userOnline', { userId: String(userId), online: true });
      // send current online list
      socket.emit('onlineUsers', Array.from(onlineUsers.keys()));
      console.log(`User ${userId} joined`);
    } catch(e){ console.error('join error', e); }
  });

  socket.on('sendMessage', async (data) => {
    try {
      const { senderId, receiverId, message, fileUrl, fileType, fileName } = data;
      if (!senderId || !receiverId) return;
      if (!message && !fileUrl) return; // empty message guard

      const msg = await Message.create({ senderId, receiverId, message: message || '', fileUrl, fileType, fileName });
      const populated = await Message.findById(msg._id)
        .populate('senderId', 'name role')
        .populate('receiverId', 'name role');

      // Emit to receiver
      const receiverSocket = onlineUsers.get(String(receiverId));
      if (receiverSocket) io.to(receiverSocket).emit('newMessage', populated);

      // Emit back to sender (confirmation)
      socket.emit('newMessage', populated);

      // Update unread count and notify admin
      const admin = await getAdmin();
      const unreadCount = await Message.countDocuments({
        senderId, receiverId: admin._id, read: false
      });
      const adminSocket = onlineUsers.get(String(admin._id));
      if (adminSocket) {
        io.to(adminSocket).emit('unreadUpdate', { studentId: senderId, count: unreadCount });
      }
    } catch(e){ console.error('sendMessage error', e); }
  });

  socket.on('typing', (data) => {
    const recvSocket = onlineUsers.get(String(data.receiverId));
    if (recvSocket) io.to(recvSocket).emit('typing', { senderId: data.senderId, typing: data.typing });
  });

  socket.on('markRead', async (data) => {
    try {
      const { studentId, adminId } = data;
      await Message.updateMany(
        { senderId: studentId, receiverId: adminId, read: false },
        { $set: { read: true } }
      );
      // Notify admin unread is now 0
      const adminSocket = onlineUsers.get(String(adminId));
      if (adminSocket) io.to(adminSocket).emit('unreadUpdate', { studentId, count: 0 });
    } catch(e){ console.error('markRead error', e); }
  });

  socket.on('disconnect', async () => {
    if (socket.userId) {
      onlineUsers.delete(socket.userId);
      try {
        await User.findByIdAndUpdate(socket.userId, { online: false });
        io.emit('userOnline', { userId: socket.userId, online: false });
        console.log(`User ${socket.userId} disconnected`);
      } catch(e){}
    }
  });
});

// ─── REST APIs ────────────────────────────────────────────────

app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// Get or create admin
app.get('/api/admin', async (req, res) => {
  try {
    const admin = await getAdmin();
    res.json(admin);
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// Create student
app.post('/api/create-student', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });
    const student = await User.create({ name: name.trim(), role: 'student' });
    res.json({ userId: student._id, name: student.name });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// Get all students
app.get('/api/students', async (req, res) => {
  try {
    const admin = await getAdmin();
    const students = await User.find({ role: 'student' }).sort({ createdAt: -1 });
    const result = await Promise.all(students.map(async (s) => {
      const unreadCount = await Message.countDocuments({
        senderId: s._id, receiverId: admin._id, read: false
      });
      const lastMsg = await Message.findOne({
        $or: [
          { senderId: s._id, receiverId: admin._id },
          { senderId: admin._id, receiverId: s._id }
        ]
      }).sort({ timestamp: -1 });
      return {
        ...s.toObject(),
        unreadCount,
        lastMessage: lastMsg ? lastMsg.message || (lastMsg.fileName ? `📎 ${lastMsg.fileName}` : '') : '',
        lastMessageTime: lastMsg ? lastMsg.timestamp : s.createdAt,
      };
    }));
    res.json(result);
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// Get messages between admin and student
app.get('/api/messages/:userId', async (req, res) => {
  try {
    const admin = await getAdmin();
    const { userId } = req.params;
    const messages = await Message.find({
      $or: [
        { senderId: userId, receiverId: admin._id },
        { senderId: admin._id, receiverId: userId }
      ]
    })
    .populate('senderId', 'name role')
    .populate('receiverId', 'name role')
    .sort({ timestamp: 1 });
    res.json(messages);
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// Upload file
app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;
    const fileUrl = `${backendUrl}/uploads/${req.file.filename}`;
    res.json({ fileUrl, fileName: req.file.originalname, fileType: req.file.mimetype });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// ─── Start ────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server running on port ${PORT}`));
