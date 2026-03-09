import { useState, useEffect } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from './firebase';

/**
 * Derives a stable, human-readable username from an email address.
 * e.g. "luqmanbahrin2004@gmail.com" → "luqmanbahrin2004"
 * Used as the Firestore document ID under users/.
 */
export function emailToUsername(email: string): string {
  return email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_');
}

/**
 * Hook to subscribe to Firebase Auth state.
 * Returns { user, username, loading }.
 * - username: derived from user.email, used as Firestore doc ID under users/
 * - loading: true until the initial auth check resolves
 */
export function useAuth(): { user: User | null; username: string; loading: boolean } {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  const username = user?.email ? emailToUsername(user.email) : '';
  return { user, username, loading };
}
