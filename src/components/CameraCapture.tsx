import { useEffect, useRef, useState } from "react";
import { captureFromVideo, fileToDownscaledDataUrl } from "@/lib/photo";
import { cn } from "@/lib/utils";

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
    <div
      className={cn(
        "flex h-[100svh] max-h-[100dvh] items-center justify-center overflow-hidden",
        "px-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))]",
        "pt-[max(0.75rem,env(safe-area-inset-top))]",
        /* leave room for fixed fullscreen control (bottom-right) */
        "pb-[max(3.5rem,calc(env(safe-area-inset-bottom)+3.25rem))]",
      )}
    >
      <div
        className={cn(
          "grid w-full min-h-0 max-w-md text-center",
          "grid-rows-[auto_minmax(0,1fr)_auto] gap-y-3",
          "landscape:max-w-4xl landscape:grid-cols-[auto_minmax(0,1fr)]",
          "landscape:grid-rows-[auto_minmax(0,1fr)] landscape:items-center",
          "landscape:gap-x-8 landscape:gap-y-2 landscape:text-left",
        )}
      >
        <header className="landscape:col-start-2 landscape:row-start-1">
          <h2
            className={cn(
              "font-display text-3xl font-bold text-foreground md:text-4xl",
              "landscape:text-2xl landscape:md:text-3xl",
            )}
          >
            Line up your face
          </h2>
          <p className="mt-1 text-sm text-foreground/70 landscape:mt-1 md:text-base">
            Look straight ahead and smile.
          </p>
        </header>

        {/* Height-first + matching width so the oval shrinks in short landscape viewports */}
        <div
          className={cn(
            "relative mx-auto min-h-0 overflow-hidden rounded-3xl border border-white/10 bg-black shadow-2xl",
            "aspect-[3/4] h-[min(52svh,28rem)] w-[min(100%,calc(min(52svh,28rem)*0.75))]",
            "landscape:col-start-1 landscape:row-span-2 landscape:mx-0 landscape:rounded-2xl",
            "landscape:h-[min(56svh,20rem)] landscape:w-[min(40vw,calc(min(56svh,20rem)*0.75))]",
          )}
        >
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

        <div
          className={cn(
            "flex flex-col items-center gap-3",
            "landscape:col-start-2 landscape:row-start-2 landscape:items-stretch landscape:justify-center landscape:gap-2.5",
          )}
        >
          <button
            onClick={handleTake}
            disabled={!!error || !stream}
            className={cn(
              "w-full rounded-full bg-gradient-to-r from-primary to-accent font-display font-bold text-white shadow-lg",
              "px-8 py-5 text-xl transition-transform hover:scale-[1.02] active:scale-[0.98]",
              "disabled:opacity-40 motion-reduce:transform-none",
              "landscape:px-6 landscape:py-3.5 landscape:text-lg",
            )}
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
