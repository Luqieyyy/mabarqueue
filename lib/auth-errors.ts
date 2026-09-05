/** Safe, actionable messages without exposing provider internals. */
export function authErrorMessage(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : '';
  switch (code) {
    case 'auth/email-already-in-use': return 'This email already has an account. Sign in to continue your setup.';
    case 'auth/invalid-email': return 'Enter a valid email address.';
    case 'auth/weak-password':
    case 'auth/password-does-not-meet-requirements': return 'Your password does not meet the account security requirements. Choose a stronger password.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found': return 'The email or password is incorrect.';
    case 'auth/popup-closed-by-user': return 'Google sign-in was cancelled. You can try again.';
    case 'auth/popup-blocked': return 'Allow popups for this site, then try Google again.';
    case 'auth/account-exists-with-different-credential': return 'Sign in using the method already linked to this email.';
    case 'auth/too-many-requests': return 'Too many attempts. Please wait a few minutes before trying again.';
    case 'auth/network-request-failed': return 'Connection interrupted. Check your connection and try again.';
    default: return 'We could not complete that request. Please try again.';
  }
}
