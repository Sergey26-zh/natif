import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Notifications from 'expo-notifications';
import * as chrono from 'chrono-node';
import Voice from 'react-native-voice';
import { LinearGradient } from 'expo-linear-gradient';
import {
  buildReminderItem,
  loadPlannerItems,
  savePlannerItems,
} from '../utils/planner';

const QUICK_EXAMPLES = [
  'Позвонить врачу через 2 часа',
  'Купить продукты завтра в 18:00',
  'Встреча в пятницу в 10 утра',
];

const REMINDER_JOINERS = /^(и|а|затем|потом|после этого|и потом)\s+/i;

function formatCurrentDate(date) {
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
  });
}

function cleanTask(value) {
  return value
    .replace(/\s+/g, ' ')
    .replace(/^[,.;:!?-]+/, '')
    .replace(/[,.;:!?-]+$/, '')
    .replace(REMINDER_JOINERS, '')
    .replace(/\s+(и|а|затем|потом)$/i, '')
    .trim();
}

function extractQuickReminders(sourceText) {
  const parsed = chrono.ru.parse(sourceText, new Date(), { forwardDate: true });

  if (!parsed.length) {
    return [];
  }

  return parsed
    .map((result, index) => {
      const prevEnd =
        index > 0 ? parsed[index - 1].index + parsed[index - 1].text.length : 0;
      const currentEnd = result.index + result.text.length;
      const nextIndex =
        index < parsed.length - 1 ? parsed[index + 1].index : sourceText.length;

      const primarySegment = sourceText.slice(prevEnd, currentEnd);
      const fallbackSegment = sourceText.slice(result.index, nextIndex);

      let task = cleanTask(primarySegment.replace(result.text, ' '));

      if (!task) {
        task = cleanTask(fallbackSegment.replace(result.text, ' '));
      }

      if (!task) {
        task = 'Напоминание';
      }

      return {
        task,
        date: result.start.date(),
      };
    })
    .filter((item) => item.task && item.date);
}

