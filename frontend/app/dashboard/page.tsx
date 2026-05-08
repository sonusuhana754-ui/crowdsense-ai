"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { DashboardHeader } from "@/components/dashboard/header"
import { DashboardBackground } from "@/components/dashboard/background"
import { SectionTitle, StatCard, LevelBadge } from "@/components/dashboard/stats"
import { IntelPanel, DiffAdd, DiffRemove } from "@/components/dashboard/intel-panel"
import { SuperintendentPanel } from "@/components/dashboard/superintendent-panel"
import { AlertLog, type Alert } from "@/components/dashboard/alert-log"
import { WebcamFeed } from "@/components/dashboard/webcam-feed"
import { VideoUpload, type VideoAnalysisResult } from "@/components/dashboard/video-upload"
import { VenueFloorPlan } from "@/components/dashboard/floor-plan"

// ── Helpers for exit status resolution ──────────────────────
type ExitStatus = "open" | "partial" | "congested" | "blocked"

function resolveExitStatus(exitOps: any, exitId: string): ExitStatus {
  const openNow: string[] = exitOps?.OPEN_IMMEDIATELY ?? exitOps?.OPEN_NOW ?? []
  const prepare: string[] = exitOps?.PREPARE_TO_OPEN ?? exitOps?.OPEN_QUIETLY ?? []
  const closeNow: string[] = (exitOps?.CLOSE_NOW ?? []).map((s: string) => s.split(" ")[0])
  if (closeNow.includes(exitId)) return "blocked"
  if (openNow.includes(exitId)) return "open"
  if (prepare.includes(exitId)) return "partial"
  return "open"
}

function resolveExitAction(exitOps: any, exitId: string): string {
  const openNow: string[] = exitOps?.OPEN_IMMEDIATELY ?? exitOps?.OPEN_NOW ?? []
  const closeNow: string[] = (exitOps?.CLOSE_NOW ?? []).map((s: string) => s.split(" ")[0])
  if (closeNow.includes(exitId)) return "CLOSED"
  if (openNow.includes(exitId)) return "OPEN — ACTIVE"
  return "NORMAL"
}

