import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function requestPermissions() {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') {
    alert('Нет разрешения на уведомления');
  }
}

export async function scheduleReminder(reminder) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Напоминание',
      body: reminder.task,
    },
    trigger: {
      date: new Date(reminder.date),
    },
  });
}