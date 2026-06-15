// TimeGuard Android Call Tracker
// Main App Entry Point

import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, StatusBar, ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<{ employee_id: string; name: string } | null>(null);

  useEffect(() => {
    console.log('[TimeGuard] Checking session...');
    AsyncStorage.getItem('tg_session')
      .then(val => {
        if (val) {
          console.log('[TimeGuard] Session found');
          setSession(JSON.parse(val));
        } else {
          console.log('[TimeGuard] No session found');
        }
      })
      .catch(e => {
        console.error('[TimeGuard] Storage Error:', e);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <View style={styles.splash}>
        <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />
        <Text style={styles.logo}>⏱ TimeGuard</Text>
        <ActivityIndicator color="#7C3AED" size="large" style={{ marginTop: 24 }} />
      </View>
    );
  }

  return session
    ? <HomeScreen session={session} onLogout={() => { AsyncStorage.removeItem('tg_session'); setSession(null); }} />
    : <LoginScreen onLogin={setSession} />;
}

const styles = StyleSheet.create({
  splash: {
    flex: 1, backgroundColor: '#1a1a2e',
    alignItems: 'center', justifyContent: 'center',
  },
  logo: {
    fontSize: 28, fontWeight: '800', color: '#A78BFA',
  },
});
