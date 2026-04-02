import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { useIsFocused } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Notifications from 'expo-notifications';
import * as chrono from 'chrono-node';
import { LinearGradient } from 'expo-linear-gradient';
import {
  buildReminderItem,
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

const IMPORTANCE_OPTIONS = [
  { key: 'low', label: 'Низкая', color: '#AAB2CC' },
  { key: 'medium', label: 'Средняя', color: '#6F49FF' },
  { key: 'high', label: 'Высокая', color: '#FF5A5F' },
];

const DAY_WORDS = new Set(['сегодня', 'завтра', 'послезавтра']);
const LEADING_CONNECTOR =
  /^(?:и|а|затем|потом|после этого|и потом)\b[\s,.;:!?-]*/i;
const TRAILING_CONNECTOR = /[\s,.;:!?-]*(?:и|а|затем|потом)$/i;
const GARBAGE_TASK_RE =
  /^(?:и|а|или|либо|затем|потом|после этого|и потом)$/i;

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
    .replace(LEADING_CONNECTOR, '')
    .replace(TRAILING_CONNECTOR, '')
    .trim();
}

function isMeaningfulTask(value) {
  if (!value) {
    return false;
  }

  if (value.length < 3) {
    return false;
  }

  return !GARBAGE_TASK_RE.test(value);
}

function normalizeQuickDateText(sourceText) {
  return sourceText
    .replace(
      /(^|\s)сегодня\s+(?=через\s+\d+\s*(?:минут\w*|час\w*|день|дня|дней|недел\w*))/gi,
      '$1'
    )
    .replace(
      /(через\s+\d+\s*(?:минут\w*|час\w*|день|дня|дней|недел\w*))\s+сегодня(?:\s|$)/gi,
      '$1 '
    )
    .replace(/\s+/g, ' ')
    .trim();
}

function hasExplicitCalendarValues(result) {
  return ['day', 'weekday', 'month', 'year'].some((key) =>
    Object.prototype.hasOwnProperty.call(result.start.knownValues, key)
  );
}

function hasExplicitTimeValues(result) {
  return ['hour', 'minute', 'meridiem'].some((key) =>
    Object.prototype.hasOwnProperty.call(result.start.knownValues, key)
  );
}

function parseDates(sourceText) {
  const rawResults = chrono.ru
    .parse(sourceText, new Date(), { forwardDate: true })
    .sort((a, b) => a.index - b.index);

  const normalizedResults = [];

  for (let index = 0; index < rawResults.length; index += 1) {
    const current = rawResults[index];
    const next = rawResults[index + 1];
    const previous = rawResults[index - 1];
    const currentText = current.text.trim().toLowerCase();
    const nextText = next?.text.trim().toLowerCase() || '';
    const previousText = previous?.text.trim().toLowerCase() || '';

    if (DAY_WORDS.has(currentText)) {
      if (nextText.startsWith('через') || previousText.startsWith('через')) {
        continue;
      }

      const nextHasExplicitCalendar = !!next && hasExplicitCalendarValues(next);

      if (next && !nextHasExplicitCalendar) {
        const mergedDate = next.start.date();
        const dayDate = current.start.date();

        mergedDate.setFullYear(
          dayDate.getFullYear(),
          dayDate.getMonth(),
          dayDate.getDate()
        );

        normalizedResults.push({
          text: `${current.text} ${next.text}`,
          index: current.index,
          endIndex: next.index + next.text.length,
          prefixEnd: current.index + current.text.length,
          suffixStart: next.index,
          date: mergedDate,
        });

        index += 1;
        continue;
      }
    }

    if (next && hasExplicitCalendarValues(current) && hasExplicitTimeValues(next)) {
      const mergedDate = new Date(current.start.date());
      const nextDate = next.start.date();

      mergedDate.setHours(
        nextDate.getHours(),
        nextDate.getMinutes(),
        nextDate.getSeconds(),
        nextDate.getMilliseconds()
      );

      normalizedResults.push({
        text: `${current.text} ${next.text}`,
        index: current.index,
        endIndex: next.index + next.text.length,
        prefixEnd: current.index + current.text.length,
        suffixStart: next.index,
        date: mergedDate,
      });

      index += 1;
      continue;
    }

    normalizedResults.push({
      text: current.text,
      index: current.index,
      endIndex: current.index + current.text.length,
      prefixEnd: current.index + current.text.length,
      suffixStart: current.index,
      date: current.start.date(),
    });
  }

  return normalizedResults;
}

