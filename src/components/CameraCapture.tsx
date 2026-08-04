import { useEffect, useRef, useState } from "react";
import { captureFromVideo, fileToDownscaledDataUrl } from "@/lib/photo";

export function CameraCapture({
  onCancel,
  onCaptured,
}: {
  onCancel: () => void;
  onCaptured: (dataUrl: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    let localStream: MediaStream | null = null;
    (async () => {
      try {
        localStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } },
          audio: false,
        });
        if (!active) {
          localStream.getTracks().forEach((t) => t.stop());
          return;
        }
        setStream(localStream);
        if (videoRef.current) {
          videoRef.current.srcObject = localStream;
          await videoRef.current.play().catch(() => {});
        }
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : "Could not access camera. Upload a photo instead.",
        );
      }
    })();
    return () => {
      active = false;
      localStream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const handleTake = () => {
    if (!videoRef.current) return;
    try {
      const dataUrl = captureFromVideo(videoRef.current);
      stream?.getTracks().forEach((t) => t.stop());
      onCaptured(dataUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not capture photo");
    }
  };

  const handleFile = async (file: File) => {
    try {
      const dataUrl = await fileToDownscaledDataUrl(file);
      stream?.getTracks().forEach((t) => t.stop());
      onCaptured(dataUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read file");
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-md text-center">
        <h2 className="font-display text-3xl font-bold text-foreground md:text-4xl">
          Line up your face
        </h2>
        <p className="mt-2 text-foreground/70">
          Look straight ahead and smile.
        </p>

        <div className="relative mx-auto mt-8 aspect-[3/4] w-full overflow-hidden rounded-3xl border border-white/10 bg-black shadow-2xl">
          {!error ? (
            <video
              ref={videoRef}
              playsInline
              muted
              className="h-full w-full object-cover"
              style={{ transform: "scaleX(-1)" }}
            />
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-foreground/80">
              {error}
            </div>
          )}
          {/* dashed face guide */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div
              className="rounded-full border-4 border-dashed border-white/70"
              style={{ width: "62%", height: "82%" }}
            />
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center gap-4">
          <button
            onClick={handleTake}
            disabled={!!error || !stream}
            className="w-full rounded-full bg-gradient-to-r from-primary to-accent px-8 py-5 font-display text-xl font-bold text-white shadow-lg transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 motion-reduce:transform-none"
          >
            Take photo
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-sm text-foreground/70 underline underline-offset-4 hover:text-accent"
          >
            Upload a photo instead
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
          />

          <button
            onClick={() => {
              stream?.getTracks().forEach((t) => t.stop());
              onCancel();
            }}
            className="text-xs text-foreground/50 hover:text-foreground"
          >
            ← Pick a different job
          </button>
        </div>
      </div>
    </div>
  );
}
