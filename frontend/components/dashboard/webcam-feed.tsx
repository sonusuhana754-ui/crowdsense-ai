"use client"

import { useRef, useState, useEffect, useCallback } from "react"
import { motion } from "framer-motion"
import { Camera, Power, Circle, Maximize2 } from "lucide-react"

interface WebcamFeedProps {
  label: string
  isActive: boolean
  onToggle: () => void
}

export function WebcamFeed({ label, isActive, onToggle }: WebcamFeedProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [fps, setFps] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const startCamera = useCallback(async () => {
    try {
      setError(null)
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user"
        } 
      })
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        streamRef.current = stream
      }
    } catch (err) {
      console.error("[v0] Failed to start webcam:", err)
      setError("Camera access denied")
    }
  }, [])

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }, [])

  useEffect(() => {
    if (isActive) {
      startCamera()
    } else {
      stopCamera()
    }
    return () => stopCamera()
  }, [isActive, startCamera, stopCamera])

  // Simulated FPS counter
  useEffect(() => {
    if (!isActive) {
      setFps(0)
      return
    }
    const interval = setInterval(() => {
      setFps(Math.floor(28 + Math.random() * 4))
    }, 1000)
    return () => clearInterval(interval)
  }, [isActive])

  return (
    <motion.div 
      className="relative bg-[#07090f] border border-[rgba(0,212,255,0.18)] rounded-lg overflow-hidden"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
    >
      {/* Camera Label */}
      <div className="absolute top-2 left-2 z-20 bg-black/70 text-[#00d4ff] font-mono text-[9px] md:text-[11px] px-2 py-1 rounded border border-[rgba(0,212,255,0.4)] tracking-wider">
        {label}
      </div>
      
      {/* Live Indicator */}
      {isActive && (
        <div className="absolute top-2 right-2 z-20 flex items-center gap-1.5 bg-black/70 px-2 py-1 rounded">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#ff0000] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#ff0000]"></span>
          </span>
          <span className="font-mono text-[9px] md:text-[10px] text-[#ff0000]">LIVE</span>
        </div>
      )}
      
      {/* Video Container */}
      <div className="aspect-video bg-[#05080d] relative">
        {isActive ? (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            
            {/* Scanning Overlay */}
            <div className="absolute inset-0 pointer-events-none">
              {/* Scan lines */}
              <motion.div
                className="absolute inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-[#00d4ff] to-transparent opacity-30"
                animate={{ top: ['0%', '100%'] }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              />
              
              {/* Corner markers */}
              <div className="absolute top-4 left-4 w-8 h-8 border-l-2 border-t-2 border-[#00d4ff]/60" />
              <div className="absolute top-4 right-4 w-8 h-8 border-r-2 border-t-2 border-[#00d4ff]/60" />
              <div className="absolute bottom-4 left-4 w-8 h-8 border-l-2 border-b-2 border-[#00d4ff]/60" />
              <div className="absolute bottom-4 right-4 w-8 h-8 border-r-2 border-b-2 border-[#00d4ff]/60" />
              
              {/* Detection boxes animation */}
              <motion.div
                className="absolute border-2 border-[#00ff9d] rounded"
                style={{ width: '15%', height: '25%' }}
                animate={{
                  left: ['20%', '60%', '30%', '50%'],
                  top: ['30%', '50%', '20%', '40%'],
                  opacity: [0.8, 0.6, 0.8, 0.6]
                }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              />
              <motion.div
                className="absolute border-2 border-[#ffd000] rounded"
                style={{ width: '12%', height: '20%' }}
                animate={{
                  left: ['50%', '25%', '65%', '35%'],
                  top: ['45%', '25%', '55%', '35%'],
                  opacity: [0.6, 0.8, 0.6, 0.8]
                }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
              />
            </div>
            
            {/* FPS Counter */}
            <div className="absolute bottom-2 left-2 bg-black/70 px-2 py-1 rounded font-mono text-[9px] md:text-[10px] text-[#00ff9d]">
              {fps} FPS
            </div>
            
            {/* AI Status */}
            <div className="absolute bottom-2 right-2 bg-black/70 px-2 py-1 rounded font-mono text-[9px] md:text-[10px] text-[#00d4ff] flex items-center gap-1.5">
              <motion.div 
                className="w-1.5 h-1.5 rounded-full bg-[#00d4ff]"
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
              />
              AI PROCESSING
            </div>
          </>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full">
            <Camera className="w-8 h-8 md:w-12 md:h-12 text-[#ff0000] mb-2" />
            <span className="font-mono text-[10px] md:text-xs text-[#ff0000]">{error}</span>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full">
            <Camera className="w-8 h-8 md:w-12 md:h-12 text-[#5a6f85] mb-2" />
            <span className="font-mono text-[10px] md:text-xs text-[#5a6f85]">CAMERA OFFLINE</span>
          </div>
        )}
      </div>
      
      {/* Controls */}
      <div className="flex items-center justify-between p-2 bg-[#05080d] border-t border-[#1a2332]">
        <button
          onClick={onToggle}
          className={`flex items-center gap-1.5 px-2 md:px-3 py-1.5 rounded font-mono text-[9px] md:text-[10px] tracking-wider transition-all ${
            isActive 
              ? 'bg-[#ff0000]/20 text-[#ff0000] border border-[#ff0000]/40 hover:bg-[#ff0000]/30' 
              : 'bg-[#00d4ff]/20 text-[#00d4ff] border border-[#00d4ff]/40 hover:bg-[#00d4ff]/30'
          }`}
        >
          <Power className="w-3 h-3" />
          {isActive ? 'STOP' : 'START'}
        </button>
        
        <div className="flex items-center gap-2">
          <button className="p-1.5 rounded border border-[#1a2332] text-[#5a6f85] hover:text-[#00d4ff] hover:border-[#00d4ff]/40 transition-colors">
            <Circle className="w-3 h-3" />
          </button>
          <button className="p-1.5 rounded border border-[#1a2332] text-[#5a6f85] hover:text-[#00d4ff] hover:border-[#00d4ff]/40 transition-colors">
            <Maximize2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    </motion.div>
  )
}
