"use client"

import { useRef, useState, useCallback, useEffect } from "react"
import { motion } from "framer-motion"
import { Upload, Play, Pause, RotateCcw, Film, Zap } from "lucide-react"

export interface VideoAnalysisResult {
  success: boolean
  vision: any
  audio: any
  initial: any
  final: any
  commands: any
}

interface VideoUploadProps {
  label: string
  autoLoadDemo?: boolean          // CAM 03 gets the panic demo auto-loaded
  onVideoAnalysis?: (isAnalyzing: boolean) => void
  onAnalysisResult?: (result: VideoAnalysisResult) => void
}

export function VideoUpload({ label, autoLoadDemo, onVideoAnalysis, onAnalysisResult }: VideoUploadProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<File | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [videoName, setVideoName] = useState<string>("")
  const [isPlaying, setIsPlaying] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [progress, setProgress] = useState(0)
  const [detectedCount, setDetectedCount] = useState<number | null>(null)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [demoLoading, setDemoLoading] = useState(false)

  // Auto-load panic demo video for CAM 03
  const loadDemoVideo = useCallback(async () => {
    setDemoLoading(true)
    try {
      const res = await fetch("http://127.0.0.1:8080/demo/panic-video")
      if (!res.ok) throw new Error("Demo video not found")
      const blob = await res.blob()
      const file = new File([blob], "panic_crowd.mp4", { type: "video/mp4" })
      const url = URL.createObjectURL(blob)
      fileRef.current = file
      setVideoUrl(url)
      setVideoName("panic_crowd.mp4")
      setIsPlaying(false)
      setIsAnalyzing(false)
      setProgress(0)
      setDetectedCount(null)
      setAnalysisError(null)
    } catch (e) {
      setAnalysisError("Demo video not found — run: python demo/generate_panic_sample.py")
    } finally {
      setDemoLoading(false)
    }
  }, [])

  // Auto-load on mount for CAM 03
  useEffect(() => {
    if (autoLoadDemo) {
      loadDemoVideo()
    }
  }, [autoLoadDemo, loadDemoVideo])

  const handleFile = useCallback((file: File) => {
    const validTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo']
    if (!validTypes.includes(file.type)) {
      alert('Please upload a valid video file (MP4, WebM, MOV, AVI)')
      return
    }
    const url = URL.createObjectURL(file)
    fileRef.current = file
    setVideoUrl(url)
    setVideoName(file.name)
    setIsPlaying(false)
    setIsAnalyzing(false)
    setProgress(0)
    setDetectedCount(null)
    setAnalysisError(null)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }, [])
  const handleDragLeave = useCallback(() => setIsDragging(false), [])
  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (file) handleFile(file)
  }, [handleFile])

  const sendToBackend = useCallback(async (file: File) => {
    try {
      const formData = new FormData()
      formData.append("video", file)
      // Always use AUTO — let Whisper analyze the real audio track
      const res = await fetch("http://127.0.0.1:8080/analyze?audio_scenario=auto", {
        method: "POST",
        body: formData,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const result: VideoAnalysisResult = await res.json()
      setDetectedCount(result.vision?.crowd_count_estimate ?? null)
      onAnalysisResult?.(result)
    } catch (err: any) {
      console.error("Video analysis failed:", err)
      setAnalysisError(err?.name === "TypeError" ? "Backend offline — start the server first" : `Analysis failed: ${err.message}`)
    } finally {
      setIsAnalyzing(false)
      onVideoAnalysis?.(false)
    }
  }, [onAnalysisResult, onVideoAnalysis])

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return
    if (isPlaying) {
      videoRef.current.pause()
    } else {
      videoRef.current.play()
      if (!isAnalyzing) {
        setIsAnalyzing(true)
        setAnalysisError(null)
        onVideoAnalysis?.(true)
        if (fileRef.current) sendToBackend(fileRef.current)
      }
    }
    setIsPlaying(!isPlaying)
  }, [isPlaying, isAnalyzing, onVideoAnalysis, sendToBackend])

  const handleTimeUpdate = useCallback(() => {
    if (!videoRef.current) return
    setProgress((videoRef.current.currentTime / videoRef.current.duration) * 100)
  }, [])

  const handleEnded = useCallback(() => {
    setIsPlaying(false); setIsAnalyzing(false); onVideoAnalysis?.(false)
  }, [onVideoAnalysis])

  const resetVideo = useCallback(() => {
    setVideoUrl(null); setVideoName(""); setIsPlaying(false); setIsAnalyzing(false)
    setProgress(0); setDetectedCount(null); setAnalysisError(null)
    fileRef.current = null
    if (inputRef.current) inputRef.current.value = ''
  }, [])

  return (
    <motion.div
      className="relative bg-[#07090f] border border-[rgba(0,212,255,0.18)] rounded-lg overflow-hidden"
      initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }}
    >
      {/* Camera Label */}
      <div className="absolute top-2 left-2 z-20 bg-black/70 text-[#00d4ff] font-mono text-[9px] md:text-[11px] px-2 py-1 rounded border border-[rgba(0,212,255,0.4)] tracking-wider">
        {label}
      </div>

      {/* Analyzing Indicator */}
      {isAnalyzing && (
        <div className="absolute top-2 right-2 z-20 flex items-center gap-1.5 bg-black/70 px-2 py-1 rounded">
          <motion.span className="w-2 h-2 rounded-full bg-[#ffd000]" animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 0.8, repeat: Infinity }} />
          <span className="font-mono text-[9px] md:text-[10px] text-[#ffd000]">ANALYZING</span>
        </div>
      )}

      {/* Video Container */}
      <div className="aspect-video bg-[#05080d] relative">
        {demoLoading ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <motion.div className="w-6 h-6 border-2 border-[#00d4ff] border-t-transparent rounded-full"
              animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} />
            <span className="font-mono text-[9px] text-[#5a6f85]">LOADING DEMO...</span>
          </div>
        ) : videoUrl ? (
          <>
            <video ref={videoRef} src={videoUrl} className="w-full h-full object-cover"
              onTimeUpdate={handleTimeUpdate} onEnded={handleEnded} />

            {/* Analysis overlay */}
            {isAnalyzing && (
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute inset-0 opacity-20" style={{
                  backgroundImage: `linear-gradient(rgba(0,212,255,0.3) 1px,transparent 1px),linear-gradient(90deg,rgba(0,212,255,0.3) 1px,transparent 1px)`,
                  backgroundSize: '30px 30px'
                }} />
                <motion.div className="absolute inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-[#ffd000] to-transparent"
                  animate={{ top: ['0%','100%'] }} transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }} />
                <motion.div className="absolute border-2 border-[#00ff9d] rounded" style={{ width:'18%', height:'28%' }}
                  animate={{ left:['15%','55%','25%'], top:['25%','45%','35%'], opacity:[0.7,1,0.7] }}
                  transition={{ duration: 3, repeat: Infinity }} />
                <motion.div className="absolute border-2 border-[#ff6600] rounded" style={{ width:'14%', height:'22%' }}
                  animate={{ left:['55%','30%','60%'], top:['40%','20%','50%'], opacity:[1,0.7,1] }}
                  transition={{ duration: 4, repeat: Infinity }} />
                <div className="absolute top-4 left-4 bg-black/70 px-2 py-1 rounded font-mono text-[10px] text-[#00d4ff]">
                  DETECTED: <span className="text-[#00ff9d]">{detectedCount !== null ? detectedCount : "..."}</span>
                </div>
              </div>
            )}

            {/* Video name badge */}
            {videoName && !isAnalyzing && (
              <div className="absolute bottom-4 left-2 right-2 bg-black/60 px-2 py-1 rounded font-mono text-[8px] text-[#5a6f85] truncate text-center">
                {videoName}
              </div>
            )}

            {analysisError && (
              <div className="absolute bottom-8 left-2 right-2 bg-black/80 px-2 py-1 rounded font-mono text-[9px] text-[#ff3a3a] text-center">{analysisError}</div>
            )}
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#1a2332]">
              <motion.div className="h-full bg-[#00d4ff]" style={{ width: `${progress}%` }} />
            </div>
          </>
        ) : (
          <div
            className={`flex flex-col items-center justify-center h-full border-2 border-dashed m-2 rounded-lg transition-colors cursor-pointer ${isDragging ? 'border-[#00d4ff] bg-[#00d4ff]/5' : 'border-[#1a2332] hover:border-[#00d4ff]/50'}`}
            onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}
            onClick={() => inputRef.current?.click()}
          >
            <input ref={inputRef} type="file" accept="video/mp4,video/webm,video/quicktime,video/x-msvideo"
              className="hidden" onChange={handleFileInput} />
            <Upload className={`w-8 h-8 md:w-10 md:h-10 mb-2 ${isDragging ? 'text-[#00d4ff]' : 'text-[#5a6f85]'}`} />
            <span className="font-mono text-[9px] md:text-xs text-[#5a6f85] text-center px-4">DROP VIDEO OR CLICK TO UPLOAD</span>
            <span className="font-mono text-[8px] md:text-[10px] text-[#3a4a5a] mt-1">MP4, WebM, MOV, AVI</span>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between p-2 bg-[#05080d] border-t border-[#1a2332]">
        {videoUrl ? (
          <>
            <button onClick={togglePlay}
              className="flex items-center gap-1.5 px-2 md:px-3 py-1.5 rounded font-mono text-[9px] md:text-[10px] tracking-wider bg-[#00d4ff]/20 text-[#00d4ff] border border-[#00d4ff]/40 hover:bg-[#00d4ff]/30 transition-all">
              {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
              {isPlaying ? 'PAUSE' : 'ANALYZE'}
            </button>
            <div className="flex items-center gap-1.5">
              {autoLoadDemo && (
                <button onClick={loadDemoVideo} title="Reload demo video"
                  className="p-1.5 rounded border border-[#ffd000]/30 text-[#ffd000]/60 hover:text-[#ffd000] hover:border-[#ffd000]/60 transition-colors">
                  <Zap className="w-3 h-3" />
                </button>
              )}
              <button onClick={resetVideo}
                className="p-1.5 rounded border border-[#1a2332] text-[#5a6f85] hover:text-[#ff0000] hover:border-[#ff0000]/40 transition-colors">
                <RotateCcw className="w-3 h-3" />
              </button>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-1.5 text-[#5a6f85] font-mono text-[9px] md:text-[10px]">
              <Film className="w-3 h-3" />
              NO VIDEO LOADED
            </div>
            {autoLoadDemo && (
              <button onClick={loadDemoVideo}
                className="flex items-center gap-1 px-2 py-1 rounded font-mono text-[8px] border border-[#ffd000]/40 text-[#ffd000] hover:bg-[#ffd000]/10 transition-all">
                <Zap className="w-2.5 h-2.5" />
                LOAD DEMO
              </button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  )
}
