
import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import ChatWindow from './components/ChatWindow';

export default function App() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    // Persist session - student stays logged in
    const saved = localStorage.getItem('chat_user');
    if (saved) {
      try { setUser(JSON.parse(saved)); } catch(e) { localStorage.removeItem('chat_user'); }
    }
  }, []);

  const handleLogin = (userData) => {
    localStorage.setItem('chat_user', JSON.stringify(userData));
    setUser(userData);
  };

  const handleLogout = () => {
    localStorage.removeItem('chat_user');
    setUser(null);
  };

  return user
    ? <ChatWindow user={user} onLogout={handleLogout} />
    : <Login onLogin={handleLogin} />;
}
