import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../config';

export default function MessageActions({ 
  visible, 
  onClose, 
  message, 
  onMessageDeleted,
  isAdmin = true 
}) {
  
  const deleteForMe = async () => {
    try {
      const adminId = await AsyncStorage.getItem('userId');
      const response = await fetch(`${API_URL}/api/message/${message._id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          deleteType: 'forMe',
          requesterId: adminId
        })
      });
      
      if (response.ok) {
        onMessageDeleted(message._id, 'forMe');
        onClose();
      }
    } catch (error) {
      console.error('Error deleting message:', error);
      Alert.alert('Error', 'Failed to delete message');
    }
  };
  
  const deleteForEveryone = async () => {
    Alert.alert(
      'Delete for Everyone',
      'This message will be deleted for everyone. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const adminId = await AsyncStorage.getItem('userId');
              const response = await fetch(`${API_URL}/api/message/${message._id}`, {
                method: 'DELETE',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  deleteType: 'forEveryone',
                  requesterId: adminId
                })
              });
              
              if (response.ok) {
                onMessageDeleted(message._id, 'forEveryone');
                onClose();
              }
            } catch (error) {
              console.error('Error deleting message:', error);
              Alert.alert('Error', 'Failed to delete message');
            }
          }
        }
      ]
    );
  };
  
  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity style={styles.overlay} onPress={onClose}>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <TouchableOpacity style={styles.option} onPress={deleteForMe}>
              <Text style={styles.optionText}>Delete for me</Text>
            </TouchableOpacity>
            
            {isAdmin && (
              <TouchableOpacity style={styles.option} onPress={deleteForEveryone}>
                <Text style={[styles.optionText, styles.dangerText]}>
                  Delete for everyone
                </Text>
              </TouchableOpacity>
            )}
            
            <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
  },
  option: {
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  optionText: {
    fontSize: 18,
    textAlign: 'center',
  },
  dangerText: {
    color: '#ff3b30',
  },
  cancelButton: {
    paddingVertical: 15,
    marginTop: 10,
  },
  cancelText: {
    fontSize: 18,
    textAlign: 'center',
    color: '#007aff',
    fontWeight: '600',
  },
});