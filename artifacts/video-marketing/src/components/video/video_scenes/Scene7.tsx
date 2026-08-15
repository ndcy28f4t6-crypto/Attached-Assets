import React from 'react';
import { motion } from 'framer-motion';

export default function Scene7() {
  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center p-[5vw]"
      initial={{ opacity: 0, filter: "blur(20px)" }}
      animate={{ opacity: 1, filter: "blur(0px)" }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 2, ease: [0.25, 1, 0.5, 1] }}
    >
      <motion.div
        className="font-display italic text-[5vw] text-teal tracking-tight mb-[2vh]"
        initial={{ opacity: 0, y: '2vh' }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.5, delay: 0.8, ease: "easeOut" }}
      >
        My Day AI
      </motion.div>
      
      <motion.div
        className="font-body text-[1.5vw] text-sage uppercase tracking-[0.2em]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 2, delay: 2 }}
      >
        Your day, held gently.
      </motion.div>
    </motion.div>
  );
}