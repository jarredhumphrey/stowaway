import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

type Plan = 'free' | 'pro' | 'team';

export function FormScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [plan, setPlan] = useState<Plan>('free');
  const [notifications, setNotifications] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [nameFocused, setNameFocused] = useState(false);
  const [nameSubmitted, setNameSubmitted] = useState(false);

  function handleSubmit() {
    setSubmitted(true);
  }

  function handleClear() {
    setName('');
    setEmail('');
    setPlan('free');
    setNotifications(false);
    setSubmitted(false);
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Form</Text>

      {submitted && (
        <View testID="form-success" style={styles.banner}>
          <Text testID="form-success-text" style={styles.bannerText}>Submitted successfully!</Text>
        </View>
      )}

      {/* ── Text inputs ─────────────────────────────────────────── */}
      <Text style={styles.label}>Name</Text>
      <TextInput
        testID="input-name"
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="Enter your name"
        placeholderTextColor="#c7c7cc"
        onFocus={() => setNameFocused(true)}
        onBlur={() => setNameFocused(false)}
        onSubmitEditing={() => setNameSubmitted(true)}
        returnKeyType="next"
      />
      {nameFocused && (
        <Text testID="input-name-focused" style={styles.focusHint}>Name field is focused</Text>
      )}
      {nameSubmitted && (
        <Text testID="name-submitted" style={styles.focusHint}>Name submitted</Text>
      )}

      <Text style={styles.label}>Email</Text>
      <TextInput
        testID="input-email"
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        placeholder="Enter your email"
        placeholderTextColor="#c7c7cc"
        keyboardType="email-address"
        autoCapitalize="none"
      />

      {/* ── Segmented plan picker ───────────────────────────────── */}
      <Text style={styles.label}>Plan</Text>
      <View style={styles.planRow}>
        {(['free', 'pro', 'team'] as Plan[]).map(p => (
          <TouchableOpacity
            key={p}
            testID={`plan-${p}`}
            style={[styles.planBtn, plan === p && styles.planBtnActive]}
            onPress={() => setPlan(p)}
            accessibilityState={{ selected: plan === p }}
          >
            <Text style={[styles.planBtnText, plan === p && styles.planBtnTextActive]}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Toggle ──────────────────────────────────────────────── */}
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Notifications</Text>
        <Switch
          testID="toggle-notifications"
          value={notifications}
          onValueChange={setNotifications}
        />
      </View>

      {/* ── Summary ─────────────────────────────────────────────── */}
      <View style={styles.summary} testID="form-summary">
        <Text style={styles.summaryText} testID="summary-plan">Plan: {plan}</Text>
        <Text style={styles.summaryText} testID="summary-notifications">
          Notifications: {notifications ? 'on' : 'off'}
        </Text>
      </View>

      {/* ── Actions ─────────────────────────────────────────────── */}
      <TouchableOpacity testID="btn-submit" style={styles.submitBtn} onPress={handleSubmit}>
        <Text style={styles.submitText}>Submit</Text>
      </TouchableOpacity>
      <TouchableOpacity testID="btn-clear" style={styles.clearBtn} onPress={handleClear}>
        <Text style={styles.clearText}>Clear</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 24 },
  banner: {
    backgroundColor: '#D1FAE5',
    borderRadius: 10,
    padding: 16,
    marginBottom: 20,
    alignItems: 'center',
  },
  bannerText: { color: '#065F46', fontWeight: '700', fontSize: 16 },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8e8e93',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 4,
  },
  input: {
    borderWidth: 1.5,
    borderColor: '#c6c6c8',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: '#1c1c1e',
    marginBottom: 20,
  },
  planRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  planBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#c6c6c8',
    alignItems: 'center',
  },
  planBtnActive: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
  planBtnText: { fontSize: 14, fontWeight: '600', color: '#8e8e93' },
  planBtnTextActive: { color: '#fff' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  switchLabel: { fontSize: 16, color: '#1c1c1e' },
  summary: {
    backgroundColor: '#f2f2f7',
    borderRadius: 10,
    padding: 14,
    marginBottom: 24,
    gap: 4,
  },
  summaryText: { fontSize: 14, color: '#3a3a3c' },
  submitBtn: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  submitText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  clearBtn: { alignItems: 'center', paddingVertical: 12 },
  clearText: { color: '#FF3B30', fontSize: 16 },
  focusHint: { fontSize: 12, color: '#007AFF', marginBottom: 8, marginTop: -12 },
});