export default function AddReminderScreen() {
  const tabBarHeight = useBottomTabBarHeight();
  const [mode, setMode] = useState('quick');
  const [text, setText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [hour, setHour] = useState(12);
  const [minute, setMinute] = useState(0);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseRing = useRef(new Animated.Value(0.25)).current;
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTranslateY = useRef(new Animated.Value(-12)).current;

  useEffect(() => {
    const now = new Date();
    setHour(now.getHours());
    setMinute(now.getMinutes());
  }, []);

  useEffect(() => {
    let hideTimer;

    if (toastMessage) {
      Animated.parallel([
        Animated.timing(toastOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(toastTranslateY, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();

      hideTimer = setTimeout(() => {
        Animated.parallel([
          Animated.timing(toastOpacity, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(toastTranslateY, {
            toValue: -12,
            duration: 200,
            useNativeDriver: true,
          }),
        ]).start(({ finished }) => {
          if (finished) {
            setToastMessage('');
          }
        });
      }, 1800);
    }

    return () => {
      if (hideTimer) {
        clearTimeout(hideTimer);
      }
    };
  }, [toastMessage, toastOpacity, toastTranslateY]);

  useEffect(() => {
    let animation;

    if (isListening) {
      animation = Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(pulseScale, {
              toValue: 1.08,
              duration: 500,
              useNativeDriver: true,
              easing: Easing.out(Easing.ease),
            }),
            Animated.timing(pulseScale, {
              toValue: 1,
              duration: 500,
              useNativeDriver: true,
              easing: Easing.in(Easing.ease),
            }),
          ]),
          Animated.sequence([
            Animated.timing(pulseRing, {
              toValue: 1,
              duration: 1000,
              useNativeDriver: true,
              easing: Easing.out(Easing.ease),
            }),
            Animated.timing(pulseRing, {
              toValue: 0.25,
              duration: 0,
              useNativeDriver: true,
            }),
          ]),
        ])
      );

      animation.start();
    } else {
      pulseScale.stopAnimation();
      pulseRing.stopAnimation();
      pulseScale.setValue(1);
      pulseRing.setValue(0.25);
    }

    return () => {
      if (animation) {
        animation.stop();
      }
    };
  }, [isListening, pulseRing, pulseScale]);

  useEffect(() => {
    Voice.onSpeechResults = (e) => {
      if (e.value?.length) {
        setText(e.value[0]);
      }
    };

    Voice.onSpeechPartialResults = (e) => {
      if (e.value?.length) {
        setText(e.value[0]);
      }
    };

    Voice.onSpeechStart = () => setIsListening(true);
    Voice.onSpeechEnd = () => setIsListening(false);

    return () => {
      Voice.destroy().then(Voice.removeAllListeners);
    };
  }, []);

  const startVoice = async () => {
    try {
      const available = await Voice.isAvailable();
      if (!available) {
        alert('Голосовой ввод недоступен');
        return;
      }
      await Voice.start('ru-RU');
    } catch (e) {
      console.log(e);
    }
  };

  const stopVoice = async () => {
    await Voice.stop();
    setIsListening(false);
  };

  const appendReminder = async (item) => {
    const existing = await loadPlannerItems();
    await savePlannerItems([item, ...existing]);
  };

  const saveReminder = async (task, date) => {
    const normalizedTask = task.trim();
    const diff = Math.floor((date.getTime() - Date.now()) / 1000);

    if (!normalizedTask) {
      alert('Введите текст напоминания');
      return false;
    }

    if (diff <= 0) {
      alert('Выберите время в будущем');
      return false;
    }

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Напоминание',
        body: normalizedTask,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date,
        channelId: 'default',
      },
    });

    await appendReminder(buildReminderItem(normalizedTask, date, notificationId));
    return true;
  };

  const addQuick = async () => {
    const reminders = extractQuickReminders(text);

    if (!reminders.length) {
      alert('Не удалось распознать время');
      return;
    }

    let savedCount = 0;

    for (const reminder of reminders) {
      const saved = await saveReminder(reminder.task, reminder.date);
      if (saved) {
        savedCount += 1;
      }
    }

    if (savedCount > 0) {
      setText('');
      setToastMessage(
        savedCount === 1 ? 'Напоминание добавлено' : `Добавлено: ${savedCount}`
      );
    }
  };

  const addExact = async () => {
    const date = new Date(selectedDate);
    date.setHours(hour);
    date.setMinutes(minute);
    date.setSeconds(0);
    date.setMilliseconds(0);

    const saved = await saveReminder(text, date);

    if (saved) {
      setText('');
      setToastMessage('Напоминание добавлено');
    }
  };

  const ringOpacity = pulseRing.interpolate({
    inputRange: [0.25, 1],
    outputRange: [0.32, 0],
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {toastMessage ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.toast,
            {
              opacity: toastOpacity,
              transform: [{ translateY: toastTranslateY }],
            },
          ]}
        >
          <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
          <Text style={styles.toastText}>{toastMessage}</Text>
        </Animated.View>
      ) : null}

      <View style={[styles.content, { paddingBottom: Math.max(8, tabBarHeight - 58) }]}>
        <View>
          <Text style={styles.title}>Новое напоминание</Text>

          <View style={styles.segment}>
            <TouchableOpacity
              style={[styles.segmentOption, mode === 'quick' && styles.segmentActive]}
              onPress={() => setMode('quick')}
              activeOpacity={0.9}
            >
              {mode === 'quick' ? (
                <LinearGradient
                  colors={['#6F49FF', '#8A58FF']}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={styles.segmentGradient}
                >
                  <Text style={[styles.segmentText, styles.segmentTextActive]}>Быстро</Text>
                </LinearGradient>
              ) : (
                <Text style={styles.segmentText}>Быстро</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.segmentOption, mode === 'exact' && styles.segmentActive]}
              onPress={() => setMode('exact')}
              activeOpacity={0.9}
            >
              {mode === 'exact' ? (
                <LinearGradient
                  colors={['#6F49FF', '#8A58FF']}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={styles.segmentGradient}
                >
                  <Text style={[styles.segmentText, styles.segmentTextActive]}>Точно</Text>
                </LinearGradient>
              ) : (
                <Text style={styles.segmentText}>Точно</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={[styles.inputCard, isListening && styles.inputCardListening]}>
            <TextInput
              placeholder="Напишите или надиктуйте напоминание"
              placeholderTextColor="#A4AAC2"
              style={styles.input}
              value={text}
              onChangeText={setText}
              multiline
              textAlignVertical="top"
            />

            {mode === 'quick' && isListening ? (
              <Text style={styles.recordingText}>● Запись...</Text>
            ) : null}
          </View>

          {mode === 'quick' ? (
            <>
              <View style={styles.voiceBlock}>
                <View style={styles.micWrap}>
                  {isListening ? (
                    <Animated.View
                      pointerEvents="none"
                      style={[
                        styles.micPulseRing,
                        {
                          opacity: ringOpacity,
                          transform: [{ scale: pulseRing }],
                        },
                      ]}
                    />
                  ) : null}

                  <TouchableOpacity
                    onPress={isListening ? stopVoice : startVoice}
                    activeOpacity={0.88}
                  >
                    <Animated.View
                      style={[
                        styles.micButton,
                        isListening && styles.micButtonActive,
                        { transform: [{ scale: pulseScale }] },
                      ]}
                    >
                      <Ionicons name="mic" size={24} color="#FFFFFF" />
                    </Animated.View>
                  </TouchableOpacity>
                </View>

                <Text style={styles.voiceHint}>
                  {isListening
                    ? 'Нажмите ещё раз, чтобы остановить'
                    : 'Нажмите для голосового ввода'}
                </Text>
              </View>

              {!isListening ? (
                <View style={styles.examples}>
                  <Text style={styles.examplesLabel}>Примеры:</Text>
                  {QUICK_EXAMPLES.map((example) => (
                    <TouchableOpacity
                      key={example}
                      style={styles.exampleChip}
                      activeOpacity={0.85}
                      onPress={() => setText(example)}
                    >
                      <Ionicons name="arrow-forward" size={14} color="#8B92B0" />
                      <Text style={styles.exampleText} numberOfLines={1}>
                        {example}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
            </>
          ) : (
            <View style={styles.exactRow}>
              <TouchableOpacity
                style={styles.infoChip}
                activeOpacity={0.85}
                onPress={() => setShowDatePicker(true)}
              >
                <Ionicons name="calendar-outline" size={16} color="#6F49FF" />
                <Text style={styles.infoChipText}>{formatCurrentDate(selectedDate)}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.infoChip}
                activeOpacity={0.85}
                onPress={() => setShowTimePicker(true)}
              >
                <Ionicons name="time-outline" size={16} color="#6F49FF" />
                <Text style={styles.infoChipText}>
                  {String(hour).padStart(2, '0')}:{String(minute).padStart(2, '0')}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <TouchableOpacity
          onPress={mode === 'quick' ? addQuick : addExact}
          activeOpacity={0.88}
        >
          <LinearGradient
            colors={['#6236FF', '#9D4DFF']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.button}
          >
            <Ionicons name="checkmark" size={20} color="#FFFFFF" />
            <Text style={styles.buttonText}>Добавить напоминание</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {showDatePicker ? (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          onChange={(_, pickedDate) => {
            setShowDatePicker(false);
            if (!pickedDate) {
              return;
            }

            const nextDate = new Date(selectedDate);
            nextDate.setFullYear(
              pickedDate.getFullYear(),
              pickedDate.getMonth(),
              pickedDate.getDate()
            );
            setSelectedDate(nextDate);
          }}
        />
      ) : null}

      {showTimePicker ? (
        <DateTimePicker
          value={new Date(2026, 0, 1, hour, minute)}
          mode="time"
          is24Hour
          onChange={(_, selectedTime) => {
            setShowTimePicker(false);
            if (!selectedTime) {
              return;
            }

            setHour(selectedTime.getHours());
            setMinute(selectedTime.getMinutes());
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F6FF',
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
  },
  toast: {
    position: 'absolute',
    top: 12,
    left: 20,
    right: 20,
    zIndex: 20,
    height: 46,
    borderRadius: 16,
    backgroundColor: '#171A2A',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  toastText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  title: {
    fontSize: 26,
    lineHeight: 30,
    fontWeight: '900',
    color: '#151827',
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 4,
    borderWidth: 1,
    borderColor: '#E8E9F6',
    marginTop: 16,
  },
  segmentOption: {
    flex: 1,
    borderRadius: 13,
    overflow: 'hidden',
  },
  segmentActive: {
    shadowColor: '#6F49FF',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  segmentGradient: {
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentText: {
    textAlign: 'center',
    color: '#707898',
    fontSize: 14,
    fontWeight: '700',
    paddingVertical: 11,
  },
  segmentTextActive: {
    color: '#FFFFFF',
    paddingVertical: 0,
  },
  inputCard: {
    minHeight: 112,
    marginTop: 16,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7E9F7',
  },
  inputCardListening: {
    borderColor: '#7D5CFF',
  },
  input: {
    minHeight: Platform.OS === 'android' ? 64 : 70,
    fontSize: 16,
    lineHeight: 22,
    color: '#151827',
  },
  recordingText: {
    marginTop: 6,
    color: '#FF5A5F',
    fontSize: 14,
    fontWeight: '600',
  },
  voiceBlock: {
    alignItems: 'center',
    marginTop: 12,
  },
  micWrap: {
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micPulseRing: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#FF8A92',
  },
  micButton: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#7B51FF',
    shadowColor: '#7B51FF',
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  micButtonActive: {
    backgroundColor: '#FF5A5F',
    shadowColor: '#FF5A5F',
  },
  voiceHint: {
    marginTop: 4,
    fontSize: 13,
    color: '#A0A7BF',
    textAlign: 'center',
  },
  examples: {
    marginTop: 20,
  },
  examplesLabel: {
    marginBottom: 8,
    color: '#A0A7BF',
    fontSize: 13,
    fontWeight: '700',
  },
  exampleChip: {
    height: 40,
    borderRadius: 14,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F2F4FF',
    borderWidth: 1,
    borderColor: '#E6E9FA',
    marginBottom: 8,
  },
  exampleText: {
    flex: 1,
    fontSize: 14,
    color: '#667091',
  },
  exactRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
    marginBottom: 10,
  },
  infoChip: {
    flex: 1,
    height: 50,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7E9F7',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  infoChipText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1B2235',
  },
  button: {
    height: 54,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
});
