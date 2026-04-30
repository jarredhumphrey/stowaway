import React, { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

type FetchStatus = 'idle' | 'loading' | 'success' | 'error';
type PostStatus = 'idle' | 'loading' | 'success' | 'error';

interface User {
  name: string;
  email: string;
}

export function NetworkScreen() {
  const [fetchStatus, setFetchStatus] = useState<FetchStatus>('idle');
  const [user, setUser] = useState<User | null>(null);
  const [fetchError, setFetchError] = useState('');

  const [postStatus, setPostStatus] = useState<PostStatus>('idle');

  async function handleFetchUser() {
    setFetchStatus('loading');
    setUser(null);
    setFetchError('');
    try {
      const res = await fetch('https://jsonplaceholder.typicode.com/users/1');
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      const data = await res.json() as { name: string; email: string };
      setUser({ name: data.name, email: data.email });
      setFetchStatus('success');
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : 'Unknown error');
      setFetchStatus('error');
    }
  }

  async function handlePostComment() {
    setPostStatus('loading');
    try {
      const res = await fetch('https://jsonplaceholder.typicode.com/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Test', body: 'Hello', userId: 1 }),
      });
      if (!res.ok) throw new Error(`Post failed: ${res.status}`);
      setPostStatus('success');
    } catch {
      setPostStatus('error');
    }
  }

  function handleReset() {
    setFetchStatus('idle');
    setUser(null);
    setFetchError('');
    setPostStatus('idle');
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Network</Text>

      <TouchableOpacity testID="btn-fetch-user" style={styles.btn} onPress={handleFetchUser}>
        <Text style={styles.btnText}>Fetch User</Text>
      </TouchableOpacity>

      {fetchStatus === 'loading' && (
        <ActivityIndicator testID="network-loading" style={styles.indicator} />
      )}

      {fetchStatus === 'success' && user && (
        <View testID="network-user" style={styles.card}>
          <Text testID="network-user-name" style={styles.cardName}>{user.name}</Text>
          <Text testID="network-user-email" style={styles.cardEmail}>{user.email}</Text>
        </View>
      )}

      {fetchStatus === 'error' && (
        <Text testID="network-error" style={styles.error}>{fetchError}</Text>
      )}

      <TouchableOpacity testID="btn-post-comment" style={styles.btn} onPress={handlePostComment}>
        <Text style={styles.btnText}>Post Comment</Text>
      </TouchableOpacity>

      {postStatus === 'loading' && (
        <ActivityIndicator testID="post-loading" style={styles.indicator} />
      )}

      {postStatus === 'success' && (
        <Text testID="post-success" style={styles.success}>Comment posted!</Text>
      )}

      {postStatus === 'error' && (
        <Text testID="post-error" style={styles.error}>Post failed</Text>
      )}

      <TouchableOpacity testID="btn-reset-network" style={styles.resetBtn} onPress={handleReset}>
        <Text style={styles.resetText}>Reset</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  heading: { fontSize: 22, fontWeight: '700', marginBottom: 20 },
  btn: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  indicator: { marginVertical: 8 },
  card: {
    backgroundColor: '#f2f2f7',
    borderRadius: 8,
    padding: 14,
    marginBottom: 16,
    gap: 4,
  },
  cardName: { fontSize: 16, fontWeight: '600' },
  cardEmail: { fontSize: 14, color: '#6c6c70' },
  success: { color: '#34c759', fontSize: 14, marginBottom: 12 },
  error: { color: '#ff3b30', fontSize: 14, marginBottom: 12 },
  resetBtn: {
    marginTop: 8,
    alignItems: 'center',
    paddingVertical: 10,
  },
  resetText: { color: '#8e8e93', fontSize: 14 },
});
