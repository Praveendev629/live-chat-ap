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
  cors: { origin: '*', methods: ['GET', 'POST', 'DELETE'] },
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
if (!process.env.MONGODB_URI) {
  console.error('❌ MONGODB_URI is not defined in environment variables');
  process.exit(1);
}

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
  deleted:        { type: Boolean, default: false },
  deletedBySender:   { type: Boolean, default: false },
  deletedByReceiver: { type: Boolean, default: false },
  deletedForEveryone:{ type: Boolean, default: false },
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
const onlineUsers = new Map();

async function getAdmin() {
  let admin = await User.findOne({ role: 'admin' });
  if (!admin) {
    admin = await User.create({ name: 'Admin', role: 'admin', online: false });
    console.log('Admin created:', admin._id);
  }
  return admin;
}

function emitToUser(userId, event, data) {
  const socketId = onlineUsers.get(String(userId));
  if (socketId) io.to(socketId).emit(event, data);
}

// ─── Helper to get full file URL ──────────────────────────────
function getFullFileUrl(filename) {
  const baseUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;
<<<<<<< HEAD
=======
  // Remove trailing slash if present
>>>>>>> 0c02fa80f594a5a28ef0eba8bbfbc021688f4b96
  const cleanBaseUrl = baseUrl.replace(/\/$/, '');
  return `${cleanBaseUrl}/uploads/${filename}`;
}

// ─── Socket.io Events ─────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('🔌 Socket connected:', socket.id);

  socket.on('join', async (userId) => {
    try {
      if (!userId) return;
      onlineUsers.set(String(userId), socket.id);
      socket.userId = String(userId);
      await User.findByIdAndUpdate(userId, { online: true });
      io.emit('userOnline', { userId: String(userId), online: true });
      socket.emit('onlineUsers', Array.from(onlineUsers.keys()));
      console.log(`User ${userId} joined`);
    } catch(e){ console.error('join error', e); }
  });

  socket.on('sendMessage', async (data) => {
    try {
      const { senderId, receiverId, message, fileUrl, fileType, fileName } = data;
      if (!senderId || !receiverId) return;
      if (!message && !fileUrl) return;

      const msg = await Message.create({
        senderId, receiverId,
        message: message || '',
        fileUrl, fileType, fileName,
      });
      const populated = await Message.findById(msg._id)
        .populate('senderId', 'name role')
        .populate('receiverId', 'name role');

      emitToUser(receiverId, 'newMessage', populated);
      socket.emit('newMessage', populated);

      const admin = await getAdmin();
      const unreadCount = await Message.countDocuments({
        senderId, receiverId: admin._id, read: false
      });
      emitToUser(admin._id, 'unreadUpdate', { studentId: senderId, count: unreadCount });
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
      emitToUser(adminId, 'unreadUpdate', { studentId, count: 0 });
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

<<<<<<< HEAD
app.get('/', (req, res) => res.json({ status: 'Chat server running', time: new Date() }));
=======
app.get('/', (req, res) => res.json({ status: 'Chat server running 🚀', time: new Date() }));
>>>>>>> 0c02fa80f594a5a28ef0eba8bbfbc021688f4b96

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
        lastMessage: lastMsg
          ? lastMsg.deletedForEveryone
<<<<<<< HEAD
            ? 'Message deleted'
            : lastMsg.message || (lastMsg.fileName ? `File: ${lastMsg.fileName}` : '')
=======
            ? '🚫 Message deleted'
            : lastMsg.message || (lastMsg.fileName ? `📎 ${lastMsg.fileName}` : '')
>>>>>>> 0c02fa80f594a5a28ef0eba8bbfbc021688f4b96
          : '',
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
    const { requesterId } = req.query;

    const messages = await Message.find({
      $or: [
        { senderId: userId, receiverId: admin._id },
        { senderId: admin._id, receiverId: userId }
      ]
    })
    .populate('senderId', 'name role')
    .populate('receiverId', 'name role')
    .sort({ timestamp: 1 });

    const filtered = messages.filter(msg => {
      if (!requesterId) return true;
      const senderId = msg.senderId?._id?.toString() || msg.senderId?.toString();
      const isSender = senderId === requesterId;
      if (isSender && msg.deletedBySender) return false;
      if (!isSender && msg.deletedByReceiver) return false;
      if (msg.deletedForEveryone) return false;
      return true;
    });

    res.json(filtered);
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// Upload file - FIXED VERSION
app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    
<<<<<<< HEAD
    const filename = req.file.filename;
=======
    // Get the filename
    const filename = req.file.filename;
    
    // Create full URL using helper function
>>>>>>> 0c02fa80f594a5a28ef0eba8bbfbc021688f4b96
    const fileUrl = getFullFileUrl(filename);
    
    console.log('File uploaded:', {
      originalName: req.file.originalname,
      filename: filename,
      url: fileUrl
    });
    
    res.json({ 
      fileUrl, 
      fileName: req.file.originalname, 
      fileType: req.file.mimetype 
    });
  } catch(e){ 
    console.error('Upload error:', e);
    res.status(500).json({ error: e.message }); 
  }
});

