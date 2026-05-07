import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Alert, AppState, Modal,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { BACKEND_URL } from '../config';
import { getSocket } from '../utils/socket';
import { useFocusEffect } from '@react-navigation/native';

export default function StudentListScreen({ navigation }) {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [adminId, setAdminId] = useState(null);
  const [actionModalVisible, setActionModalVisible] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const socketRef = useRef(null);

  const loadStudents = async () => {
    try {
      const res = await axios.get(`${BACKEND_URL}/api/students`);
      setStudents(res.data);
    } catch(e) {
      console.error('Load students error:', e.message);
      Alert.alert('Connection Error', `Could not connect to server.\n\nMake sure BACKEND_URL in config.js is set to:\n${BACKEND_URL}`);
    }
  };

  const initAdmin = async () => {
    try {
      let saved = await AsyncStorage.getItem('admin_id');
      if (!saved) {
        const res = await axios.get(`${BACKEND_URL}/api/admin`);
        saved = res.data._id;
        await AsyncStorage.setItem('admin_id', saved);
      }
      setAdminId(saved);
      return saved;
    } catch(e) {
      console.error('Init admin error:', e.message);
      return null;
    }
  };

  const connectSocket = (aId) => {
    const socket = getSocket();
    socketRef.current = socket;

    socket.off('connect');
    socket.off('newMessage');
    socket.off('unreadUpdate');
    socket.off('userOnline');
    socket.off('studentRemoved');

    socket.on('connect', () => {
      console.log('Socket connected:', socket.id);
      socket.emit('join', aId);
    });

    socket.on('connect_error', (err) => {
      console.error('Socket connect error:', err.message);
    });

    socket.on('newMessage', (msg) => {
      const senderId = msg.senderId?._id || msg.senderId;
      if (String(senderId) !== String(aId)) {
        setStudents(prev => prev.map(s => {
          if (String(s._id) === String(senderId)) {
            return {
              ...s,
              unreadCount: (s.unreadCount || 0) + 1,
              lastMessage: msg.message || (msg.fileName ? `File: ${msg.fileName}` : ''),
              lastMessageTime: msg.timestamp,
            };
          }
          return s;
        }));
      }
    });

    socket.on('unreadUpdate', ({ studentId, count }) => {
      setStudents(prev => prev.map(s =>
        String(s._id) === String(studentId) ? { ...s, unreadCount: count } : s
      ));
    });

    socket.on('userOnline', ({ userId, online }) => {
      setStudents(prev => prev.map(s =>
        String(s._id) === String(userId) ? { ...s, online } : s
      ));
    });

    socket.on('studentRemoved', ({ studentId }) => {
      setStudents(prev => prev.filter(s => String(s._id) !== String(studentId)));
    });

    if (!socket.connected) socket.connect();
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      const aId = await initAdmin();
      await loadStudents();
      if (aId) connectSocket(aId);
      setLoading(false);
    })();
    return () => {
      if (socketRef.current) {
        socketRef.current.off('newMessage');
        socketRef.current.off('unreadUpdate');
        socketRef.current.off('userOnline');
        socketRef.current.off('studentRemoved');
      }
    };
  }, []);

  useFocusEffect(
    useCallback(() => { loadStudents(); }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadStudents();
    setRefreshing(false);
  };

  const openChat = (student) => {
    navigation.navigate('Chat', {
      studentId: student._id,
      studentName: student.name,
      adminId,
    });
  };

  const deleteStudent = async () => {
    if (!selectedStudent) return;
    
    Alert.alert(
      'Delete Student',
      `Are you sure you want to delete ${selectedStudent.name}? This will permanently delete all their messages and cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await axios.delete(`${BACKEND_URL}/api/student/${selectedStudent._id}`);
              if (response.data.success) {
                Alert.alert('Success', 'Student deleted successfully');
                loadStudents();
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to delete student');
            }
          }
        }
      ]
    );
    setActionModalVisible(false);
    setSelectedStudent(null);
  };

  const deleteChat = async () => {
    if (!selectedStudent) return;
    
    Alert.alert(
      'Delete Chat',
      `Delete entire chat with ${selectedStudent.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete for Me',
          onPress: async () => {
            try {
              await axios.delete(`${BACKEND_URL}/api/chat/${selectedStudent._id}`, {
                data: { deleteType: 'forMe', requesterId: adminId }
              });
              loadStudents();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete chat');
            }
          }
        },
        {
          text: 'Delete for Everyone',
          style: 'destructive',
          onPress: async () => {
            try {
              await axios.delete(`${BACKEND_URL}/api/chat/${selectedStudent._id}`, {
                data: { deleteType: 'forEveryone', requesterId: adminId }
              });
              loadStudents();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete chat');
            }
          }
        }
      ]
    );
    setActionModalVisible(false);
    setSelectedStudent(null);
  };

  const showContextMenu = (student) => {
    setSelectedStudent(student);
    setActionModalVisible(true);
  };

  const formatTime = (t) => {
    if (!t) return '';
    const d = new Date(t);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return 'now';
    if (diff < 3600000) return `${Math.floor(diff/60000)}m`;
    if (diff < 86400000) return d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    return d.toLocaleDateString([], {month:'short', day:'numeric'});
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity 
      style={styles.item} 
      onPress={() => openChat(item)} 
      onLongPress={() => showContextMenu(item)}
      activeOpacity={0.7}
      delayLongPress={500}
    >
      <View style={styles.avatarWrap}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{item.name[0].toUpperCase()}</Text>
        </View>
        <View style={[styles.onlineDot, { backgroundColor: item.online ? '#4CAF50' : '#9e9e9e' }]} />
      </View>
      <View style={styles.info}>
        <View style={styles.row}>
          <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.time}>{formatTime(item.lastMessageTime)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.lastMsg} numberOfLines={1}>{item.lastMessage || 'No messages yet'}</Text>
          {item.unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{item.unreadCount > 99 ? '99+' : item.unreadCount}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  if (loading) return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color="#667eea" />
      <Text style={styles.loadingText}>Connecting to server...</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={students.sort((a,b) => new Date(b.lastMessageTime||b.createdAt) - new Date(a.lastMessageTime||a.createdAt))}
        keyExtractor={i => i._id}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#667eea']} />}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.emptyIcon}>👥</Text>
            <Text style={styles.emptyText}>No students yet</Text>
            <Text style={styles.emptySubtext}>Students will appear here when they start a chat</Text>
          </View>
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />

      <Modal
        visible={actionModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setActionModalVisible(false)}
      >
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setActionModalVisible(false)}>
          <View style={styles.modalContent}>
            <TouchableOpacity style={styles.modalOption} onPress={deleteChat}>
              <Text style={styles.modalOptionText}>Delete Chat</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalOption} onPress={deleteStudent}>
              <Text style={[styles.modalOptionText, styles.dangerText]}>Delete Student</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalCancel} onPress={() => setActionModalVisible(false)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex:1, backgroundColor:'#f0f2f5' },
  center: { flex:1, alignItems:'center', justifyContent:'center', paddingTop:80 },
  loadingText: { marginTop:12, color:'#667eea', fontSize:14 },
  emptyIcon: { fontSize:60, marginBottom:12 },
  emptyText: { fontSize:18, fontWeight:'700', color:'#333', marginBottom:8 },
  emptySubtext: { fontSize:13, color:'#999', textAlign:'center', paddingHorizontal:40 },
  item: { flexDirection:'row', alignItems:'center', padding:14, backgroundColor:'#fff' },
  avatarWrap: { position:'relative', marginRight:12 },
  avatar: { width:52, height:52, borderRadius:26, backgroundColor:'#667eea', alignItems:'center', justifyContent:'center' },
  avatarText: { color:'#fff', fontSize:22, fontWeight:'700' },
  onlineDot: { position:'absolute', bottom:2, right:2, width:13, height:13, borderRadius:7, borderWidth:2, borderColor:'#fff' },
  info: { flex:1 },
  row: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:4 },
  name: { fontSize:16, fontWeight:'700', color:'#1a1a2e', flex:1 },
  time: { fontSize:12, color:'#999', marginLeft:8 },
  lastMsg: { fontSize:13, color:'#666', flex:1 },
  badge: { backgroundColor:'#667eea', borderRadius:10, minWidth:20, height:20, alignItems:'center', justifyContent:'center', paddingHorizontal:6, marginLeft:8 },
  badgeText: { color:'#fff', fontSize:11, fontWeight:'700' },
  separator: { height:1, backgroundColor:'#f0f0f0', marginLeft:78 },
  modalOverlay: { flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'flex-end' },
  modalContent: { backgroundColor:'white', borderTopLeftRadius:20, borderTopRightRadius:20, padding:20 },
  modalOption: { paddingVertical:15, borderBottomWidth:1, borderBottomColor:'#e0e0e0' },
  modalOptionText: { fontSize:18, textAlign:'center' },
  dangerText: { color:'#ff3b30' },
  modalCancel: { paddingVertical:15, marginTop:10 },
  modalCancelText: { fontSize:18, textAlign:'center', color:'#007aff', fontWeight:'600' },
});