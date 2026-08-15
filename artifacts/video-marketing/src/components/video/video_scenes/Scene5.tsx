import React from 'react';
import { motion } from 'framer-motion';

const events = [
  { time: "10:00 AM", title: "Sync with Design", color: "bg-teal/10", border: "border-teal/30", text: "text-teal" },
  { time: "11:30 AM", title: "Focus Block", color: "bg-coral/10", border: "border-coral/30", text: "text-coral" },
  { time: "2:00 PM", title: "Weekly Review", color: "bg-sage/10", border: "border-sage/30", text: "text-sage" },
];

export default function Scene5() {
  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center p-[5vw]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, x: '-5vw', filter: "blur(10px)" }}
      transition={{ duration: 1.2, ease: "easeInOut" }}
    >
      <motion.div 
        className="w-full max-w-[55vw] bg-white/50 backdrop-blur-xl rounded-[1.5vw] border border-sage/20 shadow-sm overflow-hidden flex"
        initial={{ y: '10vh', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 1.5, ease: [0.25, 1, 0.5, 1] }}
      >
        <div className="w-[15vw] border-r border-sage/20 bg-cream/50 p-[2vw] flex flex-col">
          <motion.div 
            className="font-display italic text-[2.5vw] text-teal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 1 }}
          >
            Today
          </motion.div>
          <motion.div 
            className="font-body text-[1.2vw] text-sage mt-[0.5vh]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1, duration: 1 }}
          >
            Oct 12
          </motion.div>
        </div>
        
        <div className="flex-1 p-[2vw] flex flex-col gap-[1.5vh]">
          {events.map((ev, i) => (
            <motion.div
              key={i}
              className={`flex items-center gap-[2vw] p-[1.5vw] rounded-[0.8vw] border-l-[0.3vw] ${ev.color} ${ev.border} bg-white/40`}
              initial={{ opacity: 0, x: '3vw' }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 1.2, delay: 1.2 + i * 0.4, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <div className={`font-body text-[1.1vw] font-medium w-[6vw] shrink-0 text-teal/70`}>
                {ev.time}
              </div>
              <div className={`font-body text-[1.3vw] font-medium ${ev.text}`}>
                {ev.title}
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}