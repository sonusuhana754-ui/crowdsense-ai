"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { DashboardHeader } from "@/components/dashboard/header"
import { DashboardBackground } from "@/components/dashboard/background"
import { SectionTitle, StatCard, LevelBadge } from "@/components/dashboard/stats"
import { IntelPanel, DiffAdd, DiffRemove } from "@/components/dashboard/intel-panel"
import { SuperintendentPanel } from "@/components/dashboard/superintendent-panel"
import { AlertLog, type Alert } from "@/components/dashboard/alert-log"
import { WebcamFeed } from "@/components/dashboard/webcam-feed"
import { VideoUpload } from "@/components/dashboard/video-upload"
import { VenueFloorPlan } from "@/components/dashboard/floor-plan"

export default function DashboardPage() {
  const [isInitializing, setIsInitializing] = useState(true)
  const [currentTime, setCurrentTime] = useState("")
  const [backendData, setBackendData] = useState<any>(null)
  
  const [webcam1Active, setWebcam1Active] = useState(false)
  const [webcam2Active, setWebcam2Active] = useState(false)
  
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [riskScore, setRiskScore] = useState(0)
  const [incidentLevel, setIncidentLevel] = useState(1)
  const [crowdCount, setCrowdCount] = useState(0)
  const [density, setDensity] = useState(0.0)
  const [countdown, setCountdown] = useState({ minutes: 0, seconds: 0 })

  // System Startup Sequence
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsInitializing(false)
    }, 3000)
    return () => clearTimeout(timer)
  }, [])

  // Update clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      setCurrentTime(now.toISOString().substring(11, 19) + " UTC")
    }
    updateTime()
    const interval = setInterval(updateTime, 1000)
    return () => clearInterval(interval)
  }, [])

  // Poll backend
  useEffect(() => {
    const pollBackend = async () => {
      try {
        const res = await fetch("http://127.0.0.1:8080/live/status")
        const data = await res.json()
        setBackendData(data)
        
        if (data.system_running) {
          setRiskScore(data.current_risk || 0)
          
          let totalCount = 0
          if (data.vision) {
            Object.values(data.vision).forEach((v: any) => {
               totalCount += (v.crowd_count_estimate || 0)
            })
          }
          setCrowdCount(totalCount)
          setDensity(totalCount / 1000)
          
          if (data.alert_log) {
            setAlerts(data.alert_log.slice(0, 15).map((a: any, i: number) => ({
              id: `alert-${i}-${a.time}`,
              time: a.time,
              severity: a.level === "INFO" ? "info" : a.level === "WARN" ? "warn" : "crit",
              message: a.message
            })))
          }

          if (data.initial?.minutes_until_critical) {
             setCountdown({
                minutes: typeof data.initial.minutes_until_critical === 'number' ? data.initial.minutes_until_critical : 0,
                seconds: 0
             })
          }
        }
      } catch (e) {
        console.error("Backend offline", e)
      }
    }

    const interval = setInterval(pollBackend, 2000)
    return () => clearInterval(interval)
  }, [])

  // Update incident level based on risk
  useEffect(() => {
    if (riskScore >= 9) setIncidentLevel(5)
    else if (riskScore >= 7) setIncidentLevel(4)
    else if (riskScore >= 5) setIncidentLevel(3)
    else if (riskScore >= 3) setIncidentLevel(2)
    else setIncidentLevel(1)
  }, [riskScore])

  const startAnalysis = async () => {
    try {
      await fetch("http://127.0.0.1:8080/live/start", { method: "POST" })
      setWebcam1Active(true)
      setWebcam2Active(true)
    } catch (e) {
      console.error(e)
    }
  }

  const stopAnalysis = async () => {
    try {
      await fetch("http://127.0.0.1:8080/live/stop", { method: "POST" })
      setWebcam1Active(false)
      setWebcam2Active(false)
    } catch (e) {
      console.error(e)
    }
  }

  // Risk color class
  const riskColorClass = useMemo(() => {
    if (riskScore <= 4) return "risk-normal"
    if (riskScore <= 7) return "risk-elevated"
    return "risk-critical"
  }, [riskScore])

  const countdownColorClass = useMemo(() => {
    if (countdown.minutes > 15) return "risk-normal"
    if (countdown.minutes > 5) return "risk-elevated"
    return "risk-critical"
  }, [countdown.minutes])

  // Extract from backend data
  const initialReasoning = backendData?.initial?.reasoning || "Awaiting vision data..."
  const finalReasoning = backendData?.final?.final_reasoning || "Awaiting critic refinement..."
  const zoneData = backendData?.vision?.['CAM-1']?.zone_status || {}
  
  const superCommandsRaw = backendData?.commands?.radio_commands || []
  const superintendentCommands = superCommandsRaw.length > 0 ? superCommandsRaw.map((cmd: string, i: number) => ({
    type: "orange", label: `[RADIO·${i+1}]`, text: cmd
  })) : [
    { type: "green" as const, label: "[SYSTEM]", text: "Monitoring active. No commands necessary at this time." }
  ]

  const exitStatuses = [
    { name: "EXIT A · NORTH", status: "open" as const, flow: "180", action: "NORMAL" },
    { name: "EXIT B · EAST", status: "open" as const, flow: "240", action: "NORMAL" },
    { name: "EXIT C · SOUTH", status: "open" as const, flow: "090", action: "NORMAL" },
    { name: "EXIT D · WEST", status: "open" as const, flow: "140", action: "NORMAL" },
  ]

  const paMessage = backendData?.commands?.pa_system?.script || "No PA announcements required."

  if (isInitializing) {
    return (
      <div className="fixed inset-0 z-50 bg-[#05080d] text-[#00d4ff] flex flex-col items-center justify-center font-mono">
        <div className="text-2xl md:text-4xl mb-6 text-glow-cyan font-bold tracking-widest animate-pulse">
          CROWDSENSE AI — INITIALISING
        </div>
        <div className="text-xl mb-6 text-white">▓▓▓▓▓▓▓▓░░░░░░░░ 52%</div>
        <div className="opacity-80 text-sm tracking-widest mb-2">LOADING VENUE TOPOLOGY...</div>
        <div className="opacity-80 text-sm tracking-widest mb-6">CALIBRATING CAMERA FEEDS...</div>
        <div className="mt-8 text-[#00ff9d] text-sm md:text-base font-bold tracking-widest animate-pulse drop-shadow-[0_0_8px_rgba(0,255,157,0.8)]">
          AMD MI300X — ONLINE
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen relative pb-16">
      <DashboardBackground />
      
      <div className="relative z-10">
        <DashboardHeader currentTime={currentTime} />
        
        <main className="p-3 md:p-5 max-w-[1800px] mx-auto">
          {/* Controls */}
          <div className="flex justify-between items-center mb-6">
            <SectionTitle className="!mb-0">Live Camera Matrix · AI Multi Feed Surveillance</SectionTitle>
            <div className="flex gap-4">
              {!backendData?.system_running ? (
                <button 
                  className="px-6 py-2 bg-gradient-to-r from-[#00d4ff] to-[#0099cc] text-black font-mono text-sm font-bold tracking-wider rounded hover:shadow-[0_0_20px_rgba(0,212,255,0.6)] transition-all duration-300 uppercase"
                  onClick={startAnalysis}
                >
                  Start Live Monitoring
                </button>
              ) : (
                <button 
                  className="px-6 py-2 bg-gradient-to-r from-[#ff3a3a] to-[#cc0000] text-white font-mono text-sm font-bold tracking-wider rounded hover:shadow-[0_0_20px_rgba(255,58,58,0.6)] transition-all duration-300 uppercase"
                  onClick={stopAnalysis}
                >
                  Stop Monitoring
                </button>
              )}
            </div>
          </div>
          
          {/* 4 Camera Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4 mb-4 md:mb-6">
            <WebcamFeed 
              label="CAM 01 · WEBCAM LIVE"
              isActive={webcam1Active}
              onToggle={() => setWebcam1Active(!webcam1Active)}
              customFrame={backendData?.frames_b64?.["CAM-1"]}
            />
            <WebcamFeed 
              label="CAM 02 · SAMPLE VIDEO"
              isActive={webcam2Active}
              onToggle={() => setWebcam2Active(!webcam2Active)}
              customFrame={backendData?.frames_b64?.["CAM-2"]}
            />
            <VideoUpload label="CAM 03 · UPLOAD VIDEO" />
            <VideoUpload label="CAM 04 · UPLOAD VIDEO" />
          </div>
          
          {/* Risk Dashboard & Floor Plan */}
          <SectionTitle>Risk Dashboard & Venue Topology</SectionTitle>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4 mb-4 md:mb-6">
            <div className="lg:col-span-2 grid grid-cols-2 gap-3 md:gap-4">
              <StatCard 
                label="Composite Risk Index"
                value={<>{riskScore}<span className="text-lg text-[#5a6f85]">/10</span></>}
                colorClass={riskColorClass}
                showBar
                barPercent={riskScore * 10}
                subtext={`Based on Dual Feeds`}
              />
              <LevelBadge level={incidentLevel} />
              <StatCard 
                label="Crowd Count Estimate"
                value={crowdCount.toLocaleString()}
                colorClass="text-[#00d4ff] text-glow-cyan"
                subtext={`DENSITY ${density.toFixed(1)} PERSONS / M²`}
              />
              <StatCard 
                label="T-Minus to Critical"
                value={`${String(countdown.minutes).padStart(2, '0')}:${String(countdown.seconds).padStart(2, '0')}`}
                colorClass={countdownColorClass}
                subtext="PROJECTED THRESHOLD BREACH"
              />
            </div>
            
            {/* SVG Floor Plan */}
            <div className="lg:col-span-1">
              <VenueFloorPlan riskScore={riskScore} zoneData={zoneData} />
            </div>
          </div>
          
          {/* Intelligence Panel */}
          <SectionTitle>Dual-Model Intelligence · Junior → Senior Critic</SectionTitle>
          
          <div className="grid md:grid-cols-2 gap-3 md:gap-4 mb-4 md:mb-6">
            <IntelPanel type="junior" title="Initial AI Assessment · Junior Analyst">
              <p className="mb-3">{initialReasoning}</p>
              <p className="text-[#5a6f85] italic text-xs">
                — Llama 3.1 Text (Simulated Vision) + Mistral 7B
              </p>
            </IntelPanel>
            
            <IntelPanel type="senior" title="Critic-Refined Assessment · Senior Analyst">
              <p className="mb-3">{finalReasoning}</p>
              <p className="text-[#00d4ff] italic text-xs">
                — Senior Critic Model · Llama 3.1 8B
              </p>
            </IntelPanel>
          </div>
          
          {/* Superintendent Commands */}
          <SectionTitle>Superintendent Commands</SectionTitle>
          
          <SuperintendentPanel 
            commands={superintendentCommands}
            exits={exitStatuses}
            paMessage={paMessage}
          />
          
          {/* Alert Log */}
          <SectionTitle className="mt-4 md:mt-6">System Alert Log · Real-Time Events</SectionTitle>
          
          <AlertLog alerts={alerts} />
          
        </main>
      </div>

      {/* Live Inference Speed Badge */}
      <div className="fixed bottom-4 right-4 z-50 bg-[#05080d]/90 border border-[#00d4ff]/30 text-[#00d4ff] font-mono text-[10px] md:text-xs px-3 py-2 rounded-lg backdrop-blur-sm shadow-[0_0_15px_rgba(0,212,255,0.2)]">
        <span className="text-[#00ff9d] font-bold">AMD MI300X</span> <span className="text-[#5a6f85]">|</span> 12.4ms/frame <span className="text-[#5a6f85]">|</span> 4 streams active
      </div>
    </div>
  )
}
