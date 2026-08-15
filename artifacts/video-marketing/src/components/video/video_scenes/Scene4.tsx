import React from 'react';
import { motion } from 'framer-motion';

export default function Scene4() {
  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1, filter: "blur(15px)" }}
      transition={{ duration: 1.2, ease: "easeInOut" }}
    >
      <motion.div
        className="w-[70vw] bg-coral text-cream rounded-[2vw] p-[4vw] shadow-lg flex flex-col items-center justify-center gap-[2vh] overflow-hidden relative"
        initial={{ clipPath: "inset(50% 50% 50% 50% round 2vw)" }}
        animate={{ clipPath: "inset(0% 0% 0% 0% round 2vw)" }}
        transition={{ duration: 1.5, delay: 0.3, ease: [0.25, 1, 0.5, 1] }}
      >
        <motion.div 
          className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent pointer-events-none" 
        />
        <motion.div
          initial={{ opacity: 0, y: '2vh' }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 1.2, ease: "easeOut" }}
        >
          <svg className="w-[3vw] h-[3vw] opacity-80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <path d="M12 16v-4"></path>
            <path d="M12 8h.01"></path>
          </svg>
        </motion.div>
        <motion.h2 
          className="font-display italic text-[4vw] tracking-tight m-0 text-center"
          initial={{ opacity: 0, y: '3vh' }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.2, delay: 1.5, ease: [0.2, 0.8, 0.2, 1] }}
        >
          What should I do right now?
        </motion.h2>
        <motion.div
          className="font-body text-[1.2vw] opacity-80 uppercase tracking-[0.1em]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 2.2 }}
        >
          Find clarity
        </motion.div>
      </motion.div>
    </motion.div>
  );
}