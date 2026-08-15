import React, { useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useVideoPlayer } from '@/lib/video/hooks';
import Scene1 from './video_scenes/Scene1';
import Scene2 from './video_scenes/Scene2';
import Scene3 from './video_scenes/Scene3';
import Scene4 from './video_scenes/Scene4';
import Scene5 from './video_scenes/Scene5';
import Scene6 from './video_scenes/Scene6';
import Scene7 from './video_scenes/Scene7';

const SCENE_DURATIONS = [
  4000, // 0: App Name
  6000, // 1: Greeting
  8000, // 2: Priority Tasks
  8000, // 3: What to do right now
  8000, // 4: Calendar
  8000, // 5: Voice capture
  6000, // 6: Close
];

export default function VideoTemplate() {
  const totalDuration = useMemo(
    () => SCENE_DURATIONS.reduce((a, b) => a + b, 0),
    []
  );

  const durations = useMemo(
    () => Object.fromEntries(SCENE_DURATIONS.map((d, i) => [`scene${i}`, d])),
    []
  );

  const { currentScene } = useVideoPlayer({ durations });

  return (
    <div className="relative w-[100vw] h-[100vh] bg-cream overflow-hidden flex items-center justify-center font-body text-dark">
      {/* Background persistent elements */}
      <motion.div 
        className="absolute w-[60vw] h-[60vw] rounded-full bg-sage/10 blur-[80px] pointer-events-none"
        animate={{
          x: currentScene === 0 ? '20vw' : currentScene === 3 ? '-20vw' : '10vw',
          y: currentScene === 2 ? '-10vh' : currentScene === 5 ? '10vh' : '0vh',
          scale: currentScene === 5 ? 1.5 : 1
        }}
        transition={{ duration: 4, ease: "easeInOut" }}
      />
      <motion.div 
        className="absolute w-[50vw] h-[50vw] rounded-full bg-coral/10 blur-[80px] pointer-events-none"
        animate={{
          x: currentScene === 1 ? '-20vw' : currentScene === 4 ? '20vw' : '-10vw',
          y: currentScene === 3 ? '20vh' : currentScene === 6 ? '-10vh' : '10vh',
        }}
        transition={{ duration: 5, ease: "easeInOut" }}
      />

      <AnimatePresence mode="sync">
        {currentScene === 0 && <Scene1 key="scene1" />}
        {currentScene === 1 && <Scene2 key="scene2" />}
        {currentScene === 2 && <Scene3 key="scene3" />}
        {currentScene === 3 && <Scene4 key="scene4" />}
        {currentScene === 4 && <Scene5 key="scene5" />}
        {currentScene === 5 && <Scene6 key="scene6" />}
        {currentScene === 6 && <Scene7 key="scene7" />}
      </AnimatePresence>
      
      {/* Noise Texture */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03] z-50" 
           style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }} 
      />
    </div>
  );
}