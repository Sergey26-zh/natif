import 'react-native-gesture-handler';
import React, { useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';

import AddReminderScreen from './screens/AddReminderScreen';
import CalendarScreen from './screens/CalendarScreen';
import HomeScreen from './screens/HomeScreen';
import { AppThemeContext, appThemes } from './theme';

const Tab = createBottomTabNavigator();
const THEME_STORAGE_KEY = 'appThemeMode';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function App() {
  const [themeMode, setThemeMode] = useState('light');

  useEffect(() => {
    const setup = async () => {
      const savedThemeMode = await AsyncStorage.getItem(THEME_STORAGE_KEY);

      if (savedThemeMode === 'dark' || savedThemeMode === 'light') {
        setThemeMode(savedThemeMode);
      }

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

  const toggleTheme = async () => {
    const nextMode = themeMode === 'dark' ? 'light' : 'dark';
    setThemeMode(nextMode);
    await AsyncStorage.setItem(THEME_STORAGE_KEY, nextMode);
  };

  const theme = appThemes[themeMode] || appThemes.light;

  const navTheme = useMemo(
    () => ({
      ...DefaultTheme,
      dark: theme.dark,
      colors: {
        ...DefaultTheme.colors,
        background: theme.colors.background,
        card: theme.colors.surface,
        text: theme.colors.text,
        border: theme.colors.cardBorder,
        primary: theme.colors.primary,
      },
    }),
    [theme]
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppThemeContext.Provider value={{ themeMode, theme, toggleTheme }}>
          <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} />
          <NavigationContainer theme={navTheme}>
            <Tab.Navigator
              initialRouteName="Календарь"
              screenOptions={({ route }) => ({
                headerShown: false,
                tabBarActiveTintColor: theme.colors.primary,
                tabBarInactiveTintColor: theme.colors.tabInactive,
                tabBarHideOnKeyboard: true,
                tabBarShowLabel: false,
                tabBarStyle: {
                  height: 78,
                  paddingTop: 10,
                  paddingBottom: 12,
                  backgroundColor: theme.colors.surface,
                  borderTopWidth: 1,
                  borderTopColor: theme.colors.cardBorder,
                },
                tabBarIcon: ({ color, focused }) => {
                  let iconName = 'ellipse-outline';

                  if (route.name === 'Календарь') {
                    iconName = focused ? 'calendar-clear-outline' : 'calendar-outline';
                  } else if (route.name === 'Напоминания') {
                    iconName = focused ? 'notifications' : 'notifications-outline';
                  } else if (route.name === 'Задачи') {
                    iconName = focused ? 'checkbox' : 'checkbox-outline';
                  }

                  return <Ionicons name={iconName} size={24} color={color} />;
                },
              })}
            >
              <Tab.Screen name="Календарь" component={CalendarScreen} />
              <Tab.Screen name="Напоминания" component={AddReminderScreen} />
              <Tab.Screen name="Задачи" component={HomeScreen} />
            </Tab.Navigator>
          </NavigationContainer>
        </AppThemeContext.Provider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
