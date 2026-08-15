import React from 'react';
import { motion } from 'framer-motion';

export default function Scene6() {
  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center p-[5vw]"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.2, filter: "blur(20px)" }}
      transition={{ duration: 1.5, ease: "easeInOut" }}
    >
      <div className="relative flex items-center justify-center w-[15vw] h-[15vw] mb-[6vh]">
        {/* Pulsing rings */}
        <motion.div 
          className="absolute inset-0 rounded-full border border-coral/30"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 2, opacity: [0, 1, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeOut", delay: 0 }}
        />
        <motion.div 
          className="absolute inset-0 rounded-full border border-coral/20"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 2.5, opacity: [0, 1, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeOut", delay: 1 }}
        />
        <motion.div 
          className="absolute inset-0 rounded-full border border-coral/10"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 3, opacity: [0, 1, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeOut", delay: 2 }}
        />
        
        {/* Main mic button */}
        <motion.div 
          className="w-full h-full rounded-full bg-coral shadow-xl shadow-coral/20 flex items-center justify-center text-cream relative z-10"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 120, damping: 20, delay: 0.5 }}
        >
          <svg className="w-[5vw] h-[5vw]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="22" />
          </svg>
        </motion.div>
      </div>

      <motion.h2 
        className="font-display italic text-[3.5vw] text-teal tracking-tight text-center"
        initial={{ opacity: 0, y: '3vh' }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.2, delay: 1.2, ease: "easeOut" }}
      >
        Say it before you lose it.
      </motion.h2>
      
      <motion.div
        className="font-body text-[1.2vw] text-sage mt-[2vh] max-w-[35vw] text-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 1.8 }}
      >
        Voice capture turns your messy thoughts into structured tasks, instantly.
      </motion.div>
    </motion.div>
  );
}