import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import DraggableFlatList, { ScaleDecorator } from 'react-native-draggable-flatlist';
import {
  buildTaskItem,
  createDayKey,
  isSameDay,
  loadPlannerItems,
  savePlannerItems,
} from '../utils/planner';
import { useAppTheme } from '../theme';
import {
  addVoiceListeners,
  isSpeechAvailable,
  isVoiceAvailableModule,
  removeVoiceListeners,
  startSpeech,
  stopSpeech,
} from '../utils/voice';

const REMOVE_DELAY_MS = 5000;

function formatLongTitle(date) {
  return date.toLocaleDateString('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function formatShortDate(date) {
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function HomeScreen() {
  const tabBarHeight = useBottomTabBarHeight();
  const isFocused = useIsFocused();
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const today = useMemo(() => new Date(), []);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [items, setItems] = useState([]);
  const [taskText, setTaskText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [pendingRemovalMap, setPendingRemovalMap] = useState({});
  const [countdownTick, setCountdownTick] = useState(Date.now());
  const pendingTimeoutsRef = useRef({});

  const selectedDayKey = createDayKey(selectedDate);

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

  useEffect(() => {
    if (!isVoiceAvailableModule()) {
      return undefined;
    }

    if (!isFocused) {
      setIsListening(false);
      removeVoiceListeners();
      return undefined;
    }

    addVoiceListeners({
      onSpeechResults: (e) => {
        if (e.value?.length) {
          setTaskText(e.value[0]);
        }
      },
      onSpeechPartialResults: (e) => {
        if (e.value?.length) {
          setTaskText(e.value[0]);
        }
      },
      onSpeechStart: () => setIsListening(true),
      onSpeechEnd: () => setIsListening(false),
    });

    return () => {
      removeVoiceListeners();
    };
  }, [isFocused]);

  useEffect(() => {
    return () => {
      Object.values(pendingTimeoutsRef.current).forEach((timerId) => clearTimeout(timerId));
    };
  }, []);

  useEffect(() => {
    if (!Object.keys(pendingRemovalMap).length) {
      return undefined;
    }

    const intervalId = setInterval(() => {
      setCountdownTick(Date.now());
    }, 100);

    return () => clearInterval(intervalId);
  }, [pendingRemovalMap]);

  const tasks = useMemo(
    () =>
      items
        .filter((item) => item.type === 'task' && item.dayKey === selectedDayKey)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [items, selectedDayKey]
  );

  const completedCount = tasks.filter((item) => item.completed).length;
  const progress = tasks.length ? completedCount / tasks.length : 0;

  const shiftDay = (delta) => {
    const next = new Date(selectedDate);
    next.setDate(selectedDate.getDate() + delta);
    setSelectedDate(next);
  };

  const addTask = async () => {
    const normalized = taskText.trim();
    if (!normalized) {
      return;
    }

    const nextTask = buildTaskItem(normalized, selectedDate);
    const updated = [nextTask, ...items];

    setItems(updated);
    setTaskText('');
    await savePlannerItems(updated);
  };

  const clearPendingRemoval = (id) => {
    if (pendingTimeoutsRef.current[id]) {
      clearTimeout(pendingTimeoutsRef.current[id]);
      delete pendingTimeoutsRef.current[id];
    }

    setPendingRemovalMap((current) => {
      if (!current[id]) {
        return current;
      }

      const next = { ...current };
      delete next[id];
      return next;
    });
  };

  const finalizeTaskRemoval = async (id) => {
    clearPendingRemoval(id);

    const updated = items.filter((item) => item.id !== id);
    setItems(updated);
    await savePlannerItems(updated);
  };

  const scheduleTaskRemoval = (id) => {
    clearPendingRemoval(id);

    const startedAt = Date.now();
    setPendingRemovalMap((current) => ({
      ...current,
      [id]: startedAt,
    }));

    pendingTimeoutsRef.current[id] = setTimeout(() => {
      finalizeTaskRemoval(id);
    }, REMOVE_DELAY_MS);
  };

  const toggleTask = async (id) => {
    const currentTask = items.find((item) => item.id === id && item.type === 'task');
    if (!currentTask) {
      return;
    }

    const nextCompleted = !currentTask.completed;
    const updated = items.map((item) =>
      item.id === id && item.type === 'task' ? { ...item, completed: nextCompleted } : item
    );

    setItems(updated);
    await savePlannerItems(updated);

    if (nextCompleted) {
      scheduleTaskRemoval(id);
    } else {
      clearPendingRemoval(id);
    }
  };

  const removeTask = async (id) => {
    clearPendingRemoval(id);
    const updated = items.filter((item) => item.id !== id);
    setItems(updated);
    await savePlannerItems(updated);
  };

  const reorderTasks = async (orderedTasks) => {
    const reorderedTasks = orderedTasks.map((task, index) => ({
      ...task,
      sortOrder: index,
    }));

    const otherItems = items.filter(
      (item) => !(item.type === 'task' && item.dayKey === selectedDayKey)
    );
    const updated = [...reorderedTasks, ...otherItems];

    setItems(updated);
    await savePlannerItems(updated);
  };

  const startVoice = async () => {
    try {
      if (!isVoiceAvailableModule()) {
        return;
      }

      if (!isFocused) {
        return;
      }

      const available = await isSpeechAvailable();
      if (!available) {
        return;
      }

      await startSpeech('ru-RU');
    } catch (e) {
      console.log(e);
    }
  };

  const stopVoice = async () => {
    if (!isVoiceAvailableModule()) {
      setIsListening(false);
      return;
    }

    await stopSpeech();
    setIsListening(false);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 24 : 12}
      >
        <View style={[styles.container, { paddingBottom: Math.max(18, tabBarHeight - 28) }]}>
          <View style={styles.flex}>
            <View style={styles.headerRow}>
              <View style={styles.titleWrap}>
                <Text style={styles.title}>
                  {isSameDay(selectedDate, today)
                    ? 'Сегодня'
                    : formatLongTitle(selectedDate).replace(/^\p{L}/u, (s) => s.toUpperCase())}
                </Text>
                <Text style={styles.subtitle}>{formatShortDate(selectedDate)}</Text>
              </View>

              <View style={styles.navPill}>
                <TouchableOpacity style={styles.navPillButton} onPress={() => shiftDay(-1)}>
                  <Ionicons name="chevron-back" size={22} color={theme.colors.textSecondary} />
                </TouchableOpacity>

                <View style={styles.navDivider} />

                <TouchableOpacity style={styles.navPillButton} onPress={() => shiftDay(1)}>
                  <Ionicons name="chevron-forward" size={22} color={theme.colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>

            {!isSameDay(selectedDate, today) ? (
              <View style={styles.todayPill}>
                <TouchableOpacity activeOpacity={0.85} onPress={() => setSelectedDate(new Date())}>
                  <Text style={styles.todayPillText}>Сегодня</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {tasks.length > 0 ? (
              <View style={styles.progressRow}>
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${Math.max(progress * 100, 8)}%` },
                    ]}
                  />
                </View>
                <Text style={styles.progressText}>
                  {completedCount}/{tasks.length} выполнено
                </Text>
              </View>
            ) : null}

            {tasks.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyIconWrap}>
                  <Ionicons name="checkbox-outline" size={34} color={theme.colors.successStrong} />
                </View>
                <Text style={styles.emptyTitle}>Нет задач</Text>
                <Text style={styles.emptyText}>Добавьте задачи на этот день</Text>
              </View>
            ) : (
              <DraggableFlatList
                data={tasks}
                keyExtractor={(item) => item.id}
                onDragEnd={({ data }) => reorderTasks(data)}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={[
                  styles.taskList,
                  { paddingBottom: tabBarHeight + 96 },
                ]}
                activationDistance={12}
                renderItem={({ item, drag, isActive }) => {
                  const startedAt = pendingRemovalMap[item.id];
                  const remainingProgress = startedAt
                    ? Math.max(0, 1 - (countdownTick - startedAt) / REMOVE_DELAY_MS)
                    : 0;

                  return (
                    <ScaleDecorator>
                      <View style={[styles.taskCard, isActive && styles.taskCardActive]}>
                        <View style={styles.taskTopRow}>
                          <TouchableOpacity
                            style={styles.taskMain}
                            activeOpacity={0.85}
                            onPress={() => toggleTask(item.id)}
                          >
                            <View style={styles.checkWrap}>
                              <Ionicons
                                name={item.completed ? 'checkbox' : 'square-outline'}
                                size={24}
                                color={theme.colors.successStrong}
                              />
                            </View>

                            <Text style={[styles.taskTitle, item.completed && styles.taskTitleDone]}>
                              {item.task}
                            </Text>
                          </TouchableOpacity>

                          <View style={styles.taskActions}>
                            <TouchableOpacity
                              style={styles.dragHandleButton}
                              activeOpacity={0.7}
                              delayLongPress={180}
                              onLongPress={drag}
                            >
                              <Ionicons
                                name="reorder-three-outline"
                                size={20}
                                color={theme.colors.textMuted}
                              />
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={styles.deleteButton}
                              activeOpacity={0.8}
                              onPress={() => removeTask(item.id)}
                            >
                              <Ionicons
                                name="close"
                                size={18}
                                color={theme.colors.textSecondary}
                              />
                            </TouchableOpacity>
                          </View>
                        </View>

                        {startedAt ? (
                          <View style={styles.pendingRemovalWrap}>
                            <View style={styles.pendingRemovalTrack}>
                              <View
                                style={[
                                  styles.pendingRemovalFill,
                                  { width: `${remainingProgress * 100}%` },
                                ]}
                              />
                            </View>

                            <TouchableOpacity
                              style={styles.undoButton}
                              activeOpacity={0.85}
                              onPress={() => toggleTask(item.id)}
                            >
                              <Text style={styles.undoText}>Отменить</Text>
                            </TouchableOpacity>
                          </View>
                        ) : null}
                      </View>
                    </ScaleDecorator>
                  );
                }}
              />
            )}
          </View>

          <View style={styles.bottomComposer}>
            <TextInput
              value={taskText}
              onChangeText={setTaskText}
              placeholder="Добавить задачу..."
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
              returnKeyType="done"
              onSubmitEditing={addTask}
            />

            <TouchableOpacity style={styles.addButton} activeOpacity={0.85} onPress={addTask}>
              <Ionicons name="add" size={18} color={theme.colors.primary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.micButton, isListening && styles.micButtonActive]}
              activeOpacity={0.85}
              onPress={isListening ? stopVoice : startVoice}
            >
              <Ionicons name="mic" size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function createStyles(theme) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    flex: {
      flex: 1,
    },
    container: {
      flex: 1,
      paddingHorizontal: 18,
      paddingTop: 8,
      justifyContent: 'space-between',
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 16,
    },
    titleWrap: {
      flex: 1,
    },
    title: {
      fontSize: 19,
      fontWeight: '900',
      color: theme.colors.text,
    },
    subtitle: {
      marginTop: 4,
      fontSize: 14,
      color: theme.colors.textMuted,
    },
    navPill: {
      marginTop: 4,
      width: 92,
      height: 42,
      borderRadius: 15,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.cardBorder,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    navPillButton: {
      flex: 1,
      height: '100%',
      alignItems: 'center',
      justifyContent: 'center',
    },
    navDivider: {
      width: 1,
      height: 16,
      backgroundColor: theme.colors.cardBorder,
    },
    todayPill: {
      alignSelf: 'center',
      marginTop: 10,
      paddingHorizontal: 14,
      height: 28,
      borderRadius: 14,
      backgroundColor: theme.colors.overlay,
      alignItems: 'center',
      justifyContent: 'center',
    },
    todayPillText: {
      color: theme.colors.primary,
      fontSize: 13,
      fontWeight: '700',
    },
    progressRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 14,
      marginBottom: 10,
    },
    progressTrack: {
      flex: 1,
      height: 4,
      borderRadius: 999,
      backgroundColor: theme.colors.successSoft,
      overflow: 'hidden',
      marginRight: 12,
    },
    progressFill: {
      height: '100%',
      borderRadius: 999,
      backgroundColor: theme.colors.successStrong,
    },
    progressText: {
      fontSize: 13,
      color: theme.colors.textMuted,
      fontWeight: '600',
    },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 82,
    },
    emptyIconWrap: {
      width: 64,
      height: 64,
      borderRadius: 22,
      backgroundColor: theme.colors.successSoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: theme.colors.text,
    },
    emptyText: {
      marginTop: 10,
      fontSize: 15,
      color: theme.colors.textSoft,
    },
    taskList: {
      paddingTop: 16,
      paddingBottom: 12,
    },
    taskCard: {
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.cardBorder,
      borderRadius: 18,
      paddingLeft: 14,
      paddingRight: 12,
      paddingTop: 12,
      paddingBottom: 12,
      minHeight: 62,
      marginBottom: 10,
    },
    taskCardActive: {
      borderColor: theme.colors.primary,
      shadowColor: theme.colors.shadow,
      shadowOpacity: 0.18,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 6 },
      elevation: 5,
    },
    taskTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    taskMain: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 34,
    },
    checkWrap: {
      marginRight: 10,
    },
    taskTitle: {
      flex: 1,
      color: theme.colors.successStrong,
      fontSize: 15,
      fontWeight: '700',
    },
    taskTitleDone: {
      color: theme.colors.textMuted,
      textDecorationLine: 'line-through',
    },
    taskActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginLeft: 12,
    },
    dragHandleButton: {
      width: 30,
      height: 30,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 10,
    },
    deleteButton: {
      width: 30,
      height: 30,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 10,
    },
    pendingRemovalWrap: {
      marginTop: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingLeft: 34,
    },
    pendingRemovalTrack: {
      flex: 1,
      height: 5,
      borderRadius: 999,
      overflow: 'hidden',
      backgroundColor: theme.colors.cardBorder,
    },
    pendingRemovalFill: {
      height: '100%',
      borderRadius: 999,
      backgroundColor: theme.colors.successStrong,
    },
    undoButton: {
      height: 24,
      paddingHorizontal: 10,
      borderRadius: 12,
      backgroundColor: theme.colors.overlay,
      alignItems: 'center',
      justifyContent: 'center',
    },
    undoText: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.colors.primary,
    },
    bottomComposer: {
      marginTop: 8,
      paddingTop: 6,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    input: {
      flex: 1,
      height: 42,
      borderRadius: 14,
      backgroundColor: theme.colors.surfaceSecondary,
      borderWidth: 1,
      borderColor: theme.colors.cardBorder,
      paddingHorizontal: 14,
      color: theme.colors.text,
      fontSize: 16,
    },
    micButton: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: theme.colors.successStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    micButtonActive: {
      backgroundColor: '#FF5A5F',
    },
    addButton: {
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.cardBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
