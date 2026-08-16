import { useEffect, useRef, useState } from "react";
import { captureFromVideo } from "@/lib/photo";
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
            : "Could not access camera. Please allow camera access and try again.",
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

  return (
    <div
      className={cn(
        "flex h-[100svh] max-h-[100dvh] items-center justify-center overflow-hidden",
        "px-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]",
        "pt-[max(0.5rem,env(safe-area-inset-top))]",
        /* leave room for fixed fullscreen control (bottom-right) */
        "pb-[max(3.5rem,calc(env(safe-area-inset-bottom)+3.25rem))]",
      )}
    >
      <div
        className={cn(
          "grid w-full min-h-0 max-w-lg text-center",
          "grid-rows-[auto_minmax(0,1fr)_auto] gap-y-4",
          "landscape:max-w-6xl landscape:grid-cols-[auto_minmax(0,1fr)]",
          "landscape:grid-rows-[auto_minmax(0,1fr)] landscape:items-center",
          "landscape:gap-x-10 landscape:gap-y-3 landscape:text-left",
        )}
      >
        <header className="landscape:col-start-2 landscape:row-start-1 landscape:self-end">
          <h2
            className={cn(
              "font-display text-4xl font-bold tracking-tight text-foreground md:text-5xl",
              "landscape:text-3xl landscape:md:text-4xl",
            )}
          >
            Line up your face
          </h2>
          <p className="mt-2 text-base text-foreground/75 landscape:mt-1.5 md:text-lg">
            Look straight ahead and smile.
          </p>
        </header>

        {/* Height-first + matching width so the oval shrinks in short landscape viewports */}
        <div
          className={cn(
            "relative mx-auto min-h-0 overflow-hidden rounded-3xl bg-black",
            "border border-white/15 ring-2 ring-accent/35",
            "shadow-[0_0_48px_-6px_color-mix(in_oklab,var(--accent)_45%,transparent),0_25px_50px_-12px_rgba(0,0,0,0.65)]",
            "aspect-[3/4] h-[min(64svh,34rem)] w-[min(100%,calc(min(64svh,34rem)*0.75))]",
            "landscape:col-start-1 landscape:row-span-2 landscape:mx-0 landscape:rounded-[1.75rem]",
            "landscape:h-[min(78svh,36rem)] landscape:w-[min(46vw,calc(min(78svh,36rem)*0.75))]",
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
              className="rounded-full border-[3px] border-dashed border-white/75 shadow-[0_0_24px_rgba(255,255,255,0.12)]"
              style={{ width: "62%", height: "82%" }}
            />
          </div>
        </div>

        <div
          className={cn(
            "flex flex-col items-center gap-4",
            "landscape:col-start-2 landscape:row-start-2 landscape:items-stretch landscape:justify-start landscape:gap-4 landscape:pt-1",
          )}
        >
          <button
            onClick={handleTake}
            disabled={!!error || !stream}
            className={cn(
              "w-full rounded-full bg-gradient-to-r from-primary to-accent font-display font-bold text-white shadow-lg",
              "px-8 py-5 text-xl transition-transform hover:scale-[1.02] active:scale-[0.98]",
              "disabled:opacity-40 motion-reduce:transform-none",
              "landscape:px-7 landscape:py-4 landscape:text-xl",
            )}
          >
            Take photo
          </button>

          <button
            onClick={() => {
              stream?.getTracks().forEach((t) => t.stop());
              onCancel();
            }}
            className={cn(
              "rounded-full px-4 py-3 font-display text-base font-semibold text-foreground/80",
              "transition-colors hover:bg-white/5 hover:text-foreground",
              "landscape:text-lg landscape:py-3.5",
            )}
          >
            ← Pick a different job
          </button>
        </div>
      </div>
    </div>
  );
}
