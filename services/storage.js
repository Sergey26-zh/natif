import AsyncStorage from '@react-native-async-storage/async-storage';

export async function loadReminders() {
  const data = await AsyncStorage.getItem('reminders');
  return data ? JSON.parse(data) : [];
}

export async function saveReminders(list) {
  await AsyncStorage.setItem('reminders', JSON.stringify(list));
}