import React, { createContext, useContext } from 'react';

export const appThemes = {
  light: {
    mode: 'light',
    dark: false,
    colors: {
      background: '#F5F6FF',
      surface: '#FFFFFF',
      surfaceSecondary: '#EEF0FF',
      card: '#FFFFFF',
      cardBorder: '#E7E9F6',
      text: '#151827',
      textSecondary: '#707898',
      textMuted: '#A0A7C0',
      textSoft: '#8F97B2',
      primary: '#6F49FF',
      primaryStrong: '#6236FF',
      primaryAlt: '#9D4DFF',
      tabInactive: '#A5AEC6',
      success: '#43C59E',
      successStrong: '#22B07D',
      successSoft: '#EAF8F2',
      danger: '#FF6E73',
      dangerSoft: '#FFF4F4',
      toast: '#171A2A',
      overlay: '#F3F0FF',
      shadow: '#6F49FF',
      calendarTodayBorder: '#6F49FF',
      emptyIcon: '#B7BCD2',
    },
  },
  dark: {
    mode: 'dark',
    dark: true,
    colors: {
      background: '#0D0C18',
      surface: '#17162B',
      surfaceSecondary: '#1D1B35',
      card: '#17162B',
      cardBorder: '#292746',
      text: '#F8F8FF',
      textSecondary: '#B1B6D4',
      textMuted: '#8F93B5',
      textSoft: '#8489AA',
      primary: '#7B5CFF',
      primaryStrong: '#6B45FF',
      primaryAlt: '#9256FF',
      tabInactive: '#9098B8',
      success: '#43C59E',
      successStrong: '#43C59E',
      successSoft: '#16362C',
      danger: '#FF7A7F',
      dangerSoft: '#321C26',
      toast: '#23213A',
      overlay: '#221F3D',
      shadow: '#2D2855',
      calendarTodayBorder: '#7B5CFF',
      emptyIcon: '#8E93B5',
    },
  },
};

export const AppThemeContext = createContext({
  themeMode: 'light',
  theme: appThemes.light,
  toggleTheme: () => {},
  previewMode: false,
  togglePreview: () => {},
});

export function useAppTheme() {
  return useContext(AppThemeContext);
}