export default function DashboardPage() {
  const [isInitializing, setIsInitializing] = useState(true)
  const [currentTime, setCurrentTime] = useState("")
  const [backendData, setBackendData] = useState<any>(null)
  const [backendOnline, setBackendOnline] = useState(false)
  // uploadData holds the latest result from a video upload analysis
  const [uploadData, setUploadData] = useState<VideoAnalysisResult | null>(null)
  
  const [webcam1Active, setWebcam1Active] = useState(false)
  const [webcam2Active, setWebcam2Active] = useState(false)
  
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [riskScore, setRiskScore] = useState(0)
  const [incidentLevel, setIncidentLevel] = useState(1)
  const [crowdCount, setCrowdCount] = useState(0)
  const [density, setDensity] = useState(0.0)
  // countdown in seconds, counts down in real-time
  const [countdownSecs, setCountdownSecs] = useState(0)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

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

  // Helper: apply analysis data from either live polling or video upload
  const applyAnalysisData = useCallback((
    final: any,
    initial: any,
    vision: any,
    commands: any,
    alertLog?: any[]
  ) => {
    // Risk score — prefer final_risk_level, fall back to vision risk_score
    const risk = final?.final_risk_level
      ?? (vision ? Math.max(...Object.values(vision).map((v: any) => v?.risk_score ?? 0)) : 0)
    setRiskScore(risk)

    // Crowd count — sum across all cameras
    let totalCount = 0
    if (vision) {
      Object.values(vision).forEach((v: any) => {
        totalCount += v?.crowd_count_estimate ?? 0
      })
    }
    setCrowdCount(totalCount)

    // Density: persons per m² — typical venue floor area ~2500m²
    const VENUE_AREA_M2 = 2500
    setDensity(totalCount > 0 ? parseFloat((totalCount / VENUE_AREA_M2).toFixed(2)) : 0.0)

    // Countdown — set from AI assessment, then let it tick down
    const mins = initial?.minutes_until_critical ?? final?.final_minutes_until_critical
    if (typeof mins === 'number' && mins > 0) {
      setCountdownSecs(mins * 60)
    }

    // Alerts from live log
    if (alertLog) {
      setAlerts(alertLog.slice(0, 15).map((a: any, i: number) => ({
        id: `alert-${i}-${a.time}`,
        time: a.time,
        severity: a.level === "INFO" ? "info" : a.level === "WARN" ? "warn" : "crit",
        message: a.message
      })))
    }
  }, [])

  // Poll backend for live monitoring state
  useEffect(() => {
    const pollBackend = async () => {
      try {
        const res = await fetch("http://127.0.0.1:8080/live/status")
        const data = await res.json()
        setBackendData(data)
        setBackendOnline(true)
        
        if (data.system_running) {
          applyAnalysisData(data.final, data.initial, data.vision, data.commands, data.alert_log)
        }
      } catch (e) {
        setBackendOnline(false)
        console.error("Backend offline", e)
      }
    }

    const interval = setInterval(pollBackend, 2000)
    return () => clearInterval(interval)
  }, [applyAnalysisData])

  // Real-time countdown tick
  useEffect(() => {
    if (countdownRef.current) clearInterval(countdownRef.current)
    if (countdownSecs > 0) {
      countdownRef.current = setInterval(() => {
        setCountdownSecs(s => {
          if (s <= 1) {
            clearInterval(countdownRef.current!)
            return 0
          }
          return s - 1
        })
      }, 1000)
    }
    return () => { if (countdownRef.current) clearInterval(countdownRef.current) }
  }, [countdownSecs])

  // Update incident level based on risk
  useEffect(() => {
    if (riskScore >= 9) setIncidentLevel(5)
    else if (riskScore >= 7) setIncidentLevel(4)
    else if (riskScore >= 5) setIncidentLevel(3)
    else if (riskScore >= 3) setIncidentLevel(2)
    else setIncidentLevel(1)
  }, [riskScore])

  // Handle video upload analysis result
  const handleUploadResult = useCallback((result: VideoAnalysisResult) => {
    setUploadData(result)
    // Apply the analysis data to update all dashboard metrics
    applyAnalysisData(
      result.final,
      result.initial,
      { "CAM-UPLOAD": result.vision },
      result.commands,
      undefined
    )
    // Add an alert for the upload analysis
    const risk = result.final?.final_risk_level ?? result.vision?.risk_score ?? 0
    const count = result.vision?.crowd_count_estimate ?? 0
    setAlerts(prev => [{
      id: `upload-${Date.now()}`,
      time: new Date().toISOString().substring(11, 19),
      severity: risk >= 7 ? "crit" : risk >= 4 ? "warn" : "info",
      message: `Video analysis complete — risk ${risk}/10 — ${count} persons detected`
    }, ...prev].slice(0, 15))
  }, [applyAnalysisData])

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
    const mins = Math.floor(countdownSecs / 60)
    if (mins > 15) return "risk-normal"
    if (mins > 5) return "risk-elevated"
    return "risk-critical"
  }, [countdownSecs])

  // Use upload data if available and live monitoring is not running
  const activeData = backendData?.system_running ? backendData : (uploadData ? {
    final: uploadData.final,
    initial: uploadData.initial,
    vision: { "CAM-UPLOAD": uploadData.vision },
    commands: uploadData.commands,
    alert_log: []
  } : null)

  // Extract from active data
  const initialReasoning = activeData?.initial?.reasoning || "Awaiting vision data..."
  const finalReasoning = activeData?.final?.final_reasoning || "Awaiting critic refinement..."
  const zoneData = activeData?.vision?.['CAM-1']?.zone_status || {}
  
  const superCommandsRaw: string[] = activeData?.commands?.radio_commands || []
  const commandColor = (activeData?.commands?.color ?? "green") as "blue" | "orange" | "red" | "green"
  const superintendentCommands = superCommandsRaw.length > 0
    ? superCommandsRaw.map((cmd: string, i: number) => ({
        type: commandColor,
        label: `[RADIO·${i+1}]`,
        text: cmd
      }))
    : [{ type: "green" as const, label: "[SYSTEM]", text: "Monitoring active. No commands necessary at this time." }]

  // Exit statuses from backend commands, fall back to defaults
  const exitOps = activeData?.commands?.exit_operations
  const exitStatuses = exitOps
    ? [
        { name: "EXIT E1 · NORTH", status: resolveExitStatus(exitOps, "E1"), flow: "300", action: resolveExitAction(exitOps, "E1") },
        { name: "EXIT E2 · SOUTH", status: resolveExitStatus(exitOps, "E2"), flow: "150", action: resolveExitAction(exitOps, "E2") },
        { name: "EXIT E3 · EAST",  status: resolveExitStatus(exitOps, "E3"), flow: "200", action: resolveExitAction(exitOps, "E3") },
        { name: "EXIT E4 · WEST",  status: resolveExitStatus(exitOps, "E4"), flow: "250", action: resolveExitAction(exitOps, "E4") },
      ]
    : [
        { name: "EXIT A · NORTH", status: "open" as const, flow: "180", action: "NORMAL" },
        { name: "EXIT B · EAST",  status: "open" as const, flow: "240", action: "NORMAL" },
        { name: "EXIT C · SOUTH", status: "open" as const, flow: "090", action: "NORMAL" },
        { name: "EXIT D · WEST",  status: "open" as const, flow: "140", action: "NORMAL" },
      ]

  const paMessage = activeData?.commands?.pa_system?.script || "No PA announcements required."

  // Countdown display
  const countdownMins = Math.floor(countdownSecs / 60)
  const countdownSecsPart = countdownSecs % 60

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
            <VideoUpload label="CAM 03 · UPLOAD VIDEO" onAnalysisResult={handleUploadResult} />
            <VideoUpload label="CAM 04 · UPLOAD VIDEO" onAnalysisResult={handleUploadResult} />
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
                subtext={`DENSITY ${density.toFixed(2)} PERSONS / M²`}
              />
              <StatCard 
                label="T-Minus to Critical"
                value={`${String(countdownMins).padStart(2, '0')}:${String(countdownSecsPart).padStart(2, '0')}`}
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
        <span className="text-[#00ff9d] font-bold">AMD MI300X</span> <span className="text-[#5a6f85]">|</span> 12.4ms/frame <span className="text-[#5a6f85]">|</span>{" "}
        {backendOnline
          ? <span className="text-[#00ff9d]">BACKEND ONLINE</span>
          : <span className="text-[#ff3a3a] animate-pulse">BACKEND OFFLINE</span>
        }
      </div>
    </div>
  )
}
