import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'plannerItems';
const LEGACY_REMINDERS_KEY = 'reminders';

export function createDayKey(value) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function normalizePlannerItem(item) {
  if (item.type === 'task') {
    return {
      id: item.id,
      type: 'task',
      task: item.task || 'Задача',
      dayKey: item.dayKey || createDayKey(item.date || new Date()),
      completed: Boolean(item.completed),
      createdAt: item.createdAt || new Date().toISOString(),
    };
  }

  return {
    id: item.id,
    type: 'reminder',
    task: item.task || 'Напоминание',
    date: item.date,
    notificationId: item.notificationId,
    createdAt: item.createdAt || item.date || new Date().toISOString(),
  };
}

export async function loadPlannerItems() {
  const current = await AsyncStorage.getItem(STORAGE_KEY);

  if (current) {
    const parsed = JSON.parse(current).map(normalizePlannerItem);
    return parsed;
  }

  const legacy = await AsyncStorage.getItem(LEGACY_REMINDERS_KEY);
  const reminders = legacy
    ? JSON.parse(legacy).map((item) =>
        normalizePlannerItem({
          ...item,
          type: 'reminder',
        })
      )
    : [];

  if (reminders.length) {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(reminders));
  }

  return reminders;
}

export async function savePlannerItems(items) {
  await AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(items.map(normalizePlannerItem))
  );
}

export function buildReminderItem(task, date, notificationId) {
  return {
    id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
    type: 'reminder',
    task,
    date: date.toISOString(),
    notificationId,
    createdAt: new Date().toISOString(),
  };
}

export function buildTaskItem(task, date) {
  return {
    id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
    type: 'task',
    task,
    dayKey: createDayKey(date),
    completed: false,
    createdAt: new Date().toISOString(),
  };
}

export function getWeekDates(centerDate) {
  const current = new Date(centerDate);
  const day = current.getDay();
  const mondayShift = day === 0 ? -6 : 1 - day;
  const monday = new Date(current);
  monday.setDate(current.getDate() + mondayShift);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return date;
  });
}

export function isSameDay(a, b) {
  return createDayKey(a) === createDayKey(b);
}

export function getMonthMatrix(targetDate) {
  const current = new Date(targetDate);
  const year = current.getFullYear();
  const month = current.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
  const totalCells = Math.ceil((startOffset + lastDay.getDate()) / 7) * 7;
  const startDate = new Date(year, month, 1 - startOffset);

  return Array.from({ length: totalCells }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);
    return {
      date,
      inCurrentMonth: date.getMonth() === month,
    };
  });
}
