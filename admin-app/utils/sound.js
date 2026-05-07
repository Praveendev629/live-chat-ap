
import { Audio } from 'expo-av';

let sound = null;

export async function playNotifSound() {
  try {
    if (sound) { await sound.unloadAsync(); }
    const { sound: s } = await Audio.Sound.createAsync(
      require('../assets/notification.mp3'),
      { shouldPlay: true }
    );
    sound = s;
  } catch(e) {
    // fallback beep via Audio API
    console.log('Sound play error:', e.message);
  }
}
