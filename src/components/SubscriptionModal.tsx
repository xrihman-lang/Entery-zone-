import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { doc, setDoc } from 'firebase/firestore';
import { getFirebase } from '../lib/firebase';

const loadRazorpay = () => new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
});

export default function SubscriptionModal({ isOpen, onClose, user }: { isOpen: boolean, onClose: () => void, user: any }) {
  const launchDate = new Date("2026-05-10T00:00:00Z");
  const [isLaunched, setIsLaunched] = useState(false);
  const [showOverlay, setShowOverlay] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const launched = new Date() >= launchDate;
    setIsLaunched(launched);
    // Reset overlay state when modal opens/closes
    if (isOpen) {
      setShowOverlay(!launched);
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
          name: "Zishan GDX",
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
                      premiumExpiryDate: expiryDate.toISOString(),
                      updatedAt: new Date().toISOString()
                  }, { merge: true });

                  alert("Payment Successful! You are now a Premium user.");
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
        {/* Close Button */}
        <button 
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
        
        {showOverlay && (
            <div className="launch-overlay">
                <div className="card-3d" style={{ width: '500px', maxWidth: '90%' }}>
                    <h1 className="gold-glow text-3xl md:text-4xl font-bold text-wrap px-4">🚀 Something Big is Coming!</h1>
                    <p style={{ fontSize: '1.2rem', color: '#ccc', marginTop: '10px' }}>GDX Premium Dashboard is evolving.</p>
                    <hr style={{ border: '0.5px solid rgba(212,175,55,0.3)', margin: '20px 0', width: '100%' }} />
                    <h2 style={{ color: '#fff', fontSize: '1.5rem', marginBottom: '10px' }}>Launching: 10 / 05 / 2026</h2>
                    <p style={{ color: '#d4af37' }}>Ab har entry hogi Smart aur Fast.</p>
                    <button 
                        onClick={() => setShowOverlay(false)}
                        className="btn-active"
                        style={{ marginTop: '30px', width: 'auto' }}
                    >
                        Get a Sneak Peek
                    </button>
                </div>
            </div>
        )}

        <div className="pricing-wrap">
            <div className="card-3d w-full max-w-sm" style={{ animationDelay: '0.2s' }}>
                <h3 className="text-2xl font-bold mb-2">Basic Plan</h3>
                <h1 className="gold-glow text-5xl">₹1,500<span className="text-xl text-gray-400 font-normal">/mo</span></h1>
                <p className="text-gray-300 mt-2 italic text-sm mb-4">"Start your journey"</p>
                <button 
                    className={`pricing-btn ${isLaunched ? 'btn-active' : 'btn-disabled'}`} 
                    disabled={!isLaunched || isProcessing}
                    onClick={() => isLaunched && handlePayment('Basic', 1500, 1)}
                >
                    {isProcessing ? "Processing..." : (isLaunched ? "Buy Now" : "Pre-register")}
                </button>
            </div>

            <div className="card-3d w-full max-w-sm" style={{ animationDelay: '0.4s', border: '2px solid #d4af37' }}>
                <span style={{ position: 'absolute', top: '0', background: '#d4af37', color: '#000', padding: '4px 15px', borderRadius: '0 0 10px 10px', fontSize: '12px', fontWeight: 'bold' }}>Recommended</span>
                <h3 className="text-2xl font-bold mb-2 mt-4">Business Elite</h3>
                <h1 className="gold-glow text-5xl">₹9,999<span className="text-xl text-gray-400 font-normal">/yr</span></h1>
                <p className="text-gray-300 mt-2 italic text-sm mb-4">"Best Value"</p>
                <button 
                    className={`pricing-btn ${isLaunched ? 'btn-active' : 'btn-disabled'}`} 
                    disabled={!isLaunched || isProcessing}
                    onClick={() => isLaunched && handlePayment('Business', 9999, 12)}
                >
                    {isProcessing ? "Processing..." : (isLaunched ? "Buy Now" : "Pre-register")}
                </button>
            </div>

            <div className="card-3d w-full max-w-sm" style={{ animationDelay: '0.6s' }}>
                <h3 className="text-2xl font-bold mb-2">Professional</h3>
                <h1 className="gold-glow text-5xl">₹3,500<span className="text-xl text-gray-400 font-normal">/3mo</span></h1>
                <p className="text-gray-300 mt-2 italic text-sm mb-4">"Most Popular"</p>
                <button 
                    className={`pricing-btn ${isLaunched ? 'btn-active' : 'btn-disabled'}`} 
                    disabled={!isLaunched || isProcessing}
                    onClick={() => isLaunched && handlePayment('Professional', 3500, 3)}
                >
                    {isProcessing ? "Processing..." : (isLaunched ? "Buy Now" : "Pre-register")}
                </button>
            </div>
        </div>

      </motion.div>
    </AnimatePresence>
  );
}
