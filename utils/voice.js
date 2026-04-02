import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

const nativeVoiceModule = NativeModules.RCTVoice || NativeModules.Voice || null;
const voiceEmitter =
  nativeVoiceModule && Platform.OS !== 'web'
    ? new NativeEventEmitter(nativeVoiceModule)
    : null;

let activeSubscriptions = [];

export function isVoiceAvailableModule() {
  return Boolean(nativeVoiceModule);
}

export function addVoiceListeners(handlers) {
  removeVoiceListeners();

  if (!voiceEmitter) {
    return;
  }

  const events = [
    ['onSpeechStart', handlers.onSpeechStart],
    ['onSpeechEnd', handlers.onSpeechEnd],
    ['onSpeechResults', handlers.onSpeechResults],
    ['onSpeechPartialResults', handlers.onSpeechPartialResults],
    ['onSpeechError', handlers.onSpeechError],
  ];

  activeSubscriptions = events
    .filter(([, handler]) => typeof handler === 'function')
    .map(([eventName, handler]) => voiceEmitter.addListener(eventName, handler));
}

export function removeVoiceListeners() {
  activeSubscriptions.forEach((subscription) => subscription.remove());
  activeSubscriptions = [];
}

export function isSpeechAvailable() {
  if (!nativeVoiceModule || typeof nativeVoiceModule.isSpeechAvailable !== 'function') {
    return Promise.resolve(false);
  }

  return new Promise((resolve, reject) => {
    nativeVoiceModule.isSpeechAvailable((available, error) => {
      if (error) {
        reject(new Error(error));
        return;
      }

      resolve(Boolean(available));
    });
  });
}

export function startSpeech(locale, options = {}) {
  if (!nativeVoiceModule || typeof nativeVoiceModule.startSpeech !== 'function') {
    return Promise.reject(new Error('Voice module unavailable'));
  }

  return new Promise((resolve, reject) => {
    const callback = (error) => {
      if (error) {
        reject(new Error(error));
        return;
      }

      resolve();
    };

    if (Platform.OS === 'android') {
      nativeVoiceModule.startSpeech(
        locale,
        {
          EXTRA_LANGUAGE_MODEL: 'LANGUAGE_MODEL_FREE_FORM',
          EXTRA_MAX_RESULTS: 5,
          EXTRA_PARTIAL_RESULTS: true,
          REQUEST_PERMISSIONS_AUTO: true,
          ...options,
        },
        callback
      );
      return;
    }

    nativeVoiceModule.startSpeech(locale, callback);
  });
}

export function stopSpeech() {
  if (!nativeVoiceModule || typeof nativeVoiceModule.stopSpeech !== 'function') {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    nativeVoiceModule.stopSpeech((error) => {
      if (error) {
        reject(new Error(error));
        return;
      }

      resolve();
    });
  });
}