function splitIntoReminderClauses(sourceText) {
  const normalizedText = sourceText.replace(/\s+/g, ' ').trim();

  if (!normalizedText) {
    return [];
  }

  const pieces = normalizedText
    .split(/\s+(?:и потом|после этого|затем|потом|и|а)\s+/gi)
    .map((part) => part.trim())
    .filter(Boolean);

  if (pieces.length <= 1) {
    return [normalizedText];
  }

  const clauses = [];
  let currentClause = pieces[0];
  let currentHasDate = parseDates(currentClause).length > 0;

  for (let index = 1; index < pieces.length; index += 1) {
    const nextPiece = pieces[index];
    const nextHasDate = parseDates(nextPiece).length > 0;

    if (currentHasDate && nextHasDate) {
      clauses.push(currentClause.trim());
      currentClause = nextPiece;
      currentHasDate = true;
      continue;
    }

    currentClause = `${currentClause} ${nextPiece}`.trim();
    currentHasDate = currentHasDate || nextHasDate;
  }

  clauses.push(currentClause.trim());

  return clauses.filter(Boolean);
}

function extractRemindersFromClause(sourceText) {
  const parsed = parseDates(sourceText);

  if (!parsed.length) {
    return [];
  }

  return parsed
    .map((result, index) => {
      const previousEnd = index > 0 ? parsed[index - 1].endIndex : 0;
      const nextIndex = index < parsed.length - 1 ? parsed[index + 1].index : sourceText.length;

      const beforeTime = cleanTask(sourceText.slice(previousEnd, result.index));
      const middleTask = cleanTask(
        sourceText.slice(result.prefixEnd || result.endIndex, result.suffixStart || result.index)
      );
      const currentWindow = cleanTask(
        `${sourceText.slice(previousEnd, result.index)} ${sourceText.slice(
          result.endIndex,
          nextIndex
        )}`
      );
      const beforeOnly = cleanTask(sourceText.slice(0, result.index));

      const candidates = [middleTask, beforeTime, currentWindow, index === 0 ? beforeOnly : ''];
      const task = candidates.find(isMeaningfulTask) || 'Напоминание';

      return {
        task,
        date: result.date,
      };
    })
    .filter((item) => (isMeaningfulTask(item.task) || item.task === 'Напоминание') && item.date);
}

function extractQuickReminders(sourceText) {
  const normalizedText = normalizeQuickDateText(sourceText);
  return splitIntoReminderClauses(normalizedText).flatMap(extractRemindersFromClause);
}

