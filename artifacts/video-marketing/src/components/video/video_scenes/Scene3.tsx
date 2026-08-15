import React from 'react';
import { motion } from 'framer-motion';

const tasks = [
  { id: 1, title: "Review Q3 marketing strategy", duration: "45m" },
  { id: 2, title: "Draft email to investors", duration: "20m" },
  { id: 3, title: "Finalize design system", duration: "1h" },
];

export default function Scene3() {
  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center p-[5vw]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: '-5vh', filter: "blur(10px)" }}
      transition={{ duration: 1.2, ease: "easeInOut" }}
    >
      <motion.div 
        className="w-full max-w-[50vw] flex flex-col gap-[2vh]"
        initial={{ y: '5vh' }}
        animate={{ y: 0 }}
        transition={{ duration: 1.5, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <motion.h2 
          className="font-body text-[1.2vw] text-sage mb-[2vh] uppercase tracking-[0.2em] font-medium"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.5 }}
        >
          Your priorities
        </motion.h2>

        {tasks.map((task, i) => (
          <motion.div
            key={task.id}
            className="flex items-center gap-[1.5vw] bg-white/70 p-[1.5vw] rounded-[1vw] shadow-sm border border-sage/20 backdrop-blur-md"
            initial={{ opacity: 0, x: '-2vw', scale: 0.98 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ duration: 1.2, delay: 1 + i * 0.6, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <div className="w-[3vw] h-[3vw] rounded-full bg-cream flex items-center justify-center text-teal font-display italic text-[1.8vw] border border-sage/30 shrink-0">
              {task.id}
            </div>
            <div className="flex-1">
              <div className="font-body text-[1.5vw] text-teal font-medium tracking-tight">
                {task.title}
              </div>
            </div>
            <div className="text-sage font-body text-[1.2vw] font-medium">
              {task.duration}
            </div>
          </motion.div>
        ))}
      </motion.div>
    </motion.div>
  );
}