// Delete single message
app.delete('/api/message/:messageId', async (req, res) => {
  try {
    const { messageId } = req.params;
    const { deleteType, requesterId } = req.body;
    
    if (!requesterId) {
      return res.status(400).json({ error: 'requesterId is required' });
    }

    const msg = await Message.findById(messageId);
    if (!msg) return res.status(404).json({ error: 'Message not found' });

    const senderId   = msg.senderId.toString();
    const receiverId = msg.receiverId.toString();
    const isSender   = senderId === requesterId;

    if (deleteType === 'forEveryone') {
      await Message.findByIdAndUpdate(messageId, {
        $set: {
          deletedForEveryone: true,
          deleted: true,
          message: '',
          fileUrl: null,
          fileType: null,
          fileName: null,
        }
      });

      const updated = await Message.findById(messageId)
        .populate('senderId', 'name role')
        .populate('receiverId', 'name role');

      emitToUser(senderId,   'messageDeleted', { messageId, deleteType: 'forEveryone', message: updated });
      emitToUser(receiverId, 'messageDeleted', { messageId, deleteType: 'forEveryone', message: updated });

    } else {
      const updateField = isSender ? { deletedBySender: true } : { deletedByReceiver: true };
      await Message.findByIdAndUpdate(messageId, { $set: updateField });
      emitToUser(requesterId, 'messageDeleted', { messageId, deleteType: 'forMe' });
    }

    res.json({ success: true });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

// Delete entire chat
app.delete('/api/chat/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    const { deleteType, requesterId } = req.body;
    
    if (!requesterId) {
      return res.status(400).json({ error: 'requesterId is required' });
    }

    const admin = await getAdmin();
    const adminId = admin._id.toString();

    if (deleteType === 'forEveryone') {
      await Message.updateMany(
        {
          $or: [
            { senderId: studentId, receiverId: adminId },
            { senderId: adminId,   receiverId: studentId }
          ]
        },
        {
          $set: {
            deletedForEveryone: true,
            deleted: true,
            message: '',
            fileUrl: null,
            fileType: null,
            fileName: null,
          }
        }
      );

      emitToUser(studentId, 'chatCleared', { studentId, deleteType: 'forEveryone' });
      emitToUser(adminId,   'chatCleared', { studentId, deleteType: 'forEveryone' });

    } else {
      const isSender = requesterId === adminId;
      const updateField = isSender ? { deletedBySender: true } : { deletedByReceiver: true };
      await Message.updateMany(
        {
          $or: [
            { senderId: studentId, receiverId: adminId },
            { senderId: adminId,   receiverId: studentId }
          ]
        },
        { $set: updateField }
      );

      emitToUser(requesterId, 'chatCleared', { studentId, deleteType: 'forMe' });
    }

    res.json({ success: true });
  } catch(e){ res.status(500).json({ error: e.message }); }
});

<<<<<<< HEAD
// Delete student entirely
=======
// Delete student entirely - FIXED VERSION
>>>>>>> 0c02fa80f594a5a28ef0eba8bbfbc021688f4b96
app.delete('/api/student/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    const admin = await getAdmin();

<<<<<<< HEAD
=======
    // First check if student exists
>>>>>>> 0c02fa80f594a5a28ef0eba8bbfbc021688f4b96
    const student = await User.findById(studentId);
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

<<<<<<< HEAD
    await User.findByIdAndDelete(studentId);
=======
    // Delete the student user
    await User.findByIdAndDelete(studentId);

    // Delete ALL their messages permanently
>>>>>>> 0c02fa80f594a5a28ef0eba8bbfbc021688f4b96
    await Message.deleteMany({
      $or: [
        { senderId: studentId },
        { receiverId: studentId }
      ]
    });

<<<<<<< HEAD
    emitToUser(studentId, 'studentDeleted', { message: 'Your account has been removed.' });
=======
    // If student is online, force disconnect them
    emitToUser(studentId, 'studentDeleted', { message: 'Your account has been removed.' });

    // Notify admin list to refresh
>>>>>>> 0c02fa80f594a5a28ef0eba8bbfbc021688f4b96
    emitToUser(admin._id, 'studentRemoved', { studentId });

    console.log(`Student ${student.name} (${studentId}) deleted successfully`);
    res.json({ success: true, message: 'Student deleted successfully' });
  } catch(e){ 
    console.error('Error deleting student:', e);
    res.status(500).json({ error: e.message }); 
  }
});

<<<<<<< HEAD
=======
// ─── Start ────────────────────────────────────────────────────
>>>>>>> 0c02fa80f594a5a28ef0eba8bbfbc021688f4b96
const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));