export default function AddReminderScreen() {
  const tabBarHeight = useBottomTabBarHeight();
  const isFocused = useIsFocused();
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [mode, setMode] = useState('quick');
  const [text, setText] = useState('');
  const [importance, setImportance] = useState('medium');
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
    if (!isVoiceAvailableModule()) {
      return undefined;
    }

    if (!isFocused) {
      setIsListening(false);
      removeVoiceListeners();
      return;
    }

    addVoiceListeners({
      onSpeechResults: (e) => {
        if (e.value?.length) {
          setText(e.value[0]);
        }
      },
      onSpeechPartialResults: (e) => {
        if (e.value?.length) {
          setText(e.value[0]);
        }
      },
      onSpeechStart: () => setIsListening(true),
      onSpeechEnd: () => setIsListening(false),
    });

    return () => {
      removeVoiceListeners();
    };
  }, [isFocused]);

  const startVoice = async () => {
    try {
      if (!isVoiceAvailableModule()) {
        alert('Голосовой ввод недоступен');
        return;
      }

      if (!isFocused) {
        return;
      }

      const available = await isSpeechAvailable();
      if (!available) {
        alert('Голосовой ввод недоступен');
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

    const importanceLabel =
      IMPORTANCE_OPTIONS.find((option) => option.key === importance)?.label || 'Средняя';

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: `${importanceLabel}: напоминание`,
        body: normalizedTask,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date,
        channelId: 'default',
      },
    });

    await appendReminder(
      buildReminderItem(normalizedTask, date, notificationId, importance)
    );

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
      setToastMessage(savedCount === 1 ? 'Напоминание добавлено' : `Добавлено: ${savedCount}`);
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
                  colors={[theme.colors.primary, '#8A58FF']}
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
                  colors={[theme.colors.primary, '#8A58FF']}
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

          <View style={styles.importanceBlock}>
            <Text style={styles.importanceTitle}>Важность</Text>
            <View style={styles.importanceRow}>
              {IMPORTANCE_OPTIONS.map((option) => {
                const selected = importance === option.key;

                return (
                  <TouchableOpacity
                    key={option.key}
                    style={[
                      styles.importanceChip,
                      selected && {
                        borderColor: option.color,
                        backgroundColor: `${option.color}14`,
                      },
                    ]}
                    activeOpacity={0.85}
                    onPress={() => setImportance(option.key)}
                  >
                    <Text
                      style={[
                        styles.importanceText,
                        selected && { color: option.color },
                      ]}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={[styles.inputCard, isListening && styles.inputCardListening]}>
            <TextInput
              placeholder={
                mode === 'exact'
                  ? 'Что нужно сделать?'
                  : 'Напишите или надиктуйте напоминание'
              }
              placeholderTextColor={theme.colors.textMuted}
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

                <TouchableOpacity onPress={isListening ? stopVoice : startVoice} activeOpacity={0.88}>
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
          ) : (
            <View style={styles.exactRow}>
              <TouchableOpacity
                style={styles.infoChip}
                activeOpacity={0.85}
                onPress={() => setShowDatePicker(true)}
              >
                <Ionicons name="calendar-outline" size={16} color={theme.colors.primary} />
                <Text style={styles.infoChipText}>{formatCurrentDate(selectedDate)}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.infoChip}
                activeOpacity={0.85}
                onPress={() => setShowTimePicker(true)}
              >
                <Ionicons name="time-outline" size={16} color={theme.colors.primary} />
                <Text style={styles.infoChipText}>
                  {String(hour).padStart(2, '0')}:{String(minute).padStart(2, '0')}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <TouchableOpacity onPress={mode === 'quick' ? addQuick : addExact} activeOpacity={0.88}>
          <LinearGradient
            colors={[theme.colors.primaryStrong, theme.colors.primaryAlt]}
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

function createStyles(theme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
      paddingHorizontal: 20,
      paddingTop: 10,
    },
    content: {
      flex: 1,
      justifyContent: 'space-between',
    },
    toast: {
      position: 'absolute',
      top: 52,
      left: 20,
      right: 20,
      zIndex: 20,
      height: 46,
      borderRadius: 16,
      backgroundColor: theme.colors.toast,
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
      color: theme.colors.text,
    },
    segment: {
      flexDirection: 'row',
      backgroundColor: theme.colors.surface,
      borderRadius: 16,
      padding: 4,
      borderWidth: 1,
      borderColor: theme.colors.cardBorder,
      marginTop: 14,
    },
    segmentOption: {
      flex: 1,
      borderRadius: 13,
      overflow: 'hidden',
    },
    segmentActive: {
      shadowColor: theme.colors.shadow,
      shadowOpacity: 0.12,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
    },
    segmentGradient: {
      paddingVertical: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    segmentText: {
      textAlign: 'center',
      color: theme.colors.textSecondary,
      fontSize: 14,
      fontWeight: '700',
      paddingVertical: 10,
    },
    segmentTextActive: {
      color: '#FFFFFF',
      paddingVertical: 0,
    },
    importanceBlock: {
      marginTop: 10,
    },
    importanceTitle: {
      marginBottom: 8,
      fontSize: 13,
      fontWeight: '700',
      color: theme.colors.textSoft,
    },
    importanceRow: {
      flexDirection: 'row',
      gap: 8,
    },
    importanceChip: {
      flex: 1,
      height: 40,
      borderRadius: 14,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.cardBorder,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 6,
    },
    importanceText: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.colors.textSecondary,
      textAlign: 'center',
    },
    inputCard: {
      minHeight: 104,
      marginTop: 12,
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 10,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.cardBorder,
    },
    inputCardListening: {
      borderColor: theme.colors.primary,
    },
    input: {
      minHeight: Platform.OS === 'android' ? 56 : 62,
      fontSize: 16,
      lineHeight: 22,
      color: theme.colors.text,
    },
    recordingText: {
      marginTop: 6,
      color: '#FF5A5F',
      fontSize: 14,
      fontWeight: '600',
    },
    voiceBlock: {
      alignItems: 'center',
      marginTop: 10,
    },
    micWrap: {
      width: 92,
      height: 92,
      alignItems: 'center',
      justifyContent: 'center',
    },
    micPulseRing: {
      position: 'absolute',
      width: 92,
      height: 92,
      borderRadius: 46,
      backgroundColor: '#FF8A92',
    },
    micButton: {
      width: 64,
      height: 64,
      borderRadius: 32,
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
      color: theme.colors.textMuted,
      textAlign: 'center',
    },
    exactRow: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 12,
      marginBottom: 8,
    },
    infoChip: {
      flex: 1,
      height: 48,
      borderRadius: 16,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.cardBorder,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    infoChipText: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.text,
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
}
