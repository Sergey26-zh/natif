import React, { useEffect, useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  ScrollView,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import * as chrono from 'chrono-node';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Voice from 'react-native-voice';

const EXAMPLES = [
  'Позвонить маме через 3 минуты',
  'Через 15 минут проверить почту',
  'Завтра в 09:00 встреча',
];

export default function QuickAddScreen() {
  const [text, setText] = useState('');
  const [isListening, setIsListening] = useState(false);

  useEffect(() => {
    console.log('QuickAddScreen mounted');
    Notifications.requestPermissionsAsync();

    if (!Voice || typeof Voice.start !== 'function') {
      return undefined;
    }

    Voice.onSpeechStart = (e) => {
      console.log('VOICE onSpeechStart', e);
      setIsListening(true);
    };

    Voice.onSpeechRecognized = (e) => {
      console.log('VOICE onSpeechRecognized', e);
    };

    Voice.onSpeechEnd = (e) => {
      console.log('VOICE onSpeechEnd', e);
      setIsListening(false);
    };

    Voice.onSpeechResults = (e) => {
      console.log('VOICE onSpeechResults', e);
      const value = e?.value?.[0];
      if (value) {
        setText(value);
      }
    };

    Voice.onSpeechPartialResults = (e) => {
      console.log('VOICE onSpeechPartialResults', e);
      const value = e?.value?.[0];
      if (value) {
        setText(value);
      }
    };

    Voice.onSpeechError = (e) => {
      console.log('VOICE onSpeechError', JSON.stringify(e));
      setIsListening(false);
      alert('Ошибка распознавания речи');
    };

    return () => {
      Voice.destroy().then(Voice.removeAllListeners).catch(() => {});
    };
  }, []);

  const requestMicPermission = async () => {
    if (Platform.OS !== 'android') return true;

    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      {
        title: 'Доступ к микрофону',
        message: 'Нужен доступ к микрофону для голосового ввода',
        buttonPositive: 'Разрешить',
        buttonNegative: 'Отмена',
      }
    );

    console.log('MIC permission:', granted);
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  };

  const startListening = async () => {
    console.log('START button pressed');

    try {
      if (!Voice || typeof Voice.start !== 'function') {
        alert('Голосовой ввод недоступен');
        return;
      }

      const ok = await requestMicPermission();
      if (!ok) {
        alert('Нет доступа к микрофону');
        return;
      }

      const available = await Voice.isAvailable();
      console.log('VOICE available:', available);

      if (!available) {
        alert('Распознавание речи недоступно на устройстве');
        return;
      }

      await Voice.start('ru-RU');
      console.log('VOICE start called');
    } catch (e) {
      console.log('START LISTEN ERROR:', e);
      alert(e?.message || 'Не удалось запустить распознавание');
    }
  };

  const stopListening = async () => {
    console.log('STOP button pressed');

    try {
      if (!Voice || typeof Voice.stop !== 'function') {
        setIsListening(false);
        return;
      }

      await Voice.stop();
      setIsListening(false);
      console.log('VOICE stop called');
    } catch (e) {
      console.log('STOP LISTEN ERROR:', e);
    }
  };

  const fillExample = (value) => {
    setText(value);
  };

  const add = async () => {
    try {
      if (!text.trim()) {
        alert('Введите фразу с датой или временем');
        return;
      }

      const results = chrono.ru.parse(text);

      if (!results.length) {
        alert('Не понял дату или время');
        return;
      }

      const date = results[0].start.date();
      const task = text.replace(results[0].text, '').trim() || 'Напоминание';

      const reminder = {
        id: Date.now().toString(),
        task,
        date: date.toISOString(),
      };

      const stored = await AsyncStorage.getItem('reminders');
      const list = stored ? JSON.parse(stored) : [];
      const updated = [reminder, ...list];
      await AsyncStorage.setItem('reminders', JSON.stringify(updated));

      const diff = Math.floor((date.getTime() - Date.now()) / 1000);

      if (diff <= 0) {
        alert('Время уже прошло');
        return;
      }

      if (diff < 3600) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Напоминание',
            body: task,
            sound: 'default',
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: diff,
            channelId: 'default',
          },
        });
      } else {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Напоминание',
            body: task,
            sound: 'default',
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date,
            channelId: 'default',
          },
        });
      }

      setText('');
      alert('Напоминание добавлено');
    } catch (e) {
      console.log('QUICK ADD ERROR:', e);
      alert(e?.message || 'Не удалось добавить напоминание');
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Быстрое напоминание</Text>
        <Text style={styles.subtitle}>
          Скажи или введи фразу вроде “Позвонить маме через 3 минуты”
        </Text>

        <View style={styles.heroCard}>
          <TouchableOpacity
            style={[styles.voiceButton, isListening && styles.voiceButtonActive]}
            onPress={isListening ? stopListening : startListening}
            activeOpacity={0.85}
          >
            <Text style={styles.voiceEmoji}>{isListening ? '⏹' : '🎤'}</Text>
            <View style={styles.voiceTextWrap}>
              <Text style={styles.voiceTitle}>
                {isListening ? 'Остановить запись' : 'Говорить'}
              </Text>
              <Text style={styles.voiceSubtitle}>
                {isListening
                  ? 'Идёт распознавание речи'
                  : 'Быстро продиктовать напоминание'}
              </Text>
            </View>
          </TouchableOpacity>

          <TextInput
            placeholder="Например: через 20 минут отправить письмо"
            value={text}
            onChangeText={setText}
            style={styles.input}
            multiline
            placeholderTextColor="#9AA0B4"
          />

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={add}
            activeOpacity={0.9}
          >
            <Text style={styles.primaryButtonText}>Добавить напоминание</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.examplesSection}>
          <Text style={styles.examplesTitle}>Быстрые примеры</Text>

          {EXAMPLES.map((example) => (
            <TouchableOpacity
              key={example}
              style={styles.exampleChip}
              onPress={() => fillExample(example)}
              activeOpacity={0.85}
            >
              <Text style={styles.exampleText}>{example}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F6F7FB',
  },
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 28,
  },
  title: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '800',
    color: '#111111',
  },
  subtitle: {
    marginTop: 6,
    marginBottom: 18,
    fontSize: 14,
    lineHeight: 20,
    color: '#7B8094',
  },
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: '#ECEEF5',
    shadowColor: '#111111',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  voiceButton: {
    backgroundColor: '#17181F',
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  voiceButtonActive: {
    backgroundColor: '#B42318',
  },
  voiceEmoji: {
    fontSize: 22,
    marginRight: 12,
    color: '#FFFFFF',
  },
  voiceTextWrap: {
    flex: 1,
  },
  voiceTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  voiceSubtitle: {
    color: '#C8CBD8',
    fontSize: 13,
    marginTop: 3,
  },
  input: {
    minHeight: 130,
    borderRadius: 18,
    backgroundColor: '#F6F7FB',
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    lineHeight: 22,
    color: '#151722',
    textAlignVertical: 'top',
    marginBottom: 14,
  },
  primaryButton: {
    backgroundColor: '#111111',
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  examplesSection: {
    marginTop: 22,
  },
  examplesTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#151722',
    marginBottom: 12,
  },
  exampleChip: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#ECEEF5',
    borderRadius: 16,
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  exampleText: {
    color: '#33384A',
    fontSize: 14,
  },
});
