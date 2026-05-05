import React from 'react';
import { LogIn } from 'lucide-react';
import { motion } from 'motion/react';
import { signInWithPopup } from 'firebase/auth';
import { getFirebase } from '../lib/firebase';

interface LoginPageProps {
  onLoginSuccess: () => void;
  onSkipLogin: () => void;
}

export default function LoginPage({ onLoginSuccess, onSkipLogin }: LoginPageProps) {
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [isFirebaseMissing, setIsFirebaseMissing] = React.useState(false);

  React.useEffect(() => {
    getFirebase().then(({ auth }) => {
      if (!auth) setIsFirebaseMissing(true);
    });
  }, []);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const { auth, googleProvider } = await getFirebase();
      if (!auth || !googleProvider) {
        throw new Error('Firebase setup is incomplete. Click "Continue without login" for now, or check with developer.');
      }
      await signInWithPopup(auth, googleProvider);
      onLoginSuccess();
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err.message || 'Failed to login with Google');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 text-center"
      >
        <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-6 text-white shadow-lg">
          <LogIn size={40} />
        </div>
        
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Daily Daybook</h1>
        <p className="text-gray-500 mb-8">Secure your records in the cloud to access them from any computer.</p>

        {isFirebaseMissing && (
          <div className="mb-6 p-4 bg-amber-50 border-l-4 border-amber-500 text-amber-800 text-sm rounded text-left">
            <p className="font-bold mb-1">Cloud Sync Not Ready</p>
            <p>The developer needs to complete the Firebase setup. You can still use the app locally in the meantime.</p>
          </div>
        )}

        <div className="space-y-4">
          <button
            onClick={handleGoogleLogin}
            disabled={loading || isFirebaseMissing}
            className="w-full flex items-center justify-center gap-3 bg-white border border-gray-300 py-3 rounded-lg font-bold text-gray-700 hover:bg-gray-50 transition-all shadow-sm disabled:opacity-50 disabled:grayscale"
          >
            <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
            {loading ? 'Connecting...' : 'Sign in with Google'}
          </button>

          <button
            onClick={onSkipLogin}
            className="w-full py-3 rounded-lg font-semibold text-blue-600 hover:bg-blue-50 transition-colors"
          >
            Continue without login (Local Mode)
          </button>
        </div>

        <p className="mt-8 text-[10px] text-gray-400 uppercase tracking-[0.2em]">
          Professional Digital Ledger
        </p>
      </motion.div>
    </div>
  );
}
