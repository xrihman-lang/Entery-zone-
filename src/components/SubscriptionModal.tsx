import React, { useState, useEffect } from 'react';
import { X, Crown, ShieldAlert } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { doc, setDoc } from 'firebase/firestore';
import { getFirebase } from '../lib/firebase';
import { speak } from '../lib/speech';

const loadRazorpay = () => new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
});

export default function SubscriptionModal({ isOpen, onClose, user, isNearExpiry }: { isOpen: boolean, onClose: () => void, user: any, isNearExpiry?: boolean }) {
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // Voice greeting when entering premium page
      speak('GDX Premium mein aapka swagat hai', 'professional');
    }
  }, [isOpen]);

  const handlePayment = async (planName: string, amount: number, months: number) => {
      setIsProcessing(true);
      const res = await loadRazorpay();
      if (!res) {
          alert('Razorpay SDK failed to load. Are you online?');
          setIsProcessing(false);
          return;
      }

      const options = {
          key: "rzp_live_SmYl9h1s1WboEw", // Provided as generic, no real secret used. It's a standard mock for dev.
          amount: amount * 100,
          currency: "INR",
          name: "GDX",
          description: `${planName} Subscription`,
          image: "https://your-logo-url.com/logo.png",
          handler: async function (response: any) {
              if (!user) {
                  alert("Please login first.");
                  return;
              }
              try {
                  const { db } = await getFirebase();
                  if (!db) throw new Error("Firebase DB not available");

                  const expiryDate = new Date();
                  expiryDate.setMonth(expiryDate.getMonth() + months);

                  await setDoc(doc(db, 'users', user.uid), {
                      isPremium: true,
                      planName: planName,
                      expiryDate: expiryDate.toISOString(),
                      updatedAt: new Date().toISOString()
                  }, { merge: true });

                  speak('Badhaai ho! Aapka GDX Premium ab active hai', 'professional');
                  alert(`Payment Successful! You are now subscribed to ${planName} plan.`);
                  onClose();
              } catch (error) {
                  console.error("Error updating user status:", error);
                  alert("Payment recorded, but failed to update status. Please contact support.");
              }
          },
          prefill: {
              name: user?.displayName || "",
              email: user?.email || "",
          },
          theme: {
              color: "#d4af37"
          }
      };

      const rzp1 = new (window as any).Razorpay(options);
      rzp1.on('payment.failed', function (response: any) {
          alert("Payment Failed: " + response.error.description);
      });
      rzp1.open();
      setIsProcessing(false);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] overflow-y-auto w-full h-full"
        style={{ perspective: '1000px', background: 'radial-gradient(circle at center, #1a1a1a 0%, #050505 100%)' }}
      >
        {isNearExpiry && (
          <div className="fixed top-[80px] left-1/2 transform -translate-x-1/2 z-[201] w-full max-w-md px-4">
            <motion.div 
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="bg-red-600/90 backdrop-blur-md text-white p-4 rounded-2xl border border-red-400 shadow-[0_0_20px_rgba(220,38,38,0.5)] flex items-center justify-center gap-3"
            >
              <ShieldAlert className="animate-pulse" />
              <div className="flex flex-col">
                <span className="font-black uppercase tracking-tighter text-sm">Urgent: Subscription Ending Soon!</span>
                <span className="text-[10px] opacity-80 uppercase font-bold tracking-widest">Renew now to maintain your cloud data & premium features</span>
              </div>
            </motion.div>
          </div>
        )}

        {/* Close Button */}
        <button 
          onMouseEnter={() => speak('Thank you for using GDX Website', 'sweet')}
          onClick={onClose}
          className="fixed top-6 right-6 text-gray-400 hover:text-white transition-colors z-[99999] p-2 bg-black/50 rounded-full"
        >
          <X size={24} />
        </button>

        <style>{`
          @keyframes fadeInUp {
              from { opacity: 0; transform: translateY(50px) scale(0.9); }
              to { opacity: 1; transform: translateY(0) scale(1); }
          }

          /* Glassmorphism Card with 3D Tilt */
          .card-3d {
              background: rgba(255, 255, 255, 0.03);
              backdrop-filter: blur(15px) saturate(180%);
              border: 1px solid rgba(212, 175, 55, 0.3);
              border-radius: 25px;
              padding: 40px;
              transition: all 0.5s cubic-bezier(0.23, 1, 0.32, 1);
              transform-style: preserve-3d; /* Enable 3D */
              animation: fadeInUp 0.8s ease backwards;
              position: relative;
              overflow: hidden;
              color: white;
              text-align: center;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
          }

          /* Jab mouse upar jaye toh 3D ghumna */
          .card-3d:hover {
              transform: rotateY(10deg) rotateX(5deg) translateY(-15px);
              border-color: #d4af37;
              box-shadow: 0 25px 50px rgba(212, 175, 55, 0.15);
              background: rgba(255, 255, 255, 0.07);
          }

          /* Shine Effect Filter */
          .card-3d::after {
              content: '';
              position: absolute;
              top: 0; left: -100%;
              width: 100%; height: 100%;
              background: linear-gradient(90deg, transparent, rgba(212,175,55,0.1), transparent);
              transition: 0.5s;
          }
          .card-3d:hover::after { left: 100%; }

          .gold-glow {
              text-shadow: 0 0 15px rgba(212, 175, 55, 0.5);
              color: #d4af37;
              margin: 10px 0;
          }

          /* 2. Coming Soon Overlay (Blur Filter) */
          .launch-overlay {
              position: fixed;
              top: 0; left: 0;
              width: 100%; height: 100%;
              background: rgba(0,0,0,0.85);
              backdrop-filter: blur(10px);
              z-index: 10000;
              display: flex;
              justify-content: center;
              align-items: center;
              text-align: center;
          }

          .pricing-wrap {
              display: flex;
              gap: 30px;
              justify-content: center;
              padding: 100px 20px;
              flex-wrap: wrap;
              min-height: 100vh;
              align-items: center;
          }

          .pricing-btn {
              margin-top: 20px;
              padding: 12px 30px;
              border-radius: 10px;
              font-weight: bold;
              font-size: 1rem;
              transition: 0.3s;
              width: 100%;
              border: none;
          }

          .btn-disabled {
              background: #333;
              color: #888;
              cursor: not-allowed;
          }

          .btn-active {
              background: linear-gradient(45deg, #d4af37, #f1c40f);
              color: #000;
              cursor: pointer;
          }

          .btn-active:hover {
              filter: brightness(1.1);
              transform: scale(1.05);
          }
        `}</style>
        
        <div className="pricing-wrap">
            {/* Why Premium Section */}
            <div className="w-full text-center mb-12 cursor-pointer group" onClick={() => handlePayment('Business', 9999, 12)}>
              <motion.h2 
                initial={{ y: 20, opacity: 0 }}
                whileInView={{ y: 0, opacity: 1 }}
                className="text-4xl md:text-5xl font-black text-white mb-4 uppercase tracking-tighter group-hover:text-yellow-500 transition-colors"
              >
                Unlock the <span className="text-yellow-500">Power</span> of GDX
              </motion.h2>
              <div className="flex flex-wrap justify-center gap-4 text-gray-400 text-sm font-bold uppercase tracking-widest bg-white/5 py-4 rounded-xl border border-white/10 group-hover:border-yellow-500 transition-all">
                <span className="flex items-center gap-2"><Crown size={14} className="text-yellow-500" /> Unlimited Entries</span>
                <span className="flex items-center gap-2"><Crown size={14} className="text-yellow-500" /> Auto Cloud Backup</span>
                <span className="flex items-center gap-2"><Crown size={14} className="text-yellow-500" /> WhatsApp Sharing</span>
                <span className="flex items-center gap-2"><Crown size={14} className="text-yellow-500" /> 1-Click Reports</span>
              </div>
              
              <button 
                className="mt-8 bg-yellow-500 text-black px-8 py-4 rounded-full font-black text-xl hover:bg-yellow-400 transition-all transform hover:scale-110 shadow-[0_0_30px_rgba(212,175,55,0.4)] animate-pulse"
              >
                Claim Premium Now
              </button>
              <p className="text-white/40 text-[10px] uppercase tracking-widest mt-4 font-bold">↑ Click anywhere above to start ↑</p>
            </div>

            <div className="card-3d w-full max-w-sm" style={{ animationDelay: '0.1s' }}>
                  <div className="text-left w-full mb-6 text-xs space-y-2 opacity-80 border-b border-white/10 pb-4">
                    <p className="flex items-center gap-2"><Crown size={12} className="text-yellow-500" /> 100 Entries Per Day Limit</p>
                    <p className="flex items-center gap-2"><Crown size={12} className="text-yellow-500" /> Limit Resets Every Morning</p>
                    <p className="flex items-center gap-2"><Crown size={12} className="text-yellow-500" /> Cloud Sync Included</p>
                  </div>
                  <h3 className="text-2xl font-bold mb-2">Daily Lite</h3>
                  <h1 className="gold-glow text-5xl">₹200<span className="text-xl text-gray-400 font-normal">/mo</span></h1>
                  <p className="text-gray-300 mt-2 italic text-sm mb-4">"Perfect for small shops"</p>
                  <button 
                      className="pricing-btn btn-active" 
                      disabled={isProcessing}
                      onClick={() => handlePayment('Lite', 200, 1)}
                  >
                      {isProcessing ? "Processing..." : "Buy Now"}
                  </button>
                </div>

            <div className="card-3d w-full max-w-sm" style={{ animationDelay: '0.15s' }}>
                  <div className="text-left w-full mb-6 text-xs space-y-2 opacity-80 border-b border-white/10 pb-4">
                    <p className="flex items-center gap-2"><Crown size={12} className="text-yellow-500" /> 200 Entries Per Day Limit</p>
                    <p className="flex items-center gap-2"><Crown size={12} className="text-yellow-500" /> High Performance Cloud</p>
                    <p className="flex items-center gap-2"><Crown size={12} className="text-yellow-500" /> Priority Support</p>
                  </div>
                  <h3 className="text-2xl font-bold mb-2">Daily Plus</h3>
                  <h1 className="gold-glow text-5xl">₹500<span className="text-xl text-gray-400 font-normal">/mo</span></h1>
                  <p className="text-gray-300 mt-2 italic text-sm mb-4">"Best for growing business"</p>
                  <button 
                      className="pricing-btn btn-active" 
                      disabled={isProcessing}
                      onClick={() => handlePayment('Plus', 500, 1)}
                  >
                      {isProcessing ? "Processing..." : "Buy Now"}
                  </button>
                </div>

            <div className="card-3d w-full max-w-sm" style={{ animationDelay: '0.2s' }}>
                  <div className="text-left w-full mb-6 text-xs space-y-2 opacity-80 border-b border-white/10 pb-4">
                    <p className="flex items-center gap-2"><Crown size={12} className="text-yellow-500" /> Cloud Sync & 24/7 Backup</p>
                    <p className="flex items-center gap-2"><Crown size={12} className="text-yellow-500" /> Professional PDF Reports</p>
                    <p className="flex items-center gap-2"><Crown size={12} className="text-yellow-500" /> Detailed Stock Tracking</p>
                  </div>
                  <h3 className="text-2xl font-bold mb-2">Basic Plan</h3>
                  <h1 className="gold-glow text-5xl">₹1,500<span className="text-xl text-gray-400 font-normal">/mo</span></h1>
                  <p className="text-gray-300 mt-2 italic text-sm mb-4">"Start your journey"</p>
                  <button 
                      className="pricing-btn btn-active" 
                      disabled={isProcessing}
                      onClick={() => handlePayment('Basic', 1500, 1)}
                  >
                      {isProcessing ? "Processing..." : "Buy Now"}
                  </button>
                </div>

                <div className="card-3d w-full max-w-sm" style={{ animationDelay: '0.4s', border: '2px solid #d4af37' }}>
                    <span style={{ position: 'absolute', top: '0', background: '#d4af37', color: '#000', padding: '4px 15px', borderRadius: '0 0 10px 10px', fontSize: '12px', fontWeight: 'bold' }}>Recommended</span>
                    <div className="text-left w-full mb-6 text-xs space-y-2 opacity-90 border-b border-white/10 pb-4 mt-4">
                      <p className="flex items-center gap-2"><Crown size={12} className="text-yellow-500" /> Everything in Basic</p>
                      <p className="flex items-center gap-2"><Crown size={12} className="text-yellow-500" /> Priority WhatsApp Support</p>
                      <p className="flex items-center gap-2"><Crown size={12} className="text-yellow-500" /> Custom GST Invoices</p>
                      <p className="flex items-center gap-2"><Crown size={12} className="text-yellow-500" /> Salesmen Management</p>
                    </div>
                    <h3 className="text-2xl font-bold mb-2">Business Elite</h3>
                    <h1 className="gold-glow text-5xl">₹9,999<span className="text-xl text-gray-400 font-normal">/yr</span></h1>
                    <p className="text-gray-300 mt-2 italic text-sm mb-4">"Best Value"</p>
                    <button 
                        className="pricing-btn btn-active" 
                        disabled={isProcessing}
                        onClick={() => handlePayment('Business', 9999, 12)}
                    >
                        {isProcessing ? "Processing..." : "Buy Now"}
                    </button>
                </div>

                <div className="card-3d w-full max-w-sm" style={{ animationDelay: '0.6s' }}>
                    <div className="text-left w-full mb-6 text-xs space-y-2 opacity-80 border-b border-white/10 pb-4">
                      <p className="flex items-center gap-2"><Crown size={12} className="text-yellow-500" /> Everything in Basic</p>
                      <p className="flex items-center gap-2"><Crown size={12} className="text-yellow-500" /> 3-Month Data Retention</p>
                      <p className="flex items-center gap-2"><Crown size={12} className="text-yellow-500" /> Multi-device Access</p>
                    </div>
                    <h3 className="text-2xl font-bold mb-2">Professional</h3>
                    <h1 className="gold-glow text-5xl">₹3,500<span className="text-xl text-gray-400 font-normal">/3mo</span></h1>
                    <p className="text-gray-300 mt-2 italic text-sm mb-4">"Most Popular"</p>
                    <button 
                        className="pricing-btn btn-active" 
                        disabled={isProcessing}
                        onClick={() => handlePayment('Professional', 3500, 3)}
                    >
                        {isProcessing ? "Processing..." : "Buy Now"}
                    </button>
                </div>
        </div>

      </motion.div>
    </AnimatePresence>
  );
}
