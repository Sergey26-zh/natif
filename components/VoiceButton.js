import { TouchableOpacity, Text, StyleSheet } from 'react-native';

export default function VoiceButton({ onResult }) {
  const start = async () => {
   /* try {
      await Voice.start('ru-RU');
    } catch (e) {
      console.log(e);
    }
  };

  Voice.onSpeechResults = (e) => {
    if (e.value?.length) {
      onResult(e.value[0]);
    } */
  };

  return (
    <TouchableOpacity style={styles.btn} onPress={start}>
      <Text style={styles.text}>🎤 Говорить</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    backgroundColor: '#222',
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
  },
  text: {
    color: '#fff',
    textAlign: 'center',
  },
});