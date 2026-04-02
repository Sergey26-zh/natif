import 'react-native-gesture-handler';
import React, { useEffect, useMemo, useState } from 'react';
import { Platform, View } from 'react-native';
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
const PREVIEW_STORAGE_KEY = 'iphonePreviewMode';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function PreviewShell({ active, children, theme }) {
  if (!active) {
    return children;
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.mode === 'dark' ? '#080712' : '#E8E6EF',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
        paddingVertical: 18,
      }}
    >
      <View
        style={{
          width: '100%',
          maxWidth: 430,
          flex: 1,
          borderRadius: 34,
          overflow: 'hidden',
          backgroundColor: theme.colors.background,
          borderWidth: 4,
          borderColor: theme.mode === 'dark' ? '#212036' : '#23252F',
          shadowColor: '#000000',
          shadowOpacity: theme.mode === 'dark' ? 0.5 : 0.18,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 10 },
          elevation: 20,
        }}
      >
        {children}
      </View>
    </View>
  );
}

export default function App() {
  const [themeMode, setThemeMode] = useState('light');
  const [previewMode, setPreviewMode] = useState(false);

  useEffect(() => {
    const setup = async () => {
      const savedThemeMode = await AsyncStorage.getItem(THEME_STORAGE_KEY);
      const savedPreviewMode = await AsyncStorage.getItem(PREVIEW_STORAGE_KEY);

      if (savedThemeMode === 'dark' || savedThemeMode === 'light') {
        setThemeMode(savedThemeMode);
      }

      if (savedPreviewMode === 'true' || savedPreviewMode === 'false') {
        setPreviewMode(savedPreviewMode === 'true');
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

  const togglePreview = async () => {
    const nextMode = !previewMode;
    setPreviewMode(nextMode);
    await AsyncStorage.setItem(PREVIEW_STORAGE_KEY, String(nextMode));
  };

  const theme = appThemes[themeMode] || appThemes.light;
  const shouldUsePreviewShell = previewMode && Platform.OS !== 'ios';

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
        <AppThemeContext.Provider
          value={{ themeMode, theme, toggleTheme, previewMode, togglePreview }}
        >
          <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} />
          <NavigationContainer theme={navTheme}>
            <PreviewShell active={shouldUsePreviewShell} theme={theme}>
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
            </PreviewShell>
          </NavigationContainer>
        </AppThemeContext.Provider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
