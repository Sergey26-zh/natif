import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

function formatReminderDate(value) {
  const date = new Date(value);
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ReminderItem({ item, onDelete }) {
  return (
    <View style={styles.card}>
      <View style={styles.left}>
        <View style={styles.badge}>
          <Ionicons name="alarm-outline" size={18} color="#6F49FF" />
        </View>

        <View style={styles.textBlock}>
          <Text style={styles.title} numberOfLines={2}>
            {item.task}
          </Text>
          <Text style={styles.subtitle}>{formatReminderDate(item.date)}</Text>
        </View>
      </View>

      <TouchableOpacity
        onPress={() => onDelete(item.id)}
        style={styles.deleteButton}
        activeOpacity={0.8}
      >
        <Ionicons name="trash-outline" size={18} color="#FF6E73" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E8EAF6',
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 10,
  },
  badge: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: '#F2EEFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  textBlock: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '800',
    color: '#151827',
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    color: '#8D96B2',
    fontWeight: '600',
  },
  deleteButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#FFF4F4',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
