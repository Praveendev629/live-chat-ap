
import React, { useState } from 'react';
import axios from 'axios';

const BACKEND = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';

export default function Login({ onLogin }) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleStart = async () => {
    if (!name.trim()) { setError('Please enter your name'); return; }
    setLoading(true); setError('');
    try {
      const res = await axios.post(`${BACKEND}/api/create-student`, { name: name.trim() });
      onLogin({ userId: res.data.userId, name: res.data.name });
    } catch(e) {
      setError('Could not connect. Check backend URL.');
    } finally { setLoading(false); }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logo}>💬</div>
        <h1 style={styles.title}>Student Chat</h1>
        <p style={styles.subtitle}>Chat with your admin instantly</p>
        <input
          style={styles.input}
          placeholder="Enter your full name..."
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleStart()}
        />
        {error && <p style={styles.error}>{error}</p>}
        <button style={styles.btn} onClick={handleStart} disabled={loading}>
          {loading ? 'Connecting...' : 'Start Chat →'}
        </button>
      </div>
    </div>
  );
}

const styles = {
  container: { minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'linear-gradient(135deg,#667eea 0%,#764ba2 100%)' },
  card: { background:'#fff', borderRadius:20, padding:40, width:'100%', maxWidth:400, textAlign:'center', boxShadow:'0 20px 60px rgba(0,0,0,0.2)' },
  logo: { fontSize:60, marginBottom:16 },
  title: { fontSize:28, fontWeight:700, color:'#1a1a2e', marginBottom:8 },
  subtitle: { color:'#666', marginBottom:32, fontSize:15 },
  input: { width:'100%', padding:'14px 16px', fontSize:15, border:'2px solid #e8e8e8', borderRadius:12, outline:'none', marginBottom:12, fontFamily:'inherit' },
  error: { color:'#e74c3c', fontSize:13, marginBottom:12 },
  btn: { width:'100%', padding:'14px', background:'linear-gradient(135deg,#667eea,#764ba2)', color:'#fff', border:'none', borderRadius:12, fontSize:16, fontWeight:600, cursor:'pointer' },
};
