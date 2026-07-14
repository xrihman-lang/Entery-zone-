import React, { useState, useEffect } from 'react';
import { LogIn, Mail, Lock, User, Eye, EyeOff, Globe } from 'lucide-react';
import { motion } from 'motion/react';
import { 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  updateProfile 
} from 'firebase/auth';
import { getFirebase } from '../lib/firebase';

interface LoginPageProps {
  onLoginSuccess: () => void;
  onSkipLogin: () => void;
}

export default function LoginPage({ onLoginSuccess, onSkipLogin }: LoginPageProps) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isFirebaseMissing, setIsFirebaseMissing] = useState(false);
  
  // Email/Password state
  const [authMethod, setAuthMethod] = useState<'google' | 'email'>('google');
  const [emailMode, setEmailMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
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
      let errorMessage = err.message || 'Failed to login with Google';
      if (err.code === 'auth/configuration-not-found' || errorMessage.includes('auth/configuration-not-found')) {
        errorMessage = 'Google Sign-In is not enabled. Please go to your Firebase Console -> Authentication -> Sign-in method -> Enable "Google".';
      } else if (err.code === 'auth/unauthorized-domain' || errorMessage.includes('auth/unauthorized-domain')) {
        errorMessage = `This domain is not authorized for Google Login in Firebase.\n\nTo fix this:\n1. Go to Firebase Console\n2. Click Authentication -> Settings -> Authorized domains\n3. Add domain: ${window.location.hostname}\n\nAlternatively, use Email & Password below to sign in instantly!`;
        // Auto switch to email method so they are not stuck
        setAuthMethod('email');
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }
    if (emailMode === 'signup' && !fullName) {
      setError('Please enter your full name.');
      return;
    }
    if (password.length < 6) {
      setError('Password should be at least 6 characters.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { auth } = await getFirebase();
      if (!auth) {
        throw new Error('Firebase Auth is not initialized. Please run locally or check configurations.');
      }

      if (emailMode === 'login') {
        // Sign In
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        // Sign Up
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        if (userCredential.user) {
          await updateProfile(userCredential.user, {
            displayName: fullName
          });
        }
      }
      onLoginSuccess();
    } catch (err: any) {
      console.error('Email authentication error:', err);
      let errorMessage = 'Authentication failed.';
      
      switch (err.code) {
        case 'auth/email-already-in-use':
          errorMessage = 'This email is already registered. Please login instead.';
          setEmailMode('login');
          break;
        case 'auth/weak-password':
          errorMessage = 'The password is too weak. Please use at least 6 characters.';
          break;
        case 'auth/invalid-email':
          errorMessage = 'Invalid email address format.';
          break;
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          errorMessage = 'Incorrect email or password. Please try again.';
          break;
        default:
          errorMessage = err.message || 'An error occurred during authentication.';
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 text-center border border-gray-150"
      >
        <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 text-white shadow-lg">
          <LogIn size={32} />
        </div>
        
        <h1 className="text-3xl font-bold text-gray-900 mb-1">Daily Daybook</h1>
        <p className="text-gray-500 text-sm mb-6">Secure your records in the cloud to access them from any device.</p>

        {error && (
          <div className="mb-5 p-4 bg-red-50 border-l-4 border-red-500 text-red-700 text-xs rounded text-left whitespace-pre-wrap leading-relaxed shadow-sm">
            {error}
          </div>
        )}

        {isFirebaseMissing && (
          <div className="mb-5 p-4 bg-amber-50 border-l-4 border-amber-500 text-amber-800 text-xs rounded text-left shadow-sm">
            <p className="font-bold mb-1 text-sm">Cloud Sync Not Ready</p>
            <p>The developer needs to complete the Firebase setup or configure environment variables. You can still use the app locally in the meantime.</p>
          </div>
        )}

        {/* Auth Method Selector */}
        <div className="flex bg-gray-100 p-1 rounded-lg mb-6 text-sm">
          <button
            type="button"
            onClick={() => { setAuthMethod('google'); setError(null); }}
            className={`flex-1 py-2 rounded-md font-semibold transition-all ${
              authMethod === 'google' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            Google Sign-In
          </button>
          <button
            type="button"
            onClick={() => { setAuthMethod('email'); setError(null); }}
            className={`flex-1 py-2 rounded-md font-semibold transition-all ${
              authMethod === 'email' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            Email & Password
          </button>
        </div>

        {authMethod === 'google' ? (
          <div className="space-y-4">
            <button
              onClick={handleGoogleLogin}
              disabled={loading || isFirebaseMissing}
              className="w-full flex items-center justify-center gap-3 bg-white border border-gray-300 py-3.5 rounded-lg font-bold text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-all shadow-sm disabled:opacity-50 disabled:grayscale cursor-pointer"
            >
              <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
              {loading ? 'Connecting...' : 'Sign in with Google'}
            </button>
            <p className="text-xs text-gray-400 mt-2">
              Fastest option. Requires authorizing your domain in Firebase Console.
            </p>
          </div>
        ) : (
          <form onSubmit={handleEmailAuth} className="space-y-4 text-left">
            {/* Toggle Login / Signup */}
            <div className="flex justify-center gap-4 text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
              <button
                type="button"
                onClick={() => { setEmailMode('login'); setError(null); }}
                className={`pb-1 border-b-2 ${emailMode === 'login' ? 'border-blue-600 text-blue-600' : 'border-transparent hover:text-gray-600'}`}
              >
                Log In
              </button>
              <button
                type="button"
                onClick={() => { setEmailMode('signup'); setError(null); }}
                className={`pb-1 border-b-2 ${emailMode === 'signup' ? 'border-blue-600 text-blue-600' : 'border-transparent hover:text-gray-600'}`}
              >
                Register / Sign Up
              </button>
            </div>

            {emailMode === 'signup' && (
              <div className="space-y-1">
                <label className="text-xs font-bold text-gray-600 uppercase tracking-wider">Full Name</label>
                <div className="relative">
                  <User size={16} className="absolute left-3 top-3.5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="E.g. Aadil Khan"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full pl-10 pr-3 py-2.5 bg-gray-50 border border-gray-300 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-gray-900"
                    required
                  />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-600 uppercase tracking-wider">Email Address</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-3.5 text-gray-400" />
                <input
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 bg-gray-50 border border-gray-300 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-gray-900"
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-gray-600 uppercase tracking-wider">Password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-3.5 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Min 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 bg-gray-50 border border-gray-300 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-gray-900"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 transition-colors shadow-md text-sm mt-4 cursor-pointer flex justify-center items-center"
            >
              {loading ? 'Please wait...' : emailMode === 'login' ? 'Log In to Account' : 'Create My Account'}
            </button>
          </form>
        )}

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-gray-200" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white px-3 text-gray-400 font-bold tracking-wider">OR</span>
          </div>
        </div>

        <button
          onClick={onSkipLogin}
          className="w-full py-3.5 rounded-lg font-semibold text-blue-600 hover:bg-blue-50 transition-colors border border-dashed border-blue-200 text-sm cursor-pointer"
        >
          Continue without login (Local Mode)
        </button>

        <p className="mt-8 text-[10px] text-gray-400 uppercase tracking-[0.2em]">
          Professional Digital Ledger
        </p>
      </motion.div>
    </div>
  );
}
