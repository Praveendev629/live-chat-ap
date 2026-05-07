import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';

const BACKEND = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';

const notifSound = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = 880; gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(); osc.stop(ctx.currentTime + 0.3);
  } catch(e){}
};

export default function ChatWindow({ user, onLogout }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [admin, setAdmin] = useState(null);
  const [adminOnline, setAdminOnline] = useState(false);
  const [typing, setTyping] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const socketRef = useRef(null);
  const bottomRef = useRef(null);
  const typingTimer = useRef(null);
  const fileInputRef = useRef(null);
  const chatContainerRef = useRef(null);

  const scrollBottom = () => bottomRef.current?.scrollIntoView({ behavior: 'smooth' });

  useEffect(() => { scrollBottom(); }, [messages]);

  useEffect(() => {
    axios.get(`${BACKEND}/api/admin`).then(res => {
      setAdmin(res.data);

      axios.get(`${BACKEND}/api/messages/${user.userId}?requesterId=${user.userId}`).then(r => {
        setMessages(r.data);
      });

      const socket = io(BACKEND, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        timeout: 20000,
        forceNew: true,
      });
      socketRef.current = socket;

      socket.on('connect', () => {
        console.log('Socket connected:', socket.id);
        socket.emit('join', user.userId);
      });

      socket.on('newMessage', (msg) => {
        setMessages(prev => {
          const exists = prev.find(m => m._id === msg._id);
          if (exists) return prev;
          if (msg.senderId._id !== user.userId && msg.senderId !== user.userId) {
            notifSound();
          }
          return [...prev, msg];
        });
      });

      socket.on('messageDeleted', ({ messageId, deleteType, message }) => {
        if (deleteType === 'forEveryone') {
          setMessages(prev => prev.map(msg => 
            msg._id === messageId ? { ...msg, ...message, deletedForEveryone: true } : msg
          ));
        } else {
          setMessages(prev => prev.filter(msg => msg._id !== messageId));
        }
      });

      socket.on('typing', (data) => {
        if (data.typing) { setTyping(true); }
        else { setTyping(false); }
      });

      socket.on('onlineUsers', (userIds) => {
        if (res.data && userIds.includes(String(res.data._id))) setAdminOnline(true);
      });

      socket.on('userOnline', (data) => {
        if (res.data && String(data.userId) === String(res.data._id)) {
          setAdminOnline(data.online);
        }
      });

      socket.on('studentDeleted', () => {
        alert('Your account has been deleted by admin.');
        onLogout();
      });

      socket.on('disconnect', () => console.log('Socket disconnected'));
      socket.on('connect_error', (e) => console.error('Socket error:', e.message));
    });

    return () => { socketRef.current?.disconnect(); };
  }, [user.userId]);

  const sendMessage = useCallback((msgText, fileUrl=null, fileType=null, fileName=null) => {
    if (!socketRef.current || !admin) return;
    if (!msgText.trim() && !fileUrl) return;
    socketRef.current.emit('sendMessage', {
      senderId: user.userId,
      receiverId: admin._id,
      message: msgText.trim(),
      fileUrl, fileType, fileName,
    });
    setInput('');
  }, [admin, user.userId]);

  const handleTyping = (val) => {
    setInput(val);
    if (!admin || !socketRef.current) return;
    socketRef.current.emit('typing', { senderId: user.userId, receiverId: admin._id, typing: true });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      socketRef.current?.emit('typing', { senderId: user.userId, receiverId: admin._id, typing: false });
    }, 2000);
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await axios.post(`${BACKEND}/api/upload`, fd);
      sendMessage('', res.data.fileUrl, res.data.fileType, res.data.fileName);
    } catch(err) {
      alert('File upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const deleteMessage = async (deleteType) => {
    if (!selectedMessage) return;
    try {
      await axios.delete(`${BACKEND}/api/message/${selectedMessage._id}`, {
        data: { deleteType: deleteType, requesterId: user.userId }
      });
      setShowContextMenu(false);
      setSelectedMessage(null);
    } catch (error) {
      alert('Failed to delete message');
    }
  };

  const handleContextMenu = (e, message) => {
    e.preventDefault();
    const isMyMessage = (message.senderId?._id || message.senderId) === user.userId;
    if (!isMyMessage) return; // Only allow deleting own messages
    
    setSelectedMessage(message);
    setMenuPosition({ x: e.clientX, y: e.clientY });
    setShowContextMenu(true);
  };

  const handleClickOutside = (e) => {
    if (showContextMenu && !e.target.closest('.context-menu')) {
      setShowContextMenu(false);
      setSelectedMessage(null);
    }
  };

  useEffect(() => {
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showContextMenu]);

  const renderFileMessage = (msg) => {
    if (!msg.fileUrl) return null;
    const isImage = msg.fileType?.startsWith('image/');
    const isVideo = msg.fileType?.startsWith('video/');
    if (isImage) return <img src={msg.fileUrl} alt="img" style={{maxWidth:200,borderRadius:8,cursor:'pointer'}} onClick={()=>window.open(msg.fileUrl)} />;
    if (isVideo) return <video src={msg.fileUrl} controls style={{maxWidth:220,borderRadius:8}} />;
    return (
      <a href={msg.fileUrl} target="_blank" rel="noreferrer" style={{color:'inherit',display:'flex',alignItems:'center',gap:6,textDecoration:'none'}}>
        <span style={{fontSize:24}}>📄</span>
        <span style={{textDecoration:'underline',fontSize:13}}>{msg.fileName || 'Download File'}</span>
      </a>
    );
  };

  const isMe = (msg) => {
    const sid = msg.senderId?._id || msg.senderId;
    return String(sid) === String(user.userId);
  };

  return (
    <div style={styles.container} ref={chatContainerRef}>
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.avatar}>A</div>
          <div>
            <div style={styles.adminName}>Admin Support</div>
            <div style={styles.status}>
              <span style={{...styles.dot, background: adminOnline ? '#4CAF50' : '#9e9e9e'}} />
              {typing ? 'typing...' : adminOnline ? 'Online' : 'Offline'}
            </div>
          </div>
        </div>
        <button style={styles.logoutBtn} onClick={onLogout}>Logout</button>
      </div>

      <div style={styles.messages}>
        {messages.length === 0 && (
          <div style={styles.emptyState}>Send a message to start the conversation!</div>
        )}
        {messages.map((msg, i) => {
          const mine = isMe(msg);
          
          if (msg.deletedForEveryone) {
            return (
              <div key={msg._id || i} style={{...styles.msgRow, justifyContent: 'center'}}>
                <div style={styles.deletedBubble}>
                  <span style={styles.deletedText}>This message was deleted</span>
                </div>
              </div>
            );
          }
          
          return (
            <div 
              key={msg._id || i} 
              style={{...styles.msgRow, justifyContent: mine ? 'flex-end' : 'flex-start'}}
              onContextMenu={(e) => handleContextMenu(e, msg)}
            >
              <div style={{...styles.bubble, background: mine ? 'linear-gradient(135deg,#667eea,#764ba2)' : '#fff',
                  color: mine ? '#fff' : '#1a1a2e',
                  boxShadow: mine ? 'none' : '0 1px 4px rgba(0,0,0,0.1)'}}>
                {msg.fileUrl ? renderFileMessage(msg) : <span>{msg.message}</span>}
                <div style={{...styles.time, color: mine ? 'rgba(255,255,255,0.7)' : '#999'}}>
                  {new Date(msg.timestamp).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}
                  {mine && <span style={{marginLeft:4}}>{msg.read ? '✓✓' : '✓'}</span>}
                </div>
              </div>
            </div>
          );
        })}
        {typing && (
          <div style={{...styles.msgRow, justifyContent:'flex-start'}}>
            <div style={{...styles.bubble, background:'#fff', color:'#666'}}>
              <span>Admin is typing...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div style={styles.inputArea}>
        <input type="file" ref={fileInputRef} style={{display:'none'}} onChange={handleFileChange} accept="*/*" />
        <button style={styles.attachBtn} onClick={() => fileInputRef.current?.click()} disabled={uploading} title="Attach file">
          {uploading ? '⏳' : '📎'}
        </button>
        <input
          style={styles.textInput}
          placeholder="Type a message..."
          value={input}
          onChange={e => handleTyping(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage(input)}
        />
        <button style={styles.sendBtn} onClick={() => sendMessage(input)} disabled={!input.trim() && !uploading}>
          ➤
        </button>
      </div>

      {showContextMenu && (
        <div className="context-menu" style={{...styles.contextMenu, top: menuPosition.y, left: menuPosition.x}}>
          <button style={styles.contextMenuItem} onClick={() => deleteMessage('forMe')}>
            Delete for me
          </button>
          <button style={{...styles.contextMenuItem, ...styles.dangerItem}} onClick={() => deleteMessage('forEveryone')}>
            Delete for everyone
          </button>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { display:'flex', flexDirection:'column', height:'100vh', maxWidth:480, margin:'0 auto', background:'#f0f2f5', position:'relative' },
  header: { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', background:'linear-gradient(135deg,#667eea,#764ba2)', color:'#fff' },
  headerLeft: { display:'flex', alignItems:'center', gap:12 },
  avatar: { width:42, height:42, borderRadius:21, background:'rgba(255,255,255,0.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, fontWeight:700 },
  adminName: { fontWeight:600, fontSize:16 },
  status: { fontSize:12, display:'flex', alignItems:'center', gap:4, opacity:0.9 },
  dot: { width:8, height:8, borderRadius:4, display:'inline-block' },
  logoutBtn: { background:'rgba(255,255,255,0.2)', border:'none', color:'#fff', padding:'6px 12px', borderRadius:8, cursor:'pointer', fontSize:12 },
  messages: { flex:1, overflowY:'auto', padding:'16px 12px', display:'flex', flexDirection:'column', gap:8 },
  emptyState: { textAlign:'center', color:'#999', marginTop:80, fontSize:15 },
  msgRow: { display:'flex' },
  bubble: { maxWidth:'75%', padding:'10px 14px', borderRadius:18, fontSize:14, lineHeight:1.5 },
  deletedBubble: { background:'#e0e0e0', padding:'8px 16px', borderRadius:18, fontSize:12 },
  deletedText: { color:'#999', fontStyle:'italic' },
  time: { fontSize:10, marginTop:4, textAlign:'right' },
  inputArea: { display:'flex', alignItems:'center', gap:8, padding:'10px 12px', background:'#fff', borderTop:'1px solid #e8e8e8' },
  attachBtn: { background:'none', border:'none', fontSize:22, cursor:'pointer', padding:'0 4px' },
  textInput: { flex:1, padding:'10px 14px', borderRadius:24, border:'1px solid #e0e0e0', outline:'none', fontSize:14, fontFamily:'inherit' },
  sendBtn: { width:40, height:40, borderRadius:20, background:'linear-gradient(135deg,#667eea,#764ba2)', color:'#fff', border:'none', cursor:'pointer', fontSize:18, display:'flex', alignItems:'center', justifyContent:'center' },
  contextMenu: { position:'fixed', background:'white', borderRadius:8, boxShadow:'0 2px 10px rgba(0,0,0,0.2)', padding:'8px 0', minWidth:150, zIndex:1000 },
  contextMenuItem: { width:'100%', padding:'10px 16px', border:'none', background:'white', textAlign:'left', cursor:'pointer', fontSize:14 },
  dangerItem: { color:'#ff3b30' },
};

// Add this to your CSS file or in a style tag
const styleSheet = document.createElement("style");
styleSheet.textContent = `
  .context-menu button:hover {
    background-color: #f5f5f5;
  }
`;
document.head.appendChild(styleSheet);