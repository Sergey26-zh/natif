import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
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

const HIDE_DELAY_MS = 4000;
const dragListModule = (() => {
  try {
    return require('react-native-draggable-flatlist');
  } catch (error) {
    return null;
  }
})();

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

function formatHistoryDate(dayKey) {
  const date = new Date(`${dayKey}T12:00:00`);
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
  const [viewMode, setViewMode] = useState('active');
  const pendingTimeoutsRef = useRef({});

  const selectedDayKey = createDayKey(selectedDate);

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
        if (e?.value?.length) {
          setTaskText(e.value[0]);
        }
      },
      onSpeechPartialResults: (e) => {
        if (e?.value?.length) {
          setTaskText(e.value[0]);
        }
      },
      onSpeechStart: () => setIsListening(true),
      onSpeechEnd: () => setIsListening(false),
      onSpeechError: () => setIsListening(false),
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

  const activeTasks = useMemo(
    () =>
      items
        .filter(
          (item) =>
            item.type === 'task' &&
            item.dayKey === selectedDayKey &&
            !item.archivedCompleted
        )
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [items, selectedDayKey]
  );

  const historyTasks = useMemo(
    () =>
      items
        .filter((item) => item.type === 'task' && item.completed && item.archivedCompleted)
        .sort(
          (a, b) => new Date(b.completedAt || b.createdAt) - new Date(a.completedAt || a.createdAt)
        ),
    [items]
  );

  const currentList = viewMode === 'history' ? historyTasks : activeTasks;
  const showGoToday = viewMode === 'active' && !isSameDay(selectedDate, today);
  const completedCount = activeTasks.filter((item) => item.completed).length;
  const progress = activeTasks.length ? completedCount / activeTasks.length : 0;
  const useDragList = Boolean(
    dragListModule &&
      viewMode === 'active' &&
      activeTasks.length > 1 &&
      Platform.OS !== 'android'
  );
  const ActiveListComponent = useDragList ? dragListModule.default : FlatList;

  async function load() {
    const list = await loadPlannerItems();
    setItems(Array.isArray(list) ? list : []);
  }

  async function persistItems(nextItems) {
    setItems(nextItems);
    await savePlannerItems(nextItems);
  }

  function shiftDay(delta) {
    const next = new Date(selectedDate);
    next.setDate(selectedDate.getDate() + delta);
    setSelectedDate(next);
  }

  async function addTask() {
    const normalized = taskText.trim();
    if (!normalized) {
      return;
    }

    const nextTask = buildTaskItem(normalized, selectedDate);
    const updated = [nextTask, ...items];
    setItems(updated);
    setTaskText('');
    await savePlannerItems(updated);
  }

  function clearPendingTimeout(id) {
    if (pendingTimeoutsRef.current[id]) {
      clearTimeout(pendingTimeoutsRef.current[id]);
      delete pendingTimeoutsRef.current[id];
    }
  }

  function archiveTaskAfterDelay(taskId) {
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
  }

  async function toggleTask(id) {
    const currentTask = items.find((item) => item.id === id && item.type === 'task');
    if (!currentTask) {
      return;
    }

    const shouldComplete = !currentTask.completed;
    const completedAt = shouldComplete ? new Date().toISOString() : null;
    const updated = items.map((item) =>
      item.id === id && item.type === 'task'
        ? {
            ...item,
            completed: shouldComplete,
            completedAt,
            archivedCompleted: false,
          }
        : item
    );

    await persistItems(updated);

    if (shouldComplete) {
      archiveTaskAfterDelay(id);
    } else {
      clearPendingTimeout(id);
    }
  }

  async function restoreTask(id) {
    clearPendingTimeout(id);
    const updated = items.map((item) =>
      item.id === id && item.type === 'task'
        ? {
            ...item,
            completed: false,
            completedAt: null,
            archivedCompleted: false,
          }
        : item
    );
    await persistItems(updated);
  }

  async function removeTask(id) {
    clearPendingTimeout(id);
    const updated = items.filter((item) => item.id !== id);
    await persistItems(updated);
  }

  async function reorderTasks(orderedTasks) {
    const reorderedTasks = orderedTasks.map((task, index) => ({
      ...task,
      sortOrder: index,
    }));
    const otherItems = items.filter(
      (item) =>
        !(item.type === 'task' && item.dayKey === selectedDayKey && !item.archivedCompleted)
    );
    await persistItems([...reorderedTasks, ...otherItems]);
  }

  async function startVoiceCapture() {
    try {
      if (!isVoiceAvailableModule() || !isFocused) {
        return;
      }

      const available = await isSpeechAvailable();
      if (!available) {
        return;
      }

      setIsListening(true);
      await startSpeech('ru-RU');
    } catch (error) {
      setIsListening(false);
      console.log(error);
    }
  }

  async function stopVoiceCapture() {
    if (!isVoiceAvailableModule()) {
      setIsListening(false);
      return;
    }

    await stopSpeech();
    setIsListening(false);
  }

  function renderActiveTask({ item, drag, isActive }) {
    return (
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
            <Text style={[styles.taskTitle, item.completed && styles.taskTitleDone]}>{item.task}</Text>
          </TouchableOpacity>

          <View style={styles.taskActions}>
            {useDragList ? (
              <TouchableOpacity
                style={styles.dragHandleButton}
                activeOpacity={0.7}
                delayLongPress={180}
                onLongPress={drag || undefined}
                disabled={!drag}
              >
                <Ionicons name="reorder-three-outline" size={20} color={theme.colors.textMuted} />
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={styles.deleteButton}
              activeOpacity={0.8}
              onPress={() => removeTask(item.id)}
            >
              <Ionicons name="trash-outline" size={16} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  function renderHistoryTask({ item }) {
    return (
      <View style={styles.taskCard}>
        <TouchableOpacity
          style={styles.taskMain}
          activeOpacity={0.85}
          onPress={() => restoreTask(item.id)}
        >
          <View style={styles.checkWrap}>
            <Ionicons name="checkbox" size={24} color={theme.colors.successStrong} />
          </View>

          <View style={styles.historyTextWrap}>
            <Text style={[styles.taskTitle, styles.taskTitleDone]}>{item.task}</Text>
            <Text style={styles.historySubtitle}>{formatHistoryDate(item.dayKey)}</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.deleteButton}
          activeOpacity={0.8}
          onPress={() => removeTask(item.id)}
        >
          <Ionicons name="trash-outline" size={16} color={theme.colors.textMuted} />
        </TouchableOpacity>
      </View>
    );
  }

  function renderEmpty() {
    return (
      <View style={styles.emptyState}>
        <View style={styles.emptyIconWrap}>
          <Ionicons
            name={viewMode === 'history' ? 'time-outline' : 'checkbox-outline'}
            size={34}
            color={theme.colors.successStrong}
          />
        </View>
        <Text style={styles.emptyTitle}>{viewMode === 'history' ? 'История пуста' : 'Нет задач'}</Text>
        <Text style={styles.emptyText}>
          {viewMode === 'history'
            ? 'Здесь будут выполненные задачи'
            : 'Добавьте задачи на этот день'}
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 24 : 12}
      >
        <View style={[styles.container, { paddingBottom: tabBarHeight - 40 }]}>
          <View style={styles.headerRow}>
            <View style={styles.titleWrap}>
              <Text style={styles.title}>
                {viewMode === 'history'
                  ? 'История'
                  : isSameDay(selectedDate, today)
                    ? 'Сегодня'
                    : formatLongTitle(selectedDate).replace(/^\p{L}/u, (s) => s.toUpperCase())}
              </Text>
              <Text style={styles.subtitle}>
                {viewMode === 'history' ? 'Выполненные задачи' : formatShortDate(selectedDate)}
              </Text>
            </View>

            <View style={styles.headerSide}>
              <View style={styles.headerActions}>
                <TouchableOpacity
                  style={[styles.historyButton, viewMode === 'history' && styles.historyButtonActive]}
                  activeOpacity={0.85}
                  onPress={() => setViewMode((current) => (current === 'history' ? 'active' : 'history'))}
                >
                  <Ionicons
                    name={viewMode === 'history' ? 'arrow-undo-outline' : 'time-outline'}
                    size={18}
                    color={viewMode === 'history' ? '#FFFFFF' : theme.colors.textSecondary}
                  />
                </TouchableOpacity>

                {viewMode === 'active' ? (
                  <View style={styles.navPill}>
                    <TouchableOpacity style={styles.navPillButton} onPress={() => shiftDay(-1)}>
                      <Ionicons name="chevron-back" size={22} color={theme.colors.textSecondary} />
                    </TouchableOpacity>
                    <View style={styles.navDivider} />
                    <TouchableOpacity style={styles.navPillButton} onPress={() => shiftDay(1)}>
                      <Ionicons name="chevron-forward" size={22} color={theme.colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>

              <View style={styles.todaySlot}>
                {showGoToday ? (
                  <View style={styles.todayPill}>
                    <TouchableOpacity activeOpacity={0.85} onPress={() => setSelectedDate(new Date())}>
                      <Text style={styles.todayPillText}>Сегодня</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            </View>
          </View>

          {viewMode === 'active' && activeTasks.length > 0 ? (
            <View style={styles.progressRow}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${Math.max(progress * 100, 8)}%` }]} />
              </View>
              <Text style={styles.progressText}>
                {completedCount}/{activeTasks.length} выполнено
              </Text>
            </View>
          ) : null}

          <View style={styles.listArea}>
            {currentList.length === 0 ? (
              renderEmpty()
            ) : viewMode === 'active' ? (
              <ActiveListComponent
                data={currentList}
                keyExtractor={(item) => item.id}
                style={styles.listViewport}
                onDragEnd={useDragList ? ({ data }) => reorderTasks(data) : undefined}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={[styles.taskList, { paddingBottom: tabBarHeight + 84 }]}
                activationDistance={useDragList ? 12 : undefined}
                extraData={{ items, viewMode }}
                renderItem={renderActiveTask}
              />
            ) : (
              <FlatList
                data={currentList}
                keyExtractor={(item) => item.id}
                style={styles.listViewport}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={[styles.taskList, { paddingBottom: tabBarHeight + 12 }]}
                extraData={{ items, viewMode }}
                renderItem={renderHistoryTask}
              />
            )}
          </View>

          {viewMode === 'active' ? (
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
                onPress={isListening ? stopVoiceCapture : startVoiceCapture}
              >
                <Ionicons name="mic" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          ) : null}
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
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 14,
      minHeight: 92,
    },
    titleWrap: {
      flex: 1,
      minHeight: 66,
    },
    title: {
      fontSize: 19,
      lineHeight: 24,
      fontWeight: '900',
      color: theme.colors.text,
    },
    subtitle: {
      marginTop: 4,
      fontSize: 14,
      color: theme.colors.textMuted,
    },
    headerSide: {
      alignItems: 'flex-end',
      minHeight: 84,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    historyButton: {
      marginTop: 4,
      width: 42,
      height: 42,
      borderRadius: 15,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.cardBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    historyButtonActive: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
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
    todaySlot: {
      marginTop: 10,
      width: 92,
      height: 24,
      alignItems: 'flex-end',
      justifyContent: 'flex-start',
    },
    todayPill: {
      width: 92,
      height: 22,
      borderRadius: 12,
      backgroundColor: theme.colors.overlay,
      alignItems: 'center',
      justifyContent: 'center',
    },
    todayPillText: {
      color: theme.colors.primary,
      fontSize: 12,
      fontWeight: '700',
    },
    progressRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 2,
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
    listArea: {
      flex: 1,
      minHeight: 0,
    },
    listViewport: {
      flex: 1,
    },
    taskList: {
      paddingTop: 4,
    },
    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingBottom: 20,
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
      flexDirection: 'row',
      alignItems: 'center',
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
      flex: 1,
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
    historyTextWrap: {
      flex: 1,
    },
    historySubtitle: {
      marginTop: 4,
      fontSize: 13,
      color: theme.colors.textMuted,
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
      width: 26,
      height: 26,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 8,
      marginLeft: 8,
    },
    bottomComposer: {
      marginTop: 10,
      paddingTop: 4,
      paddingBottom: 4,
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
