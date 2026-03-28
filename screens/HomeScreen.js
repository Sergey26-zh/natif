import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import {
  buildTaskItem,
  createDayKey,
  isSameDay,
  loadPlannerItems,
  savePlannerItems,
} from '../utils/planner';

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
  const today = useMemo(() => new Date(), []);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [items, setItems] = useState([]);
  const [taskText, setTaskText] = useState('');

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

  const tasks = useMemo(
    () =>
      items.filter(
        (item) => item.type === 'task' && item.dayKey === createDayKey(selectedDate)
      ),
    [items, selectedDate]
  );

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

    const updated = [buildTaskItem(normalized, selectedDate), ...items];
    setItems(updated);
    setTaskText('');
    await savePlannerItems(updated);
  };

  const toggleTask = async (id) => {
    const updated = items.map((item) =>
      item.id === id && item.type === 'task'
        ? { ...item, completed: !item.completed }
        : item
    );

    setItems(updated);
    await savePlannerItems(updated);
  };

  const removeTask = async (id) => {
    const updated = items.filter((item) => item.id !== id);
    setItems(updated);
    await savePlannerItems(updated);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 24 : 12}
      >
        <View style={[styles.container, { paddingBottom: Math.max(10, tabBarHeight - 54) }]}>
          <View style={styles.flex}>
            <View style={styles.navRow}>
              <TouchableOpacity style={styles.navButton} onPress={() => shiftDay(-1)}>
                <Ionicons name="chevron-back" size={20} color="#667091" />
              </TouchableOpacity>

              <View style={styles.titleWrap}>
                <Text style={styles.title}>
                  {formatLongTitle(selectedDate).replace(/^\p{L}/u, (s) => s.toUpperCase())}
                </Text>
                <Text style={styles.subtitle}>{formatShortDate(selectedDate)}</Text>
              </View>

              <TouchableOpacity style={styles.navButton} onPress={() => shiftDay(1)}>
                <Ionicons name="chevron-forward" size={20} color="#667091" />
              </TouchableOpacity>
            </View>

            {isSameDay(selectedDate, today) ? (
              <View style={styles.todayPill}>
                <Text style={styles.todayPillText}>Сегодня</Text>
              </View>
            ) : null}

            {tasks.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyIconWrap}>
                  <Ionicons name="checkbox-outline" size={34} color="#6F49FF" />
                </View>
                <Text style={styles.emptyTitle}>Нет задач</Text>
                <Text style={styles.emptyText}>Добавьте задачи на этот день</Text>
              </View>
            ) : (
              <FlatList
                data={tasks}
                keyExtractor={(item) => item.id}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.taskList}
                renderItem={({ item }) => (
                  <View style={styles.taskCard}>
                    <TouchableOpacity
                      style={styles.taskMain}
                      activeOpacity={0.85}
                      onPress={() => toggleTask(item.id)}
                    >
                      <View style={styles.checkWrap}>
                        <Ionicons
                          name={item.completed ? 'checkmark-circle' : 'checkbox-outline'}
                          size={22}
                          color="#6F49FF"
                        />
                      </View>
                      <Text
                        style={[styles.taskTitle, item.completed && styles.taskTitleDone]}
                      >
                        {item.task}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.deleteButton}
                      activeOpacity={0.8}
                      onPress={() => removeTask(item.id)}
                    >
                      <Ionicons name="close" size={18} color="#7B85A4" />
                    </TouchableOpacity>
                  </View>
                )}
              />
            )}
          </View>

          <View style={styles.bottomComposer}>
            <TextInput
              value={taskText}
              onChangeText={setTaskText}
              placeholder="Добавить задачу..."
              placeholderTextColor="#A5AEC6"
              style={styles.input}
              returnKeyType="done"
              onSubmitEditing={addTask}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F5F6FF',
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
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleWrap: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  title: {
    fontSize: 19,
    fontWeight: '900',
    color: '#151827',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    color: '#A0A7C0',
  },
  todayPill: {
    alignSelf: 'center',
    marginTop: 10,
    paddingHorizontal: 14,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ECE7FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  todayPillText: {
    color: '#6F49FF',
    fontSize: 13,
    fontWeight: '700',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 110,
  },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 22,
    backgroundColor: '#EFEAFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#151827',
  },
  emptyText: {
    marginTop: 10,
    fontSize: 15,
    color: '#8F97B2',
  },
  taskList: {
    paddingTop: 28,
    paddingBottom: 12,
  },
  taskCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7E9F6',
    borderRadius: 18,
    paddingHorizontal: 14,
    height: 62,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  taskMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkWrap: {
    marginRight: 10,
  },
  taskTitle: {
    flex: 1,
    color: '#151827',
    fontSize: 15,
    fontWeight: '700',
  },
  taskTitleDone: {
    color: '#99A2BC',
    textDecorationLine: 'line-through',
  },
  deleteButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomComposer: {
    paddingTop: 14,
  },
  input: {
    height: 42,
    borderRadius: 14,
    backgroundColor: '#EEF0FF',
    borderWidth: 1,
    borderColor: '#E4E6F7',
    paddingHorizontal: 14,
    color: '#151827',
    fontSize: 16,
  },
});
