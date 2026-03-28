import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import {
  createDayKey,
  getMonthMatrix,
  isSameDay,
  loadPlannerItems,
  savePlannerItems,
} from '../utils/planner';

const WEEK_DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function formatMonthTitle(date) {
  return date.toLocaleDateString('ru-RU', {
    month: 'long',
    year: 'numeric',
  });
}

function formatSelectedTitle(date) {
  return date.toLocaleDateString('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export default function CalendarScreen() {
  const tabBarHeight = useBottomTabBarHeight();
  const today = useMemo(() => new Date(), []);
  const [items, setItems] = useState([]);
  const [visibleMonth, setVisibleMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());

  const load = async () => {
    const list = await loadPlannerItems();
    setItems(list);
  };

  useEffect(() => {
    load();
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  const monthDays = useMemo(() => getMonthMatrix(visibleMonth), [visibleMonth]);
  const selectedDayKey = createDayKey(selectedDate);

  const selectedItems = useMemo(
    () =>
      items.filter((item) =>
        item.type === 'task'
          ? item.dayKey === selectedDayKey
          : isSameDay(item.date, selectedDate)
      ),
    [items, selectedDate, selectedDayKey]
  );

  const reminderCount = selectedItems.filter((item) => item.type === 'reminder').length;
  const taskCount = selectedItems.filter((item) => item.type === 'task').length;

  const countsByDay = useMemo(() => {
    const map = new Map();

    items.forEach((item) => {
      const key = item.type === 'task' ? item.dayKey : createDayKey(item.date);
      const current = map.get(key) || { reminders: 0, tasks: 0 };

      if (item.type === 'task') {
        current.tasks += 1;
      } else {
        current.reminders += 1;
      }

      map.set(key, current);
    });

    return map;
  }, [items]);

  const shiftMonth = (delta) => {
    const next = new Date(visibleMonth);
    next.setMonth(visibleMonth.getMonth() + delta);
    setVisibleMonth(next);

    if (
      selectedDate.getMonth() !== next.getMonth() ||
      selectedDate.getFullYear() !== next.getFullYear()
    ) {
      const adjusted = new Date(next.getFullYear(), next.getMonth(), 1);
      setSelectedDate(adjusted);
    }
  };

  const removeReminder = async (itemToDelete) => {
    if (itemToDelete.notificationId) {
      try {
        await Notifications.cancelScheduledNotificationAsync(itemToDelete.notificationId);
      } catch (e) {
        console.log('CANCEL NOTIFICATION ERROR:', e);
      }
    }

    const updated = items.filter((item) => item.id !== itemToDelete.id);
    setItems(updated);
    await savePlannerItems(updated);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.container}>
        <Text style={styles.title}>Календарь</Text>

        <View style={styles.calendarCard}>
          <View style={styles.calendarHeader}>
            <TouchableOpacity style={styles.headerIcon} onPress={() => shiftMonth(-1)}>
              <Ionicons name="chevron-back" size={20} color="#76809F" />
            </TouchableOpacity>

            <Text style={styles.monthTitle}>
              {formatMonthTitle(visibleMonth).replace(/^\p{L}/u, (s) => s.toUpperCase())}
            </Text>

            <TouchableOpacity style={styles.headerIcon} onPress={() => shiftMonth(1)}>
              <Ionicons name="chevron-forward" size={20} color="#76809F" />
            </TouchableOpacity>
          </View>

          <View style={styles.weekRow}>
            {WEEK_DAYS.map((day) => (
              <Text key={day} style={styles.weekDay}>
                {day}
              </Text>
            ))}
          </View>

          <View style={styles.grid}>
            {monthDays.map(({ date, inCurrentMonth }) => {
              const key = createDayKey(date);
              const count = countsByDay.get(key) || { reminders: 0, tasks: 0 };
              const isSelected = isSameDay(date, selectedDate);
              const isToday = isSameDay(date, today);

              return (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.dayCell,
                    isSelected && styles.dayCellSelected,
                    isToday && !isSelected && styles.dayCellToday,
                  ]}
                  activeOpacity={0.85}
                  onPress={() => setSelectedDate(date)}
                >
                  <Text
                    style={[
                      styles.dayCellText,
                      !inCurrentMonth && styles.dayCellMuted,
                      isSelected && styles.dayCellTextSelected,
                    ]}
                  >
                    {date.getDate()}
                  </Text>
                  {(count.reminders > 0 || count.tasks > 0) && inCurrentMonth ? (
                    <View style={styles.dotRow}>
                      {count.reminders > 0 ? <View style={styles.reminderDot} /> : null}
                      {count.tasks > 0 ? <View style={styles.taskDot} /> : null}
                    </View>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={styles.reminderDot} />
              <Text style={styles.legendText}>Напоминания</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={styles.taskDot} />
              <Text style={styles.legendText}>Задачи</Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>
          {formatSelectedTitle(selectedDate).replace(/^\p{L}/u, (s) => s.toUpperCase())}
        </Text>

        {selectedItems.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="sunny-outline" size={20} color="#B7BCD2" />
            <Text style={styles.emptyText}>Ничего не запланировано</Text>
          </View>
        ) : (
          <FlatList
            data={selectedItems}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: tabBarHeight + 22 }}
            renderItem={({ item }) => (
              <View style={styles.planCard}>
                <View style={styles.planBadge}>
                  <View style={item.type === 'task' ? styles.taskDot : styles.reminderDot} />
                </View>
                <View style={styles.planTextWrap}>
                  <Text style={styles.planTitle}>{item.task}</Text>
                  <Text style={styles.planSubtitle}>
                    {item.type === 'task'
                      ? 'Задача на день'
                      : new Date(item.date).toLocaleTimeString('ru-RU', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                  </Text>
                </View>
                {item.type === 'reminder' ? (
                  <TouchableOpacity
                    style={styles.deleteButton}
                    activeOpacity={0.8}
                    onPress={() => removeReminder(item)}
                  >
                    <Ionicons name="trash-outline" size={18} color="#FF6E73" />
                  </TouchableOpacity>
                ) : null}
              </View>
            )}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F5F6FF',
  },
  container: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 8,
  },
  title: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '900',
    color: '#151827',
    marginBottom: 14,
  },
  calendarCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
    borderWidth: 1,
    borderColor: '#E7E9F6',
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  headerIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#151827',
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  weekDay: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    color: '#A0A7C0',
    fontWeight: '700',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.285%',
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCellSelected: {
    backgroundColor: '#6F49FF',
    borderRadius: 22,
  },
  dayCellToday: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#6F49FF',
  },
  dayCellText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#151827',
  },
  dayCellTextSelected: {
    color: '#FFFFFF',
  },
  dayCellMuted: {
    color: '#CAD0E3',
  },
  dotRow: {
    flexDirection: 'row',
    marginTop: 3,
    gap: 4,
  },
  reminderDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#7A5CFF',
  },
  taskDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#43C59E',
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 12,
    gap: 18,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendText: {
    fontSize: 12,
    color: '#A2A9C3',
  },
  sectionTitle: {
    marginTop: 18,
    marginBottom: 12,
    fontSize: 18,
    fontWeight: '800',
    color: '#151827',
  },
  emptyCard: {
    height: 52,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7E9F6',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  emptyText: {
    color: '#A2A9C3',
    fontSize: 15,
  },
  planCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7E9F6',
    borderRadius: 18,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  planBadge: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#F3F0FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  planTextWrap: {
    flex: 1,
  },
  planTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#151827',
  },
  planSubtitle: {
    marginTop: 3,
    fontSize: 13,
    color: '#9DA5BF',
  },
  deleteButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#FFF4F4',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
});
