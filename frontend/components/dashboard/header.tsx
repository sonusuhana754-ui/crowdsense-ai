"use client"

import { motion } from "framer-motion"
import { AlertTriangle } from "lucide-react"
import Link from "next/link"

interface DashboardHeaderProps {
  currentTime: string
}

export function DashboardHeader({ currentTime }: DashboardHeaderProps) {
  return (
    <motion.header 
      className="bg-gradient-to-r from-[#0a0a0f] via-[#0f1722] to-[#0a0a0f] border-b border-[#00d4ff]/25 px-4 md:px-6 py-3 md:py-4"
      style={{ boxShadow: '0 0 24px rgba(0, 212, 255, 0.15)' }}
      initial={{ y: -50, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <div className="flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 md:gap-3">
          <AlertTriangle className="w-6 h-6 md:w-7 md:h-7 text-[#ff3a3a]" style={{ filter: 'drop-shadow(0 0 8px rgba(255, 58, 58, 0.6))' }} />
          <div className="font-mono text-sm md:text-lg font-bold tracking-wider flex items-center gap-1">
            <span className="text-[#ff3a3a]" style={{ textShadow: '0 0 10px rgba(255, 58, 58, 0.5)' }}>DISCLAIMER</span>
            <span className="hidden md:inline text-[#8aa0b4] font-normal ml-3 text-xs tracking-wider">
              | AMD MI300X POWERED
            </span>
          </div>
        </Link>
        
        <div className="flex items-center gap-2 font-mono text-sm md:text-base" style={{ color: '#00ff9d', textShadow: '0 0 8px rgba(0, 255, 157, 0.4)' }}>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#ff0000] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#ff0000]"></span>
          </span>
          <span className="hidden sm:inline">LIVE</span>
          <span className="ml-2">{currentTime}</span>
        </div>
      </div>
    </motion.header>
  )
}
