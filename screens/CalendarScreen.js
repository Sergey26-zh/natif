import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useAppTheme } from '../theme';

const WEEK_DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const IMPORTANCE_META = {
  low: { label: 'Низкая', color: '#A8AFCA' },
  medium: { label: 'Средняя', color: '#6F49FF' },
  high: { label: 'Высокая', color: '#FF5A5F' },
};
const HIDE_DELAY_MS = 4000;

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
  const { themeMode, theme, toggleTheme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const today = useMemo(() => new Date(), []);
  const [items, setItems] = useState([]);
  const [visibleMonth, setVisibleMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const pendingTimeoutsRef = useRef({});

  const load = async () => {
    const list = await loadPlannerItems();
    setItems(list);
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    return () => {
      Object.values(pendingTimeoutsRef.current).forEach((timerId) => clearTimeout(timerId));
    };
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
          ? item.dayKey === selectedDayKey && !item.archivedCompleted
          : isSameDay(item.date, selectedDate)
      ),
    [items, selectedDate, selectedDayKey]
  );

  const countsByDay = useMemo(() => {
    const map = new Map();

    items.forEach((item) => {
      const key = item.type === 'task' ? item.dayKey : createDayKey(item.date);
      const current = map.get(key) || { reminders: 0, tasks: 0 };

      if (item.type === 'task') {
        if (item.archivedCompleted) {
          map.set(key, current);
          return;
        }
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
      setSelectedDate(new Date(next.getFullYear(), next.getMonth(), 1));
    }
  };

  const persistItems = async (updated) => {
    setItems(updated);
    await savePlannerItems(updated);
  };

  const clearPendingTimeout = (id) => {
    if (pendingTimeoutsRef.current[id]) {
      clearTimeout(pendingTimeoutsRef.current[id]);
      delete pendingTimeoutsRef.current[id];
    }
  };

  const archiveTaskAfterDelay = (taskId) => {
    clearPendingTimeout(taskId);

    pendingTimeoutsRef.current[taskId] = setTimeout(() => {
      setItems((currentItems) => {
        const updated = currentItems.map((item) =>
          item.id === taskId && item.type === 'task'
            ? { ...item, archivedCompleted: true }
            : item
        );
        savePlannerItems(updated);
        return updated;
      });
      delete pendingTimeoutsRef.current[taskId];
    }, HIDE_DELAY_MS);
  };

  const removeItem = async (itemToDelete) => {
    clearPendingTimeout(itemToDelete.id);

    if (itemToDelete.type === 'reminder' && itemToDelete.notificationId) {
      try {
        await Notifications.cancelScheduledNotificationAsync(itemToDelete.notificationId);
      } catch (e) {
        console.log('CANCEL NOTIFICATION ERROR:', e);
      }
    }

    const updated = items.filter((item) => {
      if (item.id !== itemToDelete.id) {
        return true;
      }

      if (itemToDelete.type === 'task') {
        return false;
      }

      return false;
    });
    await persistItems(updated);
  };

  const toggleTask = async (taskId) => {
    const currentTask = items.find((item) => item.id === taskId && item.type === 'task');
    if (!currentTask) {
      return;
    }

    const shouldComplete = !currentTask.completed;
    const updated = items.map((item) => {
      if (!(item.id === taskId && item.type === 'task')) {
        return item;
      }

      return {
        ...item,
        completed: shouldComplete,
        completedAt: shouldComplete ? new Date().toISOString() : null,
        archivedCompleted: false,
      };
    });

    await persistItems(updated);

    if (shouldComplete) {
      archiveTaskAfterDelay(taskId);
    } else {
      clearPendingTimeout(taskId);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={[styles.container, { paddingBottom: tabBarHeight + 12 }]}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Календарь</Text>

          <TouchableOpacity style={styles.themeToggle} activeOpacity={0.85} onPress={toggleTheme}>
            <Ionicons
              name={themeMode === 'dark' ? 'sunny-outline' : 'moon-outline'}
              size={18}
              color={theme.colors.primary}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.calendarCard}>
          <View style={styles.calendarHeader}>
            <TouchableOpacity style={styles.headerIcon} onPress={() => shiftMonth(-1)}>
              <Ionicons name="chevron-back" size={20} color={theme.colors.textSecondary} />
            </TouchableOpacity>

            <Text style={styles.monthTitle}>
              {formatMonthTitle(visibleMonth).replace(/^\p{L}/u, (s) => s.toUpperCase())}
            </Text>

            <TouchableOpacity style={styles.headerIcon} onPress={() => shiftMonth(1)}>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
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
                  activeOpacity={0.88}
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
          <View style={[styles.emptyCard, styles.emptyCardSpaced]}>
            <Ionicons name="sunny-outline" size={20} color={theme.colors.emptyIcon} />
            <Text style={styles.emptyText}>Ничего не запланировано</Text>
          </View>
        ) : (
          <FlatList
            data={selectedItems}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 12 }}
            renderItem={({ item }) => {
              const reminderMeta = IMPORTANCE_META[item.importance] || IMPORTANCE_META.medium;
              const isTask = item.type === 'task';

              return (
                <View style={styles.planCard}>
                  {isTask ? (
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => toggleTask(item.id)}
                      style={styles.taskCheckButton}
                    >
                      <Ionicons
                        name={item.completed ? 'checkbox' : 'square-outline'}
                        size={20}
                        color={theme.colors.success}
                      />
                    </TouchableOpacity>
                  ) : (
                    <View
                      style={[
                        styles.planBadge,
                        { backgroundColor: `${reminderMeta.color}18` },
                      ]}
                    >
                      <Ionicons
                        name="notifications-outline"
                        size={18}
                        color={reminderMeta.color}
                      />
                    </View>
                  )}

                  <View style={styles.planTextWrap}>
                    <Text
                      style={[
                        styles.planTitle,
                        isTask && styles.taskTitle,
                        isTask && item.completed && styles.completedTitle,
                      ]}
                    >
                      {item.task}
                    </Text>

                    <Text style={[styles.planSubtitle, isTask && styles.taskSubtitle]}>
                      {isTask
                        ? item.completed
                          ? 'Задача выполнена'
                          : 'Задача на день'
                        : `${reminderMeta.label} · ${new Date(item.date).toLocaleTimeString('ru-RU', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}`}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={styles.deleteButton}
                    activeOpacity={0.8}
                    onPress={() => removeItem(item)}
                  >
                    <Ionicons name="trash-outline" size={16} color={theme.colors.textMuted} />
                  </TouchableOpacity>
                </View>
              );
            }}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

function createStyles(theme) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    container: {
      flex: 1,
      paddingHorizontal: 18,
      paddingTop: 8,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 14,
    },
    title: {
      fontSize: 30,
      lineHeight: 36,
      fontWeight: '900',
      color: theme.colors.text,
    },
    themeToggle: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceSecondary,
      borderWidth: 1,
      borderColor: theme.colors.cardBorder,
    },
    calendarCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: 24,
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 16,
      borderWidth: 1,
      borderColor: theme.colors.cardBorder,
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
      color: theme.colors.text,
    },
    weekRow: {
      flexDirection: 'row',
      marginBottom: 10,
    },
    weekDay: {
      flex: 1,
      textAlign: 'center',
      fontSize: 12,
      color: theme.colors.textMuted,
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
      backgroundColor: theme.colors.primary,
      borderRadius: 22,
    },
    dayCellToday: {
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.colors.calendarTodayBorder,
    },
    dayCellText: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.colors.text,
    },
    dayCellTextSelected: {
      color: '#FFFFFF',
    },
    dayCellMuted: {
      color: theme.colors.textMuted,
      opacity: 0.45,
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
      backgroundColor: theme.colors.success,
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
      color: theme.colors.textMuted,
    },
    sectionTitle: {
      marginTop: 18,
      marginBottom: 12,
      fontSize: 18,
      fontWeight: '800',
      color: theme.colors.text,
    },
    emptyCard: {
      height: 52,
      borderRadius: 16,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.cardBorder,
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    emptyCardSpaced: {
      marginBottom: 12,
    },
    emptyText: {
      color: theme.colors.textMuted,
      fontSize: 15,
    },
    planCard: {
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.cardBorder,
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
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    taskCheckButton: {
      width: 28,
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
      color: theme.colors.text,
    },
    taskTitle: {
      color: theme.colors.success,
    },
    completedTitle: {
      color: theme.colors.textMuted,
      textDecorationLine: 'line-through',
    },
    planSubtitle: {
      marginTop: 3,
      fontSize: 13,
      color: theme.colors.textMuted,
    },
    taskSubtitle: {
      color: theme.colors.textSoft,
    },
    deleteButton: {
      width: 26,
      height: 26,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 10,
    },
  });
}
