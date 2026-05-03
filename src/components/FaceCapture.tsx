import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, X, Loader2, Scan, AlertTriangle } from "lucide-react";

type FaceCaptureProps = {
  onCapture: (photoBlob: Blob) => void;
  onCancel: () => void;
  isUploading?: boolean;
};

export function FaceCapture({ onCapture, onCancel, isUploading }: FaceCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectionRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [faceDetecting, setFaceDetecting] = useState(false);
  const [autoCountdown, setAutoCountdown] = useState<number | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startCamera = useCallback(async () => {
    try {
      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => setCameraReady(true);
      }
    } catch (err) {
      setCameraError("ক্যামেরা চালু করতে পারেনি। পারমিশন দিন।");
    }
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraReady(false);
    if (detectionRef.current) {
      clearInterval(detectionRef.current);
      detectionRef.current = null;
    }
    if (countdownTimerRef.current) {
      clearTimeout(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  const [faceWarning, setFaceWarning] = useState<string | null>(null);

  // Helper: count skin pixels in a region of imageData
  const countSkinInRegion = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
    const imageData = ctx.getImageData(x, y, w, h);
    const data = imageData.data;
    let skin = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (r > 60 && g > 40 && b > 20 && r > g && r > b &&
          Math.abs(r - g) > 10 && r - b > 15 && r < 250) {
        skin++;
      }
    }
    return skin / (w * h);
  };

  // Full-face detection: checks that skin is present in ALL zones (top/bottom/left/right)
  useEffect(() => {
    if (!cameraReady || capturedImage) return;

    let consecutiveDetections = 0;
    const REQUIRED_DETECTIONS = 4;

    detectionRef.current = setInterval(() => {
      if (!videoRef.current || !canvasRef.current) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;

      canvas.width = 160;
      canvas.height = 120;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(video, 0, 0, 160, 120);

      // Face oval region in the center
      const faceX = 45, faceY = 15, faceW = 70, faceH = 90;

      // Split face region into zones: top (forehead), bottom (chin), left cheek, right cheek, center
      const zoneH = Math.floor(faceH / 3);
      const zoneW = Math.floor(faceW / 3);

      const topSkin = countSkinInRegion(ctx, faceX + zoneW, faceY, zoneW, zoneH); // forehead
      const bottomSkin = countSkinInRegion(ctx, faceX + zoneW, faceY + zoneH * 2, zoneW, zoneH); // chin
      const leftSkin = countSkinInRegion(ctx, faceX, faceY + zoneH, zoneW, zoneH); // left cheek
      const rightSkin = countSkinInRegion(ctx, faceX + zoneW * 2, faceY + zoneH, zoneW, zoneH); // right cheek
      const centerSkin = countSkinInRegion(ctx, faceX + zoneW, faceY + zoneH, zoneW, zoneH); // nose area

      const MIN_ZONE = 0.10; // each zone must have at least 10% skin
      const MIN_CENTER = 0.20; // center must have more

      const allZonesOk = centerSkin > MIN_CENTER && topSkin > MIN_ZONE && bottomSkin > MIN_ZONE && leftSkin > MIN_ZONE && rightSkin > MIN_ZONE;

      // Generate warning message
      if (centerSkin < MIN_CENTER) {
        setFaceWarning("মুখ ফ্রেমের মাঝে রাখুন");
      } else if (topSkin < MIN_ZONE) {
        setFaceWarning("কপাল দেখা যাচ্ছে না — একটু নিচে নামান");
      } else if (bottomSkin < MIN_ZONE) {
        setFaceWarning("থুতনি দেখা যাচ্ছে না — একটু উপরে তুলুন");
      } else if (leftSkin < MIN_ZONE || rightSkin < MIN_ZONE) {
        setFaceWarning("মুখ সোজা রাখুন — একদিকে কাত হয়ে আছে");
      } else {
        setFaceWarning(null);
      }

      if (allZonesOk) {
        consecutiveDetections++;
        if (consecutiveDetections >= REQUIRED_DETECTIONS) {
          setFaceDetecting(true);
          setAutoCountdown(2);

          if (detectionRef.current) {
            clearInterval(detectionRef.current);
            detectionRef.current = null;
          }

          let count = 2;
          const tick = () => {
            count--;
            if (count > 0) {
              setAutoCountdown(count);
              countdownTimerRef.current = setTimeout(tick, 800);
            } else {
              setAutoCountdown(null);
              autoTakePhoto();
            }
          };
          countdownTimerRef.current = setTimeout(tick, 800);
        }
      } else {
        consecutiveDetections = Math.max(0, consecutiveDetections - 1);
        setFaceDetecting(false);
      }
    }, 400);

    return () => {
      if (detectionRef.current) {
        clearInterval(detectionRef.current);
        detectionRef.current = null;
      }
    };
  }, [cameraReady, capturedImage]);

  const autoTakePhoto = () => {
    takePhotoInternal();
  };

  const takePhotoInternal = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const photoCanvas = document.createElement("canvas");
    photoCanvas.width = video.videoWidth;
    photoCanvas.height = video.videoHeight;
    const ctx = photoCanvas.getContext("2d")!;
    ctx.translate(photoCanvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);
    photoCanvas.toBlob(
      (blob) => {
        if (blob) {
          setCapturedImage(photoCanvas.toDataURL("image/jpeg", 0.85));
          setCapturedBlob(blob);
          stopCamera();
          onCapture(blob);
        }
      },
      "image/jpeg",
      0.85
    );
  };

  const retake = () => {
    setCapturedImage(null);
    setCapturedBlob(null);
    setFaceDetecting(false);
    setAutoCountdown(null);
    setFaceWarning(null);
    startCamera();
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="space-y-3"
    >
      <div className="flex items-center gap-2 mb-1">
        <Camera className="w-5 h-5 text-[hsl(var(--cyan))]" />
        <p className="text-sm font-black text-[hsl(var(--cyan))]">📸 ফেস ফটো তুলুন</p>
      </div>

      {/* Bengali Photo Guidelines */}
      <div className="bg-[hsl(var(--amber))]/10 border border-[hsl(var(--amber))]/25 rounded-xl p-3 space-y-1.5">
        <p className="text-[11px] font-bold text-[hsl(var(--amber))] flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          ছবি তোলার নিয়ম — মনোযোগ দিয়ে পড়ুন:
        </p>
        <ul className="text-[10px] text-foreground/80 leading-relaxed space-y-1 pl-1">
          <li>✅ <b>সোজা সামনে তাকান</b> — মুখ বাঁকা বা কাত করবেন না</li>
          <li>✅ <b>ভালো আলোতে</b> থাকুন — অন্ধকারে ছবি ক্লিয়ার হবে না</li>
          <li>✅ <b>চশমা/মাস্ক খুলুন</b> — মুখ পুরোটা দেখা যেতে হবে</li>
          <li>✅ <b>একটু দূরে</b> রাখুন — পুরো মুখ ফ্রেমে আসতে হবে</li>
          <li>⚠️ <b>এই ফটো পরে চেনার জন্য ব্যবহার হবে</b> — তাই পরিষ্কার ছবি দিন</li>
        </ul>
      </div>

      <div className="relative rounded-2xl overflow-hidden bg-secondary aspect-[4/3]">
        {cameraError ? (
          <div className="absolute inset-0 flex items-center justify-center text-center p-4">
            <div>
              <Camera className="w-10 h-10 text-destructive mx-auto mb-2" />
              <p className="text-sm text-destructive font-bold">{cameraError}</p>
              <button onClick={startCamera} className="mt-3 text-xs text-primary font-bold underline">আবার চেষ্টা করুন</button>
            </div>
          </div>
        ) : capturedImage ? (
          <img src={capturedImage} alt="Captured" className="w-full h-full object-cover" />
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
              style={{ transform: "scaleX(-1)" }}
            />
            {!cameraReady && (
              <div className="absolute inset-0 flex items-center justify-center bg-secondary">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            )}
            {/* Face guide overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <motion.div 
                className={`w-44 h-56 border-2 border-dashed rounded-[40%] transition-colors duration-300 ${
                  faceDetecting ? "border-[hsl(var(--emerald))]" : "border-[hsl(var(--cyan))]/50"
                }`}
                animate={faceDetecting ? { scale: [1, 1.02, 1], borderColor: ["hsl(152 56% 38%)", "hsl(152 68% 50%)", "hsl(152 56% 38%)"] } : {}}
                transition={{ duration: 0.8, repeat: Infinity }}
              />
            </div>
            {/* Guide text at bottom */}
            <div className="absolute bottom-10 left-4 right-4 pointer-events-none">
              <p className="text-[10px] text-white/90 text-center font-bold bg-black/50 rounded-lg px-2 py-1 backdrop-blur-sm">
                🔲 ফ্রেমের মধ্যে মুখ রাখুন • সোজা তাকান
              </p>
            </div>
            {/* Auto-detect indicator */}
            {faceDetecting && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-[hsl(var(--emerald))]/90 text-white px-4 py-1.5 rounded-full text-xs font-black flex items-center gap-1.5 shadow-lg">
                <Scan className="w-3.5 h-3.5" />
                {autoCountdown !== null ? `${autoCountdown}...` : "ফেস ধরা পড়েছে!"}
              </div>
            )}
            {/* Face warning indicator */}
            {cameraReady && !faceDetecting && faceWarning && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-[hsl(var(--amber))]/90 text-white px-4 py-1.5 rounded-full text-[10px] font-black flex items-center gap-1.5 shadow-lg max-w-[85%] text-center">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                {faceWarning}
              </div>
            )}
            {/* Auto-detect scanning indicator */}
            {cameraReady && !faceDetecting && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-background/70 text-foreground/80 px-3 py-1 rounded-full text-[10px] font-bold flex items-center gap-1.5 backdrop-blur-sm">
                <Loader2 className="w-3 h-3 animate-spin" />
                পুরো মুখ খুঁজছে...
              </div>
            )}
          </>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />

      <div className="flex gap-3">
        {capturedImage ? (
          <div className="flex-1 py-3 rounded-xl bg-gradient-to-r from-[hsl(var(--emerald))] to-[hsl(var(--cyan))] text-primary-foreground text-sm font-bold flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> চেক হচ্ছে...
          </div>
        ) : (
          <>
            <button
              onClick={onCancel}
              className="flex-1 py-3 rounded-xl border border-border bg-secondary text-sm font-bold flex items-center justify-center gap-2"
            >
              <X className="w-4 h-4" /> বাতিল
            </button>
            <button
              onClick={takePhotoInternal}
              disabled={!cameraReady || !faceDetecting}
              className="flex-1 py-3 rounded-xl bg-gradient-to-r from-[hsl(var(--cyan))] to-[hsl(var(--blue))] text-primary-foreground text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Camera className="w-4 h-4" /> ম্যানুয়াল ফটো
            </button>
          </>
        )}
      </div>
    </motion.div>
  );
}
