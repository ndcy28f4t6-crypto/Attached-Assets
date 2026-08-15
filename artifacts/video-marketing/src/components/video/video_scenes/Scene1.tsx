import React from 'react';
import { motion } from 'framer-motion';

export default function Scene1() {
  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.95, filter: "blur(10px)" }}
      transition={{ duration: 1.5, ease: [0.25, 1, 0.5, 1] }}
    >
      <motion.div
        initial={{ y: '2vh', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 1.5, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col items-center gap-[2vh]"
      >
        <div className="font-display italic text-[5vw] tracking-tight text-teal">
          My Day AI
        </div>
      </motion.div>
    </motion.div>
  );
}