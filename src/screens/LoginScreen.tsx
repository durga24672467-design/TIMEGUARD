import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  StatusBar, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { signIn, getEmployeeId } from '../lib/supabase';

interface Props {
  onLogin: (session: { employee_id: string; name: string; token: string }) => void;
}

export default function LoginScreen({ onLogin }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      const auth = await signIn(email.trim(), password.trim());
      const emp = await getEmployeeId(email.trim(), auth.access_token);
      const session = {
        employee_id: emp.id,
        name: `${emp.first_name} ${emp.last_name}`,
        token: auth.access_token,
      };
      await AsyncStorage.setItem('tg_session', JSON.stringify(session));
      onLogin(session);
    } catch (e: any) {
      Alert.alert('Login Failed', e.message || 'Please check your credentials.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />

      <View style={styles.card}>
        <Text style={styles.logo}>⏱ TimeGuard</Text>
        <Text style={styles.subtitle}>Employee Call Tracker</Text>

        <Text style={styles.label}>Work Email</Text>
        <TextInput
          style={styles.input}
          placeholder="you@company.com"
          placeholderTextColor="#64748b"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          placeholder="••••••••"
          placeholderTextColor="#64748b"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity
          style={[styles.btn, loading && styles.btnDisabled]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.btnText}>Sign In</Text>}
        </TouchableOpacity>

        <Text style={styles.hint}>
          Use the same credentials as your TimeGuard web app.
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: '#0f0f1a',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  card: {
    width: '100%', maxWidth: 400,
    backgroundColor: '#1a1a2e', borderRadius: 20,
    padding: 28, borderWidth: 1, borderColor: '#2d2d50',
  },
  logo: {
    fontSize: 26, fontWeight: '800', color: '#A78BFA',
    textAlign: 'center', marginBottom: 4,
  },
  subtitle: {
    fontSize: 13, color: '#64748b',
    textAlign: 'center', marginBottom: 28,
  },
  label: {
    fontSize: 13, fontWeight: '600', color: '#94a3b8', marginBottom: 6,
  },
  input: {
    backgroundColor: '#252540', borderRadius: 10,
    borderWidth: 1, borderColor: '#3b3b60',
    color: '#e2e8f0', fontSize: 15,
    paddingHorizontal: 14, paddingVertical: 12,
    marginBottom: 16,
  },
  btn: {
    backgroundColor: '#7C3AED', borderRadius: 10,
    paddingVertical: 14, alignItems: 'center', marginTop: 8,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  hint: {
    fontSize: 11, color: '#475569',
    textAlign: 'center', marginTop: 16, lineHeight: 16,
  },
});
