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

// Generate random alert messages
const ALERT_MESSAGES = [
  { severity: "info" as const, message: "CAM-01 baseline density restored (1.8 p/m²)" },
  { severity: "warn" as const, message: "CAM-03 counter-flow detected — south stairwell" },
  { severity: "crit" as const, message: "CAM-02 density 4.6 p/m² — CSP-4-A triggered" },
  { severity: "info" as const, message: "Steward team Alpha checked in at North Gate" },
  { severity: "warn" as const, message: "Exit C turnstile latency 2.1s (baseline 0.9s)" },
  { severity: "info" as const, message: "Critic model re-scored risk 5 → 8" },
  { severity: "crit" as const, message: "PA announcement queued — awaiting SUP ack" },
  { severity: "info" as const, message: "MI300X inference batch · 12.4ms · 4 streams" },
  { severity: "warn" as const, message: "Crowd surge warning — EAST PLAZA sector" },
  { severity: "info" as const, message: "Emergency route optimized via Exit B" },
  { severity: "crit" as const, message: "Suspicious movement detected — CAM-04" },
  { severity: "warn" as const, message: "Density threshold exceeded — MAIN CONCOURSE" },
]

export default function DashboardPage() {
  const [currentTime, setCurrentTime] = useState("")
  const [webcam1Active, setWebcam1Active] = useState(false)
  const [webcam2Active, setWebcam2Active] = useState(false)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [riskScore, setRiskScore] = useState(8)
  const [incidentLevel, setIncidentLevel] = useState(4)
  const [crowdCount, setCrowdCount] = useState(5200)
  const [density, setDensity] = useState(4.6)
  const [countdown, setCountdown] = useState({ minutes: 7, seconds: 42 })

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

  // Generate initial alerts
  useEffect(() => {
    const initialAlerts: Alert[] = ALERT_MESSAGES.slice(0, 8).map((alert, i) => {
      const time = new Date(Date.now() - i * 37000)
      return {
        id: `initial-${i}`,
        time: time.toISOString().substring(11, 19),
        severity: alert.severity,
        message: alert.message
      }
    })
    setAlerts(initialAlerts)
  }, [])

  // Simulate real-time alerts
  useEffect(() => {
    const interval = setInterval(() => {
      const randomAlert = ALERT_MESSAGES[Math.floor(Math.random() * ALERT_MESSAGES.length)]
      const newAlert: Alert = {
        id: `alert-${Date.now()}`,
        time: new Date().toISOString().substring(11, 19),
        severity: randomAlert.severity,
        message: randomAlert.message
      }
      setAlerts(prev => [newAlert, ...prev.slice(0, 9)])
    }, 8000)
    return () => clearInterval(interval)
  }, [])

  // Simulate data updates when cameras are active
  useEffect(() => {
    if (!webcam1Active && !webcam2Active) return
    
    const interval = setInterval(() => {
      setRiskScore(prev => Math.min(10, Math.max(5, prev + (Math.random() > 0.5 ? 1 : -1))))
      setCrowdCount(prev => prev + Math.floor((Math.random() - 0.5) * 200))
      setDensity(prev => Math.max(2, Math.min(6, prev + (Math.random() - 0.5) * 0.3)))
    }, 5000)
    
    return () => clearInterval(interval)
  }, [webcam1Active, webcam2Active])

  // Update incident level based on risk
  useEffect(() => {
    if (riskScore >= 9) setIncidentLevel(5)
    else if (riskScore >= 7) setIncidentLevel(4)
    else if (riskScore >= 5) setIncidentLevel(3)
    else if (riskScore >= 3) setIncidentLevel(2)
    else setIncidentLevel(1)
  }, [riskScore])

  // Countdown timer
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev.seconds > 0) {
          return { ...prev, seconds: prev.seconds - 1 }
        } else if (prev.minutes > 0) {
          return { minutes: prev.minutes - 1, seconds: 59 }
        }
        return { minutes: Math.floor(Math.random() * 10) + 3, seconds: Math.floor(Math.random() * 60) }
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const handleVideoAnalysis = useCallback((isAnalyzing: boolean) => {
    if (isAnalyzing) {
      // Simulate analysis causing risk increase
      setRiskScore(prev => Math.min(10, prev + 1))
    }
  }, [])

  // Risk color class
  const riskColorClass = useMemo(() => {
    if (riskScore <= 4) return "risk-normal"
    if (riskScore <= 7) return "risk-elevated"
    return "risk-critical"
  }, [riskScore])

  // Countdown color class
  const countdownColorClass = useMemo(() => {
    if (countdown.minutes > 15) return "risk-normal"
    if (countdown.minutes > 5) return "risk-elevated"
    return "risk-critical"
  }, [countdown.minutes])

  // Superintendent data
  const superintendentCommands = [
    { type: "red" as const, label: "[RADIO·1]", text: "All units — escalate to <strong>Protocol CSP-4-A</strong>. Acknowledge in sequence." },
    { type: "orange" as const, label: "[RADIO·2]", text: "Steward team Bravo — deploy to South Stairwell landings 2 &amp; 3. Hold inflow." },
    { type: "blue" as const, label: "[RADIO·3]", text: "Gate ops — open Exit B and Exit D fully. Reduce Exit C inflow by 50%." },
    { type: "green" as const, label: "[RADIO·4]", text: "Medical standby — pre-position Unit M2 at North Plaza. No deployment yet." },
  ]

  const exitStatuses = [
    { name: "EXIT A · NORTH", status: "open" as const, flow: "180", action: "HOLD" },
    { name: "EXIT B · EAST", status: "open" as const, flow: "240", action: "EXPAND +2 LANES" },
    { name: "EXIT C · SOUTH", status: "congested" as const, flow: "090", action: "REDUCE INFLOW 50%" },
    { name: "EXIT D · WEST", status: "partial" as const, flow: "140", action: "OPEN FULLY" },
    { name: "EXIT E · SERVICE", status: "blocked" as const, flow: "000", action: "DISPATCH ENG TEAM" },
  ]

  const paMessage = `"Attention please. For your safety, please use Exits B and D on the East and West concourses. South Exit is temporarily restricted. Stewards are available to assist. There is no emergency — please walk, do not run. Thank you for your cooperation."`

  return (
    <div className="min-h-screen relative">
      <DashboardBackground />
      
      <div className="relative z-10">
        <DashboardHeader currentTime={currentTime} />
        
        <main className="p-3 md:p-5 max-w-[1800px] mx-auto">
          {/* Camera Grid */}
          <SectionTitle>Live Camera Matrix · AI Multi Feed Surveillance</SectionTitle>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 mb-4 md:mb-6">
            {/* Top Row - Webcams */}
            <WebcamFeed 
              label="CAM 01 · NORTH CONCOURSE LIVE"
              isActive={webcam1Active}
              onToggle={() => setWebcam1Active(!webcam1Active)}
            />
            <WebcamFeed 
              label="CAM 02 · MAIN GATE LIVE"
              isActive={webcam2Active}
              onToggle={() => setWebcam2Active(!webcam2Active)}
            />
            
            {/* Bottom Row - Video Uploads */}
            <VideoUpload 
              label="CAM 03 · SECTION 112 UPLOAD"
              onVideoAnalysis={handleVideoAnalysis}
            />
            <VideoUpload 
              label="CAM 04 · EAST EGRESS UPLOAD"
              onVideoAnalysis={handleVideoAnalysis}
            />
          </div>
          
          {/* Risk Dashboard */}
          <SectionTitle>Risk Dashboard</SectionTitle>
          
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-4 md:mb-6">
            <StatCard 
              label="Composite Risk Index"
              value={<>{riskScore}<span className="text-lg text-[#5a6f85]">/10</span></>}
              colorClass={riskColorClass}
              showBar
              barPercent={riskScore * 10}
              subtext={`Δ +${(Math.random() * 2 + 0.5).toFixed(1)} VS T-5MIN`}
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
          
          {/* Intelligence Panel */}
          <SectionTitle>Dual-Model Intelligence · Junior → Senior Critic</SectionTitle>
          
          <div className="grid md:grid-cols-2 gap-3 md:gap-4 mb-4 md:mb-6">
            <IntelPanel type="junior" title="Initial AI Assessment · Junior Analyst">
              <p className="mb-3">
                <strong>Heat signature analysis (CAM-02):</strong> Crowd density appears elevated near
                the main concourse choke point. Estimated headcount ~3,400. Recommend monitoring.
              </p>
              <p className="mb-3">
                <strong>Behavioural cues:</strong> Movement is generally orderly. No signs of distress.
                Risk rating <strong>5/10</strong>. Suggest dispatching one (1) additional steward to the
                north gate as a precautionary measure.
              </p>
              <p className="text-[#5a6f85] italic text-xs">
                — Junior Analyst Model · v0.4 · confidence 0.71
              </p>
            </IntelPanel>
            
            <IntelPanel type="senior" title="Critic-Refined Assessment · Senior Analyst">
              <p className="mb-3">
                <strong>Re-assessment of CAM-02 + CAM-03 cross-feed:</strong> Junior under-counted by{" "}
                <DiffAdd>~1,800 occluded persons on south stairwell</DiffAdd>. Actual headcount{" "}
                <DiffAdd>≈5,200</DiffAdd>, density crossing <DiffAdd>4.6 p/m²</DiffAdd>
                — above ISO 22341 safe threshold.
              </p>
              <p className="mb-3">
                <strong>Critical pattern detected:</strong> Counter-flow forming at south stairwell;
                turnstile latency on CAM-04 has doubled in the last 90s. Risk{" "}
                <DiffRemove>5/10</DiffRemove> <DiffAdd>→ 8/10</DiffAdd>.
              </p>
              <p className="mb-3">
                <strong>Recommendation:</strong> Initiate <DiffAdd>Protocol CSP-4-A</DiffAdd>{" "}
                immediately. Open Exits B &amp; D, hold Exit C inflow, deploy stewards to stairwell
                landings. PA announcement required within 60s.
              </p>
              <p className="text-[#00d4ff] italic text-xs">
                — Senior Critic Model · v1.2 · confidence 0.94
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
          
          {/* Analyze Button */}
          <div className="mt-6 md:mt-8 flex justify-center">
            <button 
              className="px-8 md:px-12 py-4 md:py-5 bg-gradient-to-r from-[#00d4ff] to-[#0099cc] text-black font-mono text-base md:text-lg font-bold tracking-[0.2em] md:tracking-[0.3em] rounded hover:shadow-[0_0_40px_rgba(0,212,255,0.6)] transition-all duration-300 uppercase"
              onClick={() => {
                setRiskScore(Math.floor(Math.random() * 4) + 7)
                setCrowdCount(Math.floor(Math.random() * 800) + 4800)
                setDensity(parseFloat((Math.random() * 2 + 3.5).toFixed(1)))
              }}
            >
              Run AI Analysis
            </button>
          </div>
        </main>
      </div>
    </div>
  )
}
