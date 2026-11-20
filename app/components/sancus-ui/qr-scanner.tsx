"use client"

// Camera QR scanner used everywhere Sancus scans a code (Pay with QR, Pay › Scan a QR).
// Phones open the back camera, laptops the webcam (facingMode "environment" is a preference, so a
// computer with only a front camera still works). Decodes with the browser's BarcodeDetector when it
// has one (fast, native) and falls back to jsQR. Also accepts an uploaded photo of a code.
// The camera needs a secure page: https, or localhost while developing.
import jsQR from "jsqr"
import { useCallback, useEffect, useRef, useState } from "react"

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> }
type DetectorCtor = { new (opts: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> }

async function nativeDetector(): Promise<Detector | null> {
  const Ctor = (globalThis as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector
  if (!Ctor) return null
  try {
    const formats = (await Ctor.getSupportedFormats?.()) ?? ["qr_code"]
    return formats.includes("qr_code") ? new Ctor({ formats: ["qr_code"] }) : null
  } catch {
    return null
  }
}

function decodeWithJsQR(src: CanvasImageSource, w: number, h: number, canvas: HTMLCanvasElement): string | null {
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(src, 0, 0, w, h)
  const img = ctx.getImageData(0, 0, w, h)
  return jsQR(img.data, w, h, { inversionAttempts: "attemptBoth" })?.data ?? null
}

const CAMERA_ERRORS: Record<string, string> = {
  NotAllowedError: "Camera access was blocked. Allow it in your browser's address bar, then tap Start camera again.",
  NotFoundError: "No camera found on this device. Upload a photo of the code instead.",
  NotReadableError: "The camera is in use by another app. Close it and try again.",
  OverconstrainedError: "This camera isn't available. Try switching cameras.",
  SecurityError: "The camera only works on a secure (https) page.",
}

export function QrScanner({
  onResult,
  autoStart = true,
  hint = "Point the camera at a QR code",
}: {
  /** Called once with the decoded text; the camera stops. */
  onResult: (text: string) => void
  autoStart?: boolean
  hint?: string
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const loopRef = useRef<number | null>(null)
  const onResultRef = useRef(onResult)
  const [state, setState] = useState<"off" | "starting" | "on">("off")
  const [error, setError] = useState<string | null>(null)
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([])
  const [cameraIndex, setCameraIndex] = useState<number | null>(null)

  useEffect(() => {
    onResultRef.current = onResult
  }, [onResult])

  const stop = useCallback(() => {
    if (loopRef.current) cancelAnimationFrame(loopRef.current)
    loopRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setState("off")
  }, [])

  const start = useCallback(
    async (deviceIndex: number | null = null) => {
      setError(null)
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(window.isSecureContext ? "This browser can't use the camera. Upload a photo of the code instead." : CAMERA_ERRORS.SecurityError!)
        return
      }
      stop()
      setState("starting")
      try {
        const device = deviceIndex !== null ? cameras[deviceIndex] : undefined
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: device
            ? { deviceId: { exact: device.deviceId } }
            : { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        })
        streamRef.current = stream
        const video = videoRef.current!
        video.srcObject = stream
        video.setAttribute("playsinline", "true")
        await video.play()
        setState("on")
        // Device labels are only readable once permission is granted.
        const all = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput")
        setCameras(all)
        if (deviceIndex === null) {
          const activeId = stream.getVideoTracks()[0]?.getSettings().deviceId
          const i = all.findIndex((d) => d.deviceId === activeId)
          setCameraIndex(i >= 0 ? i : 0)
        }

        const detector = await nativeDetector()
        let busy = false
        const tick = async () => {
          if (!streamRef.current) return
          if (!busy && video.readyState >= 2 && video.videoWidth) {
            busy = true
            let text: string | null = null
            try {
              if (detector) text = (await detector.detect(video))[0]?.rawValue ?? null
              else if (canvasRef.current) {
                const scale = Math.min(1, 720 / video.videoWidth)
                text = decodeWithJsQR(video, Math.round(video.videoWidth * scale), Math.round(video.videoHeight * scale), canvasRef.current)
              }
            } catch {
              /* try the next frame */
            }
            busy = false
            if (text) {
              navigator.vibrate?.(60)
              stop()
              onResultRef.current(text)
              return
            }
          }
          loopRef.current = requestAnimationFrame(() => void tick())
        }
        void tick()
      } catch (e) {
        setState("off")
        const name = e instanceof Error ? e.name : ""
        setError(CAMERA_ERRORS[name] ?? "Couldn't start the camera. Upload a photo of the code instead.")
      }
    },
    [cameras, stop]
  )

  useEffect(() => stop, [stop])
  useEffect(() => {
    if (!autoStart) return
    const t = window.setTimeout(() => void start(), 0)
    return () => window.clearTimeout(t)
    // Start once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart])

  function switchCamera() {
    if (cameras.length < 2) return
    const next = ((cameraIndex ?? 0) + 1) % cameras.length
    setCameraIndex(next)
    void start(next)
  }

  function onUpload(file: File | undefined) {
    if (!file) return
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = async () => {
      let text: string | null = null
      const detector = await nativeDetector()
      try {
        if (detector) text = (await detector.detect(img))[0]?.rawValue ?? null
      } catch {
        /* fall back to jsQR */
      }
      if (!text && canvasRef.current) {
        const scale = Math.min(1, 1400 / Math.max(img.width, img.height))
        text = decodeWithJsQR(img, Math.round(img.width * scale), Math.round(img.height * scale), canvasRef.current)
      }
      URL.revokeObjectURL(url)
      if (text) onResultRef.current(text)
      else setError("Couldn't find a QR code in that photo. Try a closer, sharper picture.")
    }
    img.src = url
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div
        style={{
          position: "relative",
          borderRadius: 14,
          overflow: "hidden",
          background: "var(--surface-inverse, #111)",
          aspectRatio: "1 / 1",
          maxHeight: 420,
          width: "100%",
          display: "grid",
          placeItems: "center",
        }}
      >
        <video ref={videoRef} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover", display: state === "off" ? "none" : "block" }} />
        {state !== "off" ? (
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: "18%",
              border: "3px solid rgba(255,255,255,.85)",
              borderRadius: 18,
              boxShadow: "0 0 0 9999px rgba(0,0,0,.25)",
            }}
          />
        ) : (
          <span className="body-s" style={{ color: "var(--ink-inverse, #eee)", padding: 16, textAlign: "center" }}>
            {hint}
          </span>
        )}
        {state === "on" ? (
          <span className="body-s" style={{ position: "absolute", bottom: 10, left: 0, right: 0, textAlign: "center", color: "#fff", textShadow: "0 1px 3px rgba(0,0,0,.6)" }}>
            Scanning…
          </span>
        ) : null}
      </div>
      <canvas ref={canvasRef} hidden />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {state === "off" ? (
          <button type="button" className="sx-btn sx-btn--primary" onClick={() => void start(cameraIndex)}>
            Start camera
          </button>
        ) : (
          <button type="button" className="sx-btn sx-btn--secondary" onClick={stop}>
            {state === "starting" ? "Starting…" : "Stop camera"}
          </button>
        )}
        {cameras.length > 1 && state === "on" ? (
          <button type="button" className="sx-btn sx-btn--secondary" onClick={switchCamera}>
            Switch camera
          </button>
        ) : null}
        <label className="sx-btn sx-btn--quiet" style={{ cursor: "pointer" }}>
          Upload a photo
          <input type="file" accept="image/*" hidden onChange={(e) => onUpload(e.target.files?.[0])} />
        </label>
      </div>
      {error ? (
        <p className="body-s" role="alert" style={{ margin: 0, color: "var(--failed, #c0392b)" }}>
          {error}
        </p>
      ) : null}
    </div>
  )
}
