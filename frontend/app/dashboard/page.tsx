"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { motion } from "framer-motion"
import { DashboardHeader } from "@/components/dashboard/header"
import { DashboardBackground } from "@/components/dashboard/background"
import { SectionTitle, StatCard, LevelBadge } from "@/components/dashboard/stats"
import { SuperintendentPanel } from "@/components/dashboard/superintendent-panel"
import { AlertLog, type Alert } from "@/components/dashboard/alert-log"
import { WebcamFeed } from "@/components/dashboard/webcam-feed"
import { VideoUpload, type VideoAnalysisResult } from "@/components/dashboard/video-upload"
import { VenueFloorPlan } from "@/components/dashboard/floor-plan"
import { LiveReasoningStream, type BackendData } from "@/components/dashboard/live-reasoning-stream"

// ── Exit status helpers ──────────────────────────────────────
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
  const [backendData, setBackendData] = useState<BackendData | null>(null)
  const [backendOnline, setBackendOnline] = useState(false)
  const [uploadData, setUploadData] = useState<VideoAnalysisResult | null>(null)

  const [webcam1Active, setWebcam1Active] = useState(false)
  const [webcam2Active, setWebcam2Active] = useState(false)

  const [alerts, setAlerts] = useState<Alert[]>([])
  const [riskScore, setRiskScore] = useState(0)
  const [incidentLevel, setIncidentLevel] = useState(1)
  const [crowdCount, setCrowdCount] = useState(0)
  const [density, setDensity] = useState(0.0)
  const [countdownSecs, setCountdownSecs] = useState(0)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Boot sequence
  useEffect(() => {
    const t = setTimeout(() => setIsInitializing(false), 3000)
    return () => clearTimeout(t)
  }, [])

  // Clock
  useEffect(() => {
    const tick = () => setCurrentTime(new Date().toISOString().substring(11, 19) + " UTC")
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  // Apply analysis data to all dashboard metrics
  const applyAnalysisData = useCallback((
    final: any, initial: any, vision: any, commands: any, alertLog?: any[]
  ) => {
    const risk = final?.final_risk_level
      ?? (vision ? Math.max(0, ...Object.values(vision).map((v: any) => v?.risk_score ?? 0)) : 0)
    setRiskScore(risk)

    let totalCount = 0
    if (vision) Object.values(vision).forEach((v: any) => { totalCount += v?.crowd_count_estimate ?? 0 })
    setCrowdCount(totalCount)
    setDensity(totalCount > 0 ? parseFloat((totalCount / 2500).toFixed(2)) : 0.0)

    const mins = initial?.minutes_until_critical ?? final?.final_minutes_until_critical
    if (typeof mins === "number" && mins > 0) setCountdownSecs(mins * 60)

    if (alertLog) {
      setAlerts(alertLog.slice(0, 20).map((a: any, i: number) => ({
        id: `a-${i}-${a.time}`,
        time: a.time,
        severity: (a.level === "CRIT" ? "crit" : a.level === "WARN" ? "warn" : "info") as Alert["severity"],
        message: a.message,
      })))
    }
  }, [])

  // Poll backend
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch("http://127.0.0.1:8080/live/status")
        const data = await res.json()
        setBackendData(data)
        setBackendOnline(true)
        if (data.system_running) {
          applyAnalysisData(data.final, data.initial, data.vision, data.commands, data.alert_log)
        }
      } catch {
        setBackendOnline(false)
      }
    }
    const id = setInterval(poll, 2000)
    return () => clearInterval(id)
  }, [applyAnalysisData])

  // Countdown tick
  useEffect(() => {
    if (countdownRef.current) clearInterval(countdownRef.current)
    if (countdownSecs > 0) {
      countdownRef.current = setInterval(() => {
        setCountdownSecs(s => { if (s <= 1) { clearInterval(countdownRef.current!); return 0 } return s - 1 })
      }, 1000)
    }
    return () => { if (countdownRef.current) clearInterval(countdownRef.current) }
  }, [countdownSecs])

  // Incident level from risk
  useEffect(() => {
    if (riskScore >= 9) setIncidentLevel(5)
    else if (riskScore >= 7) setIncidentLevel(4)
    else if (riskScore >= 5) setIncidentLevel(3)
    else if (riskScore >= 3) setIncidentLevel(2)
    else setIncidentLevel(1)
  }, [riskScore])

  // Video upload result
  const handleUploadResult = useCallback((result: VideoAnalysisResult) => {
    setUploadData(result)
    applyAnalysisData(result.final, result.initial, { "CAM-UPLOAD": result.vision }, result.commands)
    const risk = result.final?.final_risk_level ?? result.vision?.risk_score ?? 0
    const count = result.vision?.crowd_count_estimate ?? 0
    setAlerts(prev => [{
      id: `up-${Date.now()}`,
      time: new Date().toISOString().substring(11, 19),
      severity: (risk >= 7 ? "crit" : risk >= 4 ? "warn" : "info") as Alert["severity"],
      message: `Video analysis complete — risk ${risk}/10 — ${count} persons detected`,
    }, ...prev].slice(0, 20))
  }, [applyAnalysisData])

  const startAnalysis = async () => {
    try { await fetch("http://127.0.0.1:8080/live/start", { method: "POST" }); setWebcam1Active(true); setWebcam2Active(true) } catch {}
  }
  const stopAnalysis = async () => {
    try { await fetch("http://127.0.0.1:8080/live/stop", { method: "POST" }); setWebcam1Active(false); setWebcam2Active(false) } catch {}
  }
  const triggerDemo = async (s: "normal" | "elevated" | "critical" | "catastrophic") => {
    try { await fetch(`http://127.0.0.1:8080/demo/scenario?scenario=${s}`, { method: "POST" }) } catch {}
  }
  const resetDemo = async () => {
    try {
      await fetch("http://127.0.0.1:8080/demo/reset", { method: "POST" })
      setRiskScore(0); setCrowdCount(0); setDensity(0); setCountdownSecs(0); setAlerts([]); setUploadData(null)
    } catch {}
  }

  const riskColorClass = useMemo(() => riskScore >= 8 ? "risk-critical" : riskScore >= 5 ? "risk-elevated" : "risk-normal", [riskScore])
  const countdownColorClass = useMemo(() => {
    const m = Math.floor(countdownSecs / 60)
    return m > 15 ? "risk-normal" : m > 5 ? "risk-elevated" : "risk-critical"
  }, [countdownSecs])

  // Active data source
  const activeData: BackendData | null = backendData?.system_running ? backendData : (uploadData ? {
    final: uploadData.final, initial: uploadData.initial,
    vision: { "CAM-UPLOAD": uploadData.vision }, commands: uploadData.commands, alert_log: [],
  } : null)

  const superCommandsRaw: string[] = activeData?.commands?.radio_commands ?? []
  const commandColor = (activeData?.commands?.color ?? "green") as "blue" | "orange" | "red" | "green"
  const superintendentCommands = superCommandsRaw.length > 0
    ? superCommandsRaw.map((cmd, i) => ({ type: commandColor, label: `[RADIO·${i + 1}]`, text: cmd }))
    : [{ type: "green" as const, label: "[SYSTEM]", text: "Monitoring active. No commands required at this time." }]

  const exitOps = (activeData?.commands as any)?.exit_operations
  const exitStatuses = exitOps ? [
    { name: "EXIT E1 · NORTH", status: resolveExitStatus(exitOps, "E1"), flow: "300", action: resolveExitAction(exitOps, "E1") },
    { name: "EXIT E2 · SOUTH", status: resolveExitStatus(exitOps, "E2"), flow: "150", action: resolveExitAction(exitOps, "E2") },
    { name: "EXIT E3 · EAST",  status: resolveExitStatus(exitOps, "E3"), flow: "200", action: resolveExitAction(exitOps, "E3") },
    { name: "EXIT E4 · WEST",  status: resolveExitStatus(exitOps, "E4"), flow: "250", action: resolveExitAction(exitOps, "E4") },
  ] : [
    { name: "EXIT A · NORTH", status: "open" as const, flow: "180", action: "NORMAL" },
    { name: "EXIT B · EAST",  status: "open" as const, flow: "240", action: "NORMAL" },
    { name: "EXIT C · SOUTH", status: "open" as const, flow: "090", action: "NORMAL" },
    { name: "EXIT D · WEST",  status: "open" as const, flow: "140", action: "NORMAL" },
  ]

  const paMessage = (activeData?.commands as any)?.pa_system?.script ?? "No PA announcements required."
  const countdownMins = Math.floor(countdownSecs / 60)
  const countdownSecsPart = countdownSecs % 60

  // Audio data for display
  const audioData = activeData?.audio as any
  const audioRisk = audioData?.audio_risk_score ?? 0
  const audioConcern = (audioData?.audio_concern_level ?? "low").toUpperCase()
  const audioTranscript = audioData?.transcription ?? "—"
  const panicWords = audioData?.panic_words_found ?? []
  const screaming = audioData?.screaming_likely ?? false

  if (isInitializing) {
    return (
      <div className="fixed inset-0 z-50 bg-[#05080d] text-[#00d4ff] flex flex-col items-center justify-center font-mono">
        <div className="text-2xl md:text-4xl mb-6 text-glow-cyan font-bold tracking-widest animate-pulse">CROWDSENSE AI — INITIALISING</div>
        <div className="text-xl mb-6 text-white">▓▓▓▓▓▓▓▓░░░░░░░░ 52%</div>
        <div className="opacity-80 text-sm tracking-widest mb-2">LOADING VENUE TOPOLOGY...</div>
        <div className="opacity-80 text-sm tracking-widest mb-6">CALIBRATING CAMERA FEEDS...</div>
        <div className="mt-8 text-[#00ff9d] text-sm md:text-base font-bold tracking-widest animate-pulse drop-shadow-[0_0_8px_rgba(0,255,157,0.8)]">AMD MI300X — ONLINE</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen relative pb-16">
      <DashboardBackground />
      <div className="relative z-10">
        <DashboardHeader currentTime={currentTime} />

        <main className="p-3 md:p-5 max-w-[1800px] mx-auto">

          {/* ── TOP CONTROLS ─────────────────────────────────── */}
          <div className="flex flex-wrap justify-between items-center mb-5 gap-3">
            <div className="font-mono text-xs md:text-sm font-bold tracking-[0.2em] text-[#00d4ff] uppercase border-l-[3px] border-[#00d4ff] pl-3">
              Live Camera Matrix · AI Multi-Feed Surveillance
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              {/* Demo buttons */}
              <div className="flex gap-1.5 items-center border border-[#1a2332] rounded px-3 py-1.5">
                <span className="font-mono text-[9px] text-[#5a6f85] uppercase tracking-widest mr-1">Demo:</span>
                {(["normal","elevated","critical","catastrophic"] as const).map(s => (
                  <button key={s} onClick={() => triggerDemo(s)}
                    className={`px-2.5 py-1 font-mono text-[9px] font-bold tracking-wider rounded uppercase transition-all border ${
                      s === "normal"        ? "border-[#00ff9d]/50 text-[#00ff9d] hover:bg-[#00ff9d]/10" :
                      s === "elevated"      ? "border-[#ffd000]/50 text-[#ffd000] hover:bg-[#ffd000]/10" :
                      s === "critical"      ? "border-[#ff6600]/50 text-[#ff6600] hover:bg-[#ff6600]/10" :
                                             "border-[#ff0000]/60 text-[#ff0000] hover:bg-[#ff0000]/10 animate-pulse"
                    }`}>{s}</button>
                ))}
                <button onClick={resetDemo} className="px-2.5 py-1 font-mono text-[9px] tracking-wider rounded uppercase border border-[#5a6f85]/40 text-[#5a6f85] hover:bg-[#5a6f85]/10 transition-all">RESET</button>
              </div>
              {!backendData?.system_running ? (
                <button onClick={startAnalysis}
                  className="px-5 py-2 bg-gradient-to-r from-[#00d4ff] to-[#0099cc] text-black font-mono text-xs font-bold tracking-wider rounded hover:shadow-[0_0_20px_rgba(0,212,255,0.6)] transition-all uppercase">
                  ▶ Start Live Monitoring
                </button>
              ) : (
                <button onClick={stopAnalysis}
                  className="px-5 py-2 bg-gradient-to-r from-[#ff3a3a] to-[#cc0000] text-white font-mono text-xs font-bold tracking-wider rounded hover:shadow-[0_0_20px_rgba(255,58,58,0.6)] transition-all uppercase">
                  ■ Stop Monitoring
                </button>
              )}
            </div>
          </div>

          {/* ── CAMERA GRID ──────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4 mb-5">
            <WebcamFeed label="CAM 01 · WEBCAM LIVE" isActive={webcam1Active} onToggle={() => setWebcam1Active(!webcam1Active)} customFrame={(backendData as any)?.frames_b64?.["CAM-1"]} />
            <WebcamFeed label="CAM 02 · SAMPLE VIDEO" isActive={webcam2Active} onToggle={() => setWebcam2Active(!webcam2Active)} customFrame={(backendData as any)?.frames_b64?.["CAM-2"]} />
            <VideoUpload label="CAM 03 · UPLOAD VIDEO" onAnalysisResult={handleUploadResult} />
            <VideoUpload label="CAM 04 · UPLOAD VIDEO" onAnalysisResult={handleUploadResult} />
          </div>

          {/* ── RISK METRICS + FLOOR PLAN ─────────────────────── */}
          <div className="font-mono text-xs font-bold tracking-[0.2em] text-[#00d4ff] uppercase border-l-[3px] border-[#00d4ff] pl-3 mb-4">
            Risk Dashboard &amp; Venue Topology
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4 mb-5">
            <div className="lg:col-span-2 grid grid-cols-2 gap-3 md:gap-4">
              <StatCard label="Composite Risk Index" value={`${riskScore}/10`} colorClass={riskColorClass} showBar barPercent={riskScore * 10} subtext="Based on Dual Feeds" />
              <LevelBadge level={incidentLevel} />
              <StatCard label="Crowd Count Estimate" value={crowdCount.toLocaleString()} colorClass="text-[#00d4ff] text-glow-cyan" subtext={`DENSITY ${density.toFixed(2)} PERSONS / M²`} />
              <StatCard
                label="T-Minus to Critical"
                value={`${String(countdownMins).padStart(2,"0")}:${String(countdownSecsPart).padStart(2,"0")}`}
                colorClass={countdownColorClass}
                subtext="PROJECTED THRESHOLD BREACH"
              />
            </div>
            <div className="lg:col-span-1">
              <VenueFloorPlan riskScore={riskScore} zoneData={(activeData?.vision?.["CAM-1"] as any)?.zone_descriptions ?? (activeData?.vision?.["CAM-DEMO"] as any)?.zone_descriptions} />
            </div>
          </div>

          {/* ── AI REASONING STREAM + AUDIO ──────────────────── */}
          <div className="font-mono text-xs font-bold tracking-[0.2em] text-[#00d4ff] uppercase border-l-[3px] border-[#00d4ff] pl-3 mb-4">
            Live AI Reasoning Stream · Dual-Model Intelligence
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4 mb-5">
            {/* Reasoning stream — takes 2/3 width */}
            <div className="lg:col-span-2">
              <LiveReasoningStream data={activeData} />
            </div>

            {/* Audio panel — takes 1/3 width */}
            <div className="lg:col-span-1 flex flex-col gap-3">
              {/* Audio analysis card */}
              <motion.div className="bg-[#03060d] border border-[#1a2332] rounded-md p-4 flex-1"
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
                
                <div className="font-mono text-[10px] font-bold tracking-[0.2em] text-[#a78bfa] uppercase border-l-[3px] border-[#a78bfa] pl-2 mb-4">
                  Audio Intelligence · Whisper
                </div>

                {/* Waveform visualizer — always active */}
                <div className="flex items-end gap-[2px] h-10 mb-4 px-1">
                  {Array.from({ length: 28 }).map((_, i) => {
                    const baseH = 15 + Math.sin(i * 0.8) * 10
                    const panicBoost = screaming ? 30 : audioRisk > 4 ? 15 : 0
                    return (
                      <motion.div key={i}
                        className="flex-1 rounded-sm"
                        style={{ background: screaming ? "#ff2244" : audioRisk > 4 ? "#ff8c00" : "#a78bfa" }}
                        animate={{ height: [`${baseH + panicBoost}%`, `${baseH + panicBoost + 20 + Math.random() * 20}%`, `${baseH + panicBoost}%`] }}
                        transition={{ duration: 0.4 + Math.random() * 0.4, repeat: Infinity, delay: i * 0.03 }}
                      />
                    )
                  })}
                </div>

                {/* Status row */}
                <div className="flex items-center justify-between mb-3 pb-3 border-b border-[#0f1520]">
                  <div className="flex items-center gap-2">
                    <motion.div className="w-2 h-2 rounded-full"
                      style={{ background: screaming ? "#ff2244" : audioRisk > 4 ? "#ff8c00" : "#a78bfa" }}
                      animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: screaming ? 0.5 : 2, repeat: Infinity }} />
                    <span className="font-mono text-[9px] text-[#5a6f85] uppercase tracking-wider">
                      {screaming ? "SCREAMING ACTIVE" : audioRisk > 4 ? "ELEVATED NOISE" : "MONITORING"}
                    </span>
                  </div>
                  <span className="font-mono text-xs font-bold" style={{
                    color: audioConcern === "CRITICAL" ? "#ff0000" : audioConcern === "HIGH" ? "#ff6600" : audioConcern === "MEDIUM" ? "#ffd000" : "#00ff9d"
                  }}>{audioConcern}</span>
                </div>

                {/* Audio risk bar */}
                <div className="mb-4">
                  <div className="flex justify-between mb-1.5">
                    <span className="font-mono text-[9px] text-[#5a6f85] uppercase tracking-wider">Threat Score</span>
                    <span className="font-mono text-[9px] font-bold" style={{ color: audioRisk >= 7 ? "#ff2244" : audioRisk >= 4 ? "#ff8c00" : "#a78bfa" }}>{audioRisk}/10</span>
                  </div>
                  <div className="h-2 bg-[#0a0f18] rounded-full overflow-hidden border border-[#1a2332]">
                    <motion.div className="h-full rounded-full"
                      style={{ background: audioRisk >= 7 ? "linear-gradient(90deg,#ff6600,#ff0000)" : audioRisk >= 4 ? "linear-gradient(90deg,#a78bfa,#ff8c00)" : "linear-gradient(90deg,#4a3a7a,#a78bfa)" }}
                      animate={{ width: `${audioRisk * 10}%` }} transition={{ duration: 0.8 }} />
                  </div>
                </div>

                {/* Screaming alert */}
                {screaming && (
                  <motion.div className="mb-3 px-3 py-2 rounded border border-[#ff0000]/50 bg-[rgba(255,0,0,0.08)] flex items-center gap-2"
                    animate={{ opacity: [1, 0.6, 1] }} transition={{ duration: 0.7, repeat: Infinity }}>
                    <span className="text-[#ff2244] text-sm">⚠</span>
                    <span className="font-mono text-[10px] text-[#ff2244] font-bold tracking-wider">SCREAMING DETECTED</span>
                  </motion.div>
                )}

                {/* Panic words — only show if there are real ones */}
                {panicWords.length > 0 && (
                  <div className="mb-4">
                    <div className="font-mono text-[9px] text-[#5a6f85] mb-2 uppercase tracking-wider">
                      Panic Keywords ({panicWords.length} detected)
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {panicWords.map((w: string, i: number) => (
                        <motion.span key={i}
                          className="font-mono text-[9px] px-1.5 py-0.5 rounded border"
                          style={{ background: "rgba(255,34,68,0.1)", color: "#ff6677", borderColor: "rgba(255,34,68,0.25)" }}
                          initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.05 }}>
                          {w}
                        </motion.span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Transcription — only show if meaningful (not "Thank you" / "you" / empty) */}
                {(() => {
                  const boring = ["—", "you", "thank you", "thank you.", "", "unavailable"]
                  const t = audioTranscript.toLowerCase().trim().replace(/\.$/, "")
                  const isMeaningful = !boring.includes(t) && audioTranscript.length > 8 && !audioTranscript.includes("unavailable")
                  return isMeaningful ? (
                    <div>
                      <div className="font-mono text-[9px] text-[#5a6f85] mb-1.5 uppercase tracking-wider">Transcription</div>
                      <div className="font-mono text-[10px] text-[#c4b5fd] leading-relaxed bg-[#0a0f18] rounded p-2 border border-[#a78bfa]/20 italic">
                        "{audioTranscript.slice(0, 140)}"
                      </div>
                    </div>
                  ) : (
                    <div className="font-mono text-[9px] text-[#2a3a44] italic text-center py-2">
                      Listening for crowd audio events...
                    </div>
                  )
                })()}
              </motion.div>

              {/* Model info card */}
              <motion.div className="bg-[#03060d] border border-[#1a2332] rounded-md p-3"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay: 0.2 }}>
                <div className="font-mono text-[9px] text-[#3a5060] uppercase tracking-widest mb-2">Active Models</div>
                {[
                  { label: "VISION", model: "Llama 4 Scout 17B", color: "#00d4ff" },
                  { label: "ANALYST", model: "Llama 3.1 8B", color: "#ffe44d" },
                  { label: "CRITIC", model: "Llama 3.1 8B", color: "#ff8c00" },
                  { label: "AUDIO", model: "Whisper/small", color: "#a78bfa" },
                ].map(({ label, model, color }) => (
                  <div key={label} className="flex items-center justify-between py-1 border-b border-[#0f1520] last:border-0">
                    <span className="font-mono text-[8px] font-bold px-1.5 py-0.5 rounded" style={{ color, background: `${color}15` }}>{label}</span>
                    <span className="font-mono text-[9px] text-[#5a6f85]">{model}</span>
                    <motion.div className="w-1.5 h-1.5 rounded-full" style={{ background: color }}
                      animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 2, repeat: Infinity }} />
                  </div>
                ))}
              </motion.div>
            </div>
          </div>

          {/* ── SUPERINTENDENT COMMANDS ───────────────────────── */}
          <div className="font-mono text-xs font-bold tracking-[0.2em] text-[#00d4ff] uppercase border-l-[3px] border-[#00d4ff] pl-3 mb-4">
            Superintendent Commands · Active Operations
          </div>
          <SuperintendentPanel commands={superintendentCommands} exits={exitStatuses} paMessage={paMessage} />

          {/* ── ALERT LOG ─────────────────────────────────────── */}
          <div className="font-mono text-xs font-bold tracking-[0.2em] text-[#00d4ff] uppercase border-l-[3px] border-[#00d4ff] pl-3 mt-5 mb-4">
            System Alert Log · Real-Time Events
          </div>
          <AlertLog alerts={alerts} />

        </main>
      </div>

      {/* Status badge */}
      <div className="fixed bottom-4 right-4 z-50 bg-[#05080d]/90 border border-[#00d4ff]/30 text-[#00d4ff] font-mono text-[10px] px-3 py-2 rounded-lg backdrop-blur-sm shadow-[0_0_15px_rgba(0,212,255,0.2)] flex items-center gap-2">
        <span className="text-[#00ff9d] font-bold">AMD MI300X</span>
        <span className="text-[#1a2332]">|</span>
        <span className="text-[#5a6f85]">Groq API</span>
        <span className="text-[#1a2332]">|</span>
        {backendOnline
          ? <><motion.div className="w-1.5 h-1.5 rounded-full bg-[#00ff9d]" animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 2, repeat: Infinity }} /><span className="text-[#00ff9d]">ONLINE</span></>
          : <><motion.div className="w-1.5 h-1.5 rounded-full bg-[#ff3a3a]" animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 0.8, repeat: Infinity }} /><span className="text-[#ff3a3a]">OFFLINE</span></>
        }
      </div>
    </div>
  )
}
