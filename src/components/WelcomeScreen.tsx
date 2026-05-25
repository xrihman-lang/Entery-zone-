import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Code, Gamepad2, Cpu, ChevronRight } from 'lucide-react';

interface WelcomeScreenProps {
  onEnter: () => void;
  key?: React.Key;
}

export function WelcomeScreen({ onEnter }: WelcomeScreenProps) {
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [isLoadingDone, setIsLoadingDone] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    let current = 0;
    const interval = setInterval(() => {
      current += Math.floor(Math.random() * 15) + 5;
      if (current >= 100) {
        current = 100;
        setIsLoadingDone(true);
        clearInterval(interval);
      }
      setLoadingProgress(current);
    }, 150);

    return () => clearInterval(interval);
  }, []);

  const handleMouseMove = (e: React.MouseEvent) => {
    setMousePos({
      x: (e.clientX / window.innerWidth - 0.5) * 20,
      y: (e.clientY / window.innerHeight - 0.5) * 20,
    });
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-black overflow-hidden perspective-1000 flex flex-col items-center justify-center font-sans"
      onMouseMove={handleMouseMove}
    >
      {/* Dynamic Background Elements */}
      <div 
        className="absolute inset-0 z-0 opacity-40 transition-transform duration-700 ease-out"
        style={{ transform: `translate(${-mousePos.x}px, ${-mousePos.y}px)` }}
      >
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/30 rounded-full blur-[120px] mix-blend-screen" />
        <div className="absolute bottom-1/4 right-1/4 w-[30rem] h-[30rem] bg-purple-600/20 rounded-full blur-[150px] mix-blend-screen" />
      </div>

      {/* Grid / Tech Background */}
      <div className="absolute inset-0 z-0 opacity-10 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,black_40%,transparent_100%)]" />

      {/* Particles effect */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full bg-blue-400"
            style={{
              width: Math.random() * 4 + 1 + 'px',
              height: Math.random() * 4 + 1 + 'px',
              left: Math.random() * 100 + '%',
              top: Math.random() * 100 + '%',
            }}
            animate={{
              y: [0, -Math.random() * 200 - 100],
              opacity: [0, Math.random() * 0.5 + 0.2, 0],
            }}
            transition={{
              duration: Math.random() * 5 + 5,
              repeat: Infinity,
              ease: "linear",
              delay: Math.random() * 5,
            }}
          />
        ))}
      </div>

      <AnimatePresence>
        {!isLoadingDone && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.9, filter: "blur(10px)" }}
            className="z-10 flex flex-col items-center"
          >
            <div className="text-blue-500 font-mono text-sm tracking-[0.3em] mb-4 uppercase">Initializing System</div>
            <div className="w-64 h-1 bg-gray-900 rounded-full overflow-hidden relative">
              <motion.div 
                className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-blue-600 to-purple-500 shadow-[0_0_15px_rgba(59,130,246,0.8)]"
                animate={{ width: `${loadingProgress}%` }}
                transition={{ type: "spring", bounce: 0, duration: 0.2 }}
              />
            </div>
            <div className="mt-2 text-gray-500 font-mono text-xs">{loadingProgress}%</div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isLoadingDone && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.8, filter: "blur(20px)" }}
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            transition={{ duration: 1.5, ease: "easeOut" }}
            className="z-10 flex flex-col items-center justify-center w-full max-w-4xl px-6 relative"
            style={{ transform: `translate(${mousePos.x * 0.5}px, ${mousePos.y * 0.5}px)` }}
          >
            {/* Logo Container */}
            <div className="relative group mb-8">
              {/* Outer Glow */}
              <motion.div 
                className="absolute inset-[-10%] bg-gradient-to-r from-blue-500 via-purple-600 to-blue-500 rounded-2xl blur-2xl opacity-40 mix-blend-screen"
                animate={{ 
                  opacity: [0.3, 0.6, 0.3],
                  scale: [0.95, 1.05, 0.95]
                }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              />
              
              {/* Light Streak */}
              <div className="absolute inset-0 overflow-hidden rounded-2xl z-20 pointer-events-none">
                <motion.div 
                  className="absolute inset-0 -translate-x-[150%] bg-gradient-to-r from-transparent via-white to-transparent opacity-20 w-[200%] skew-x-[-20deg]"
                  animate={{ translateX: ['-150%', '150%'] }}
                  transition={{ duration: 3, repeat: Infinity, repeatDelay: 5, ease: "easeInOut" }}
                />
              </div>

              {/* Logo Main */}
              <motion.img 
                src="https://i.postimg.cc/CM7ygX2m/GDX-BARND-LOGO.jpg" 
                alt="GDX MAYA NAGRI" 
                className="relative z-10 w-48 h-48 md:w-64 md:h-64 object-cover rounded-2xl border border-white/10 shadow-2xl shadow-blue-900/50"
                initial={{ transform: "rotateX(20deg) rotateY(0deg)" }}
                animate={{ 
                  transform: `rotateX(${-mousePos.y}deg) rotateY(${mousePos.x}deg)` 
                }}
                transition={{ type: "spring", stiffness: 75, damping: 20 }}
              />
            </div>

            {/* Typography */}
            <motion.div 
              className="text-center space-y-2 mb-10"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 1 }}
            >
              <h3 className="text-gray-400 font-mono text-sm tracking-[0.4em] uppercase mb-1">Welcome To</h3>
              <h1 className="text-4xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-gray-200 to-gray-500 tracking-tighter drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
                GDX MAYA NAGRI
              </h1>
              
              {/* Skills/Tags */}
              <div className="flex flex-wrap items-center justify-center gap-4 mt-6 pt-4 text-xs md:text-sm font-bold text-gray-400 tracking-widest uppercase">
                <div className="flex items-center gap-2">
                  <Code size={16} className="text-blue-500" />
                  <span>Web Developer</span>
                </div>
                <div className="w-1 h-1 rounded-full bg-gray-700 hidden md:block" />
                <div className="flex items-center gap-2">
                  <Gamepad2 size={16} className="text-purple-500" />
                  <span>Game Developer</span>
                </div>
                <div className="w-1 h-1 rounded-full bg-gray-700 hidden md:block" />
                <div className="flex items-center gap-2">
                  <Cpu size={16} className="text-emerald-500" />
                  <span>AI Developer</span>
                </div>
              </div>
            </motion.div>

            {/* Enter Button */}
            <motion.button
              onClick={onEnter}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1, duration: 0.8 }}
              className="group relative px-8 py-4 bg-transparent overflow-hidden rounded-xl border border-white/10 hover:border-blue-500/50 backdrop-blur-md transition-all active:scale-95"
            >
              {/* Button Bg Glow */}
              <div className="absolute inset-0 bg-white/5 group-hover:bg-blue-500/20 transition-colors duration-500" />
              
              <div className="relative z-10 flex items-center justify-center gap-3">
                <span className="text-white font-black tracking-[0.3em] uppercase text-sm">ENTER</span>
                <ChevronRight size={18} className="text-blue-400 group-hover:translate-x-1 group-hover:text-blue-300 transition-transform duration-300" />
              </div>
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
