
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Image,
  Alert, Linking,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import axios from 'axios';
import { BACKEND_URL } from '../config';
import { getSocket } from '../utils/socket';

export default function ChatScreen({ route, navigation }) {
  const { studentId, studentName, adminId } = route.params;
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [studentOnline, setStudentOnline] = useState(false);
  const [typing, setTyping] = useState(false);
  const [uploading, setUploading] = useState(false);
  const flatRef = useRef(null);
  const typingTimer = useRef(null);
  const socketRef = useRef(null);

  const scrollToBottom = () => {
    if (flatRef.current && messages.length > 0) {
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  useEffect(() => { scrollToBottom(); }, [messages]);

  useEffect(() => {
    // Update header
    navigation.setOptions({
      title: studentName,
      headerRight: () => (
        <View style={{ flexDirection:'row', alignItems:'center', marginRight:14 }}>
          <View style={{ width:10, height:10, borderRadius:5, backgroundColor: studentOnline ? '#4CAF50' : '#9e9e9e', marginRight:6 }} />
          <Text style={{ color:'#fff', fontSize:13 }}>{studentOnline ? 'Online' : 'Offline'}</Text>
        </View>
      ),
    });
  }, [studentOnline, studentName]);

  useEffect(() => {
    loadMessages();
    setupSocket();
    return () => {
      if (socketRef.current) {
        socketRef.current.off('newMessage');
        socketRef.current.off('typing');
        socketRef.current.off('userOnline');
        socketRef.current.off('onlineUsers');
      }
    };
  }, []);

  const loadMessages = async () => {
    try {
      const res = await axios.get(`${BACKEND_URL}/api/messages/${studentId}`);
      setMessages(res.data);
      setLoading(false);
      // Mark as read
      socketRef.current?.emit('markRead', { studentId, adminId });
    } catch(e) {
      console.error('Load messages error:', e.message);
      setLoading(false);
    }
  };

  const setupSocket = () => {
    const socket = getSocket();
    socketRef.current = socket;

    socket.off('newMessage');
    socket.off('typing');
    socket.off('userOnline');
    socket.off('onlineUsers');

    socket.on('connect', () => {
      socket.emit('join', adminId);
      socket.emit('markRead', { studentId, adminId });
    });

    socket.on('newMessage', (msg) => {
      const senderId = msg.senderId?._id || msg.senderId;
      const receiverId = msg.receiverId?._id || msg.receiverId;
      const isRelevant =
        (String(senderId) === String(studentId) && String(receiverId) === String(adminId)) ||
        (String(senderId) === String(adminId) && String(receiverId) === String(studentId));
      if (isRelevant) {
        setMessages(prev => {
          if (prev.find(m => m._id === msg._id)) return prev;
          return [...prev, msg];
        });
        // Mark read since we're in this chat
        socket.emit('markRead', { studentId, adminId });
      }
    });

    socket.on('typing', (data) => {
      if (String(data.senderId) === String(studentId)) {
        setTyping(data.typing);
      }
    });

    socket.on('onlineUsers', (ids) => {
      setStudentOnline(ids.includes(String(studentId)));
    });

    socket.on('userOnline', ({ userId, online }) => {
      if (String(userId) === String(studentId)) setStudentOnline(online);
    });

    if (socket.connected) {
      socket.emit('join', adminId);
    }
  };

  const sendMessage = useCallback((text, fileUrl=null, fileType=null, fileName=null) => {
    if (!text.trim() && !fileUrl) return;
    const socket = getSocket();
    socket.emit('sendMessage', {
      senderId: adminId,
      receiverId: studentId,
      message: text.trim(),
      fileUrl, fileType, fileName,
    });
    setInput('');
  }, [adminId, studentId]);

  const handleTypingChange = (val) => {
    setInput(val);
    const socket = getSocket();
    socket.emit('typing', { senderId: adminId, receiverId: studentId, typing: true });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      socket.emit('typing', { senderId: adminId, receiverId: studentId, typing: false });
    }, 2000);
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Gallery access is required'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      await uploadFile(result.assets[0].uri, result.assets[0].mimeType || 'image/jpeg', result.assets[0].fileName || 'image.jpg');
    }
  };

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        await uploadFile(asset.uri, asset.mimeType || 'application/octet-stream', asset.name);
      }
    } catch(e) { Alert.alert('Error', 'Could not pick document'); }
  };

  const uploadFile = async (uri, mimeType, fileName) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', { uri, type: mimeType, name: fileName });
      const res = await axios.post(`${BACKEND_URL}/api/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
      });
      sendMessage('', res.data.fileUrl, res.data.fileType, res.data.fileName);
    } catch(e) {
      Alert.alert('Upload Failed', 'Could not upload file. Check your connection.');
    } finally { setUploading(false); }
  };

  const isMe = (msg) => {
    const sid = msg.senderId?._id || msg.senderId;
    return String(sid) === String(adminId);
  };

  const renderFileMessage = (msg) => {
    if (!msg.fileUrl) return null;
    const isImage = msg.fileType?.startsWith('image/');
    const isVideo = msg.fileType?.startsWith('video/');
    if (isImage) return (
      <TouchableOpacity onPress={() => Linking.openURL(msg.fileUrl)}>
        <Image source={{ uri: msg.fileUrl }} style={{ width:200, height:150, borderRadius:10 }} resizeMode="cover" />
      </TouchableOpacity>
    );
    return (
      <TouchableOpacity onPress={() => Linking.openURL(msg.fileUrl)} style={styles.fileBubble}>
        <Text style={styles.fileIcon}>{isVideo ? '🎥' : '📎'}</Text>
        <Text style={styles.fileName} numberOfLines={2}>{msg.fileName || 'Open File'}</Text>
      </TouchableOpacity>
    );
  };

  const renderMessage = ({ item: msg }) => {
    const mine = isMe(msg);
    return (
      <View style={[styles.msgRow, mine ? styles.msgRowRight : styles.msgRowLeft]}>
        {!mine && (
          <View style={styles.msgAvatar}>
            <Text style={{ color:'#fff', fontWeight:'700' }}>{studentName[0].toUpperCase()}</Text>
          </View>
        )}
        <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
          {msg.fileUrl ? renderFileMessage(msg) : (
            <Text style={[styles.msgText, mine && { color:'#fff' }]}>{msg.message}</Text>
          )}
          <Text style={[styles.msgTime, mine && { color:'rgba(255,255,255,0.7)' }]}>
            {new Date(msg.timestamp).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}
            {mine && <Text>  {msg.read ? '✓✓' : '✓'}</Text>}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#667eea" />
        </View>
      ) : (
        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={(item, i) => item._id || String(i)}
          renderItem={renderMessage}
          contentContainerStyle={{ padding:12, paddingBottom:8 }}
          onContentSizeChange={scrollToBottom}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={{ fontSize:40, marginBottom:8 }}>💬</Text>
              <Text style={{ color:'#999' }}>No messages yet. Say hello!</Text>
            </View>
          }
          ListFooterComponent={typing ? (
            <View style={[styles.msgRow, styles.msgRowLeft]}>
              <View style={styles.msgAvatar}>
                <Text style={{ color:'#fff', fontWeight:'700' }}>{studentName[0].toUpperCase()}</Text>
              </View>
              <View style={[styles.bubble, styles.bubbleOther]}>
                <Text style={{ color:'#999', fontStyle:'italic' }}>typing...</Text>
              </View>
            </View>
          ) : null}
        />
      )}

      {/* Input Area */}
      <View style={styles.inputArea}>
        <TouchableOpacity style={styles.iconBtn} onPress={pickImage} disabled={uploading}>
          <Text style={styles.iconBtnText}>🖼️</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconBtn} onPress={pickDocument} disabled={uploading}>
          <Text style={styles.iconBtnText}>{uploading ? '⏳' : '📎'}</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.textInput}
          placeholder="Type a message..."
          value={input}
          onChangeText={handleTypingChange}
          multiline
          maxLength={2000}
          placeholderTextColor="#aaa"
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() && !uploading) && styles.sendBtnDisabled]}
          onPress={() => sendMessage(input)}
          disabled={!input.trim() && !uploading}
        >
          <Text style={styles.sendBtnText}>➤</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex:1, backgroundColor:'#f0f2f5' },
  center: { flex:1, alignItems:'center', justifyContent:'center', padding:40 },
  msgRow: { flexDirection:'row', marginBottom:8, alignItems:'flex-end' },
  msgRowRight: { justifyContent:'flex-end' },
  msgRowLeft: { justifyContent:'flex-start' },
  msgAvatar: { width:30, height:30, borderRadius:15, backgroundColor:'#667eea', alignItems:'center', justifyContent:'center', marginRight:6 },
  bubble: { maxWidth:'75%', padding:10, borderRadius:16 },
  bubbleMine: { backgroundColor:'#667eea', borderBottomRightRadius:4 },
  bubbleOther: { backgroundColor:'#fff', borderBottomLeftRadius:4, shadowColor:'#000', shadowOpacity:0.08, shadowRadius:4, elevation:2 },
  msgText: { fontSize:14, color:'#1a1a2e', lineHeight:20 },
  msgTime: { fontSize:10, color:'#999', marginTop:4, textAlign:'right' },
  fileBubble: { flexDirection:'row', alignItems:'center', gap:8, padding:4 },
  fileIcon: { fontSize:24 },
  fileName: { fontSize:13, color:'#667eea', textDecorationLine:'underline', flex:1 },
  inputArea: { flexDirection:'row', alignItems:'flex-end', padding:8, paddingBottom:Platform.OS==='ios'?24:10, backgroundColor:'#fff', borderTopWidth:1, borderTopColor:'#e8e8e8' },
  iconBtn: { padding:8 },
  iconBtnText: { fontSize:22 },
  textInput: { flex:1, maxHeight:100, paddingHorizontal:14, paddingVertical:10, backgroundColor:'#f0f2f5', borderRadius:22, fontSize:14, color:'#1a1a2e', marginHorizontal:4 },
  sendBtn: { width:42, height:42, borderRadius:21, backgroundColor:'#667eea', alignItems:'center', justifyContent:'center', marginLeft:4 },
  sendBtnDisabled: { backgroundColor:'#ccc' },
  sendBtnText: { color:'#fff', fontSize:18 },
});
