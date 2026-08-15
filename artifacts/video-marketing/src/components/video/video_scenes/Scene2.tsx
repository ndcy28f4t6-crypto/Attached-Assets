import React from 'react';
import { motion } from 'framer-motion';

export default function Scene2() {
  const text = "Good morning, Satin.";
  const words = text.split(" ");
  
  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center p-[5vw]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, filter: "blur(20px)", scale: 1.05 }}
      transition={{ duration: 1.5, ease: "easeInOut" }}
    >
      <h1 className="font-display italic text-[7vw] leading-[1.1] text-teal text-center tracking-tight">
        {words.map((word, i) => (
          <motion.span
            key={i}
            className="inline-block mr-[2vw]"
            initial={{ opacity: 0, y: '3vh', rotateX: 20 }}
            animate={{ opacity: 1, y: 0, rotateX: 0 }}
            transition={{ 
              duration: 1.5, 
              delay: 0.2 + (i * 0.15), 
              ease: [0.2, 0.8, 0.2, 1] 
            }}
          >
            {word}
          </motion.span>
        ))}
      </h1>
    </motion.div>
  );
}