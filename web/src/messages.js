/** Human-readable copy for the Firebase error codes users actually hit. */
export function authErrorMessage(error) {
  const code = error?.code || '';
  const messages = {
    'auth/email-already-in-use': 'An account already exists with this email. Try signing in.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/weak-password': 'Use a stronger password (at least 6 characters).',
    'auth/user-not-found': 'No account was found with that email.',
    'auth/wrong-password': 'Incorrect password. Try again.',
    'auth/invalid-credential': 'Email or password is incorrect.',
    'auth/popup-closed-by-user': 'The Google sign-in window was closed before finishing.',
    'auth/popup-blocked': 'Your browser blocked the sign-in popup. Allow popups and try again.',
    'auth/unauthorized-domain': 'This website domain is not authorised in Firebase Authentication.',
    'auth/network-request-failed': 'Network error. Check your internet connection.',
    'auth/too-many-requests': 'Too many attempts. Wait a moment and try again.',
    'permission-denied': 'Your account is not allowed to change that data.',
    unavailable: 'You appear to be offline. Changes will sync when you reconnect.',
  };
  return messages[code] || error?.message || 'Something went wrong. Please try again.';
}
