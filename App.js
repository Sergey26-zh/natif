import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';

import AddReminderScreen from './screens/AddReminderScreen';
import CalendarScreen from './screens/CalendarScreen';
import HomeScreen from './screens/HomeScreen';

const Tab = createBottomTabNavigator();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: '#F5F6FF',
    card: '#FFFFFF',
    text: '#151827',
    border: '#ECECFA',
    primary: '#6F49FF',
  },
};

export default function App() {
  useEffect(() => {
    const setup = async () => {
      await Notifications.requestPermissionsAsync();

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          sound: 'default',
        });
      }
    };

    setup();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <NavigationContainer theme={navTheme}>
        <Tab.Navigator
          initialRouteName="Календарь"
          screenOptions={({ route }) => ({
            headerShown: false,
            tabBarActiveTintColor: '#6F49FF',
            tabBarInactiveTintColor: '#A5AEC6',
            tabBarHideOnKeyboard: true,
            tabBarShowLabel: false,
            tabBarStyle: {
              height: 78,
              paddingTop: 10,
              paddingBottom: 12,
              backgroundColor: '#FFFFFF',
              borderTopWidth: 1,
              borderTopColor: '#ECECFA',
            },
            tabBarIcon: ({ color, focused }) => {
              let iconName = 'ellipse-outline';

              if (route.name === 'Календарь') {
                iconName = focused ? 'calendar-clear-outline' : 'calendar-outline';
              } else if (route.name === 'Задачи') {
                iconName = focused ? 'checkbox' : 'checkbox-outline';
              } else if (route.name === 'Добавить') {
                iconName = focused ? 'add-circle-outline' : 'add-circle-outline';
              }

              return <Ionicons name={iconName} size={24} color={color} />;
            },
          })}
        >
          <Tab.Screen name="Календарь" component={CalendarScreen} />
          <Tab.Screen name="Задачи" component={HomeScreen} />
          <Tab.Screen name="Добавить" component={AddReminderScreen} />
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
