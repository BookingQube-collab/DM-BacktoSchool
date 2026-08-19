import { useEffect, useRef, useState } from "react";
import { SwitchCamera } from "lucide-react";
import { captureFromVideo, fileToDownscaledDataUrl } from "@/lib/photo";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

type FacingMode = "environment" | "user";

export function BillCapture({
  onCaptured,
  onClear,
  previewUrl,
}: {
  onCaptured: (dataUrl: string) => void;
  onClear?: () => void;
  previewUrl?: string | null;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<FacingMode>("environment");
  const [canSwapCamera, setCanSwapCamera] = useState(false);
  const [swapping, setSwapping] = useState(false);
  // Auto-open camera when step mounts with no existing bill photo
  const [cameraOn, setCameraOn] = useState(() => !previewUrl);
  const { t } = useI18n();

  useEffect(() => {
    if (previewUrl) {
      setCameraOn(false);
      return;
    }
    // Re-open after retake / when landing on bill step without a photo
    setCameraOn(true);
  }, [previewUrl]);

  useEffect(() => {
    if (!cameraOn || previewUrl) return;
    let active = true;
    let localStream: MediaStream | null = null;

    (async () => {
      try {
        localStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1280 },
            height: { ideal: 960 },
          },
          audio: false,
        });
        if (!active) {
          localStream.getTracks().forEach((t) => t.stop());
          return;
        }
        setStream(localStream);
        setError(null);
        if (videoRef.current) {
          videoRef.current.srcObject = localStream;
          await videoRef.current.play().catch(() => {});
        }

        // After permission, detect whether a second camera is available
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoInputs = devices.filter((d) => d.kind === "videoinput");
          if (active) setCanSwapCamera(videoInputs.length > 1);
        } catch {
          if (active) setCanSwapCamera(true);
        }
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : t("billCameraError"),
        );
        setCameraOn(false);
      } finally {
        if (active) setSwapping(false);
      }
    })();

    return () => {
      active = false;
      localStream?.getTracks().forEach((t) => t.stop());
      setStream(null);
    };
  }, [cameraOn, previewUrl, facingMode]);

  function stopCamera() {
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
    setCameraOn(false);
  }

  function swapCamera() {
    if (!canSwapCamera || swapping) return;
    setSwapping(true);
    // Stopping tracks before flip; effect cleanup also stops when facingMode changes
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  }

  const handleTake = () => {
    if (!videoRef.current) return;
    try {
      const dataUrl = captureFromVideo(videoRef.current);
      stopCamera();
      onCaptured(dataUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("billCaptureError"));
    }
  };

  const handleFile = async (file: File) => {
    try {
      const dataUrl = await fileToDownscaledDataUrl(file);
      stopCamera();
      onCaptured(dataUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("billFileError"));
    }
  };

  if (previewUrl) {
    return (
      <div className="space-y-4 landscape:space-y-3">
        <div className="overflow-hidden rounded-2xl border border-border bg-black/40">
          <img
            src={previewUrl}
            alt={t("billPreviewAlt")}
            className="mx-auto max-h-[50vh] w-full object-contain landscape:max-h-[min(42dvh,320px)]"
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          className="h-12 w-full text-base landscape:h-12"
          onClick={() => {
            onClear?.();
            setError(null);
          }}
        >
          {t("billRetake")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 landscape:grid landscape:grid-cols-[minmax(0,1fr)_minmax(12rem,16rem)] landscape:items-stretch landscape:gap-4 landscape:space-y-0">
      {cameraOn ? (
        <div className="relative aspect-[3/4] max-h-[min(62vh,560px)] w-full overflow-hidden rounded-2xl border border-border bg-black landscape:mx-auto landscape:max-h-[min(52dvh,420px)] landscape:max-w-[min(100%,22rem)]">
          <video
            ref={videoRef}
            playsInline
            muted
            className="h-full w-full object-cover"
          />
          {!stream && !error ? (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-foreground/70">
              {swapping ? t("billSwitching") : t("billStarting")}
            </div>
          ) : null}

          {canSwapCamera ? (
            <button
              type="button"
              onClick={swapCamera}
              disabled={swapping || !stream}
              aria-label={
                facingMode === "environment"
                  ? t("billSwitchFront")
                  : t("billSwitchRear")
              }
              className="absolute end-3 top-3 z-10 flex h-14 w-14 items-center justify-center rounded-full border border-white/20 bg-black/55 text-white shadow-lg backdrop-blur-sm transition active:scale-95 disabled:opacity-40 landscape:h-12 landscape:w-12"
            >
              <SwitchCamera className="h-7 w-7" strokeWidth={2.25} />
            </button>
          ) : null}

          <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/80 via-black/45 to-transparent px-3 pb-3 pt-10">
            <Button
              type="button"
              size="lg"
              className="h-14 w-full text-lg landscape:h-12 landscape:text-base"
              onClick={handleTake}
              disabled={!stream || swapping}
            >
              {t("billCapture")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex aspect-[3/4] max-h-[min(62vh,560px)] w-full items-center justify-center rounded-2xl border border-dashed border-border bg-secondary/30 px-6 text-center landscape:mx-auto landscape:max-h-[min(52dvh,420px)] landscape:max-w-[min(100%,22rem)]">
          <p className="text-sm text-muted-foreground md:text-base">
            {t("billHint")}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-3 landscape:justify-end">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {!cameraOn ? (
          <Button
            type="button"
            size="lg"
            className="h-14 w-full text-lg landscape:h-12 landscape:text-base"
            onClick={() => {
              setFacingMode("environment");
              setCameraOn(true);
            }}
          >
            {t("billOpenCamera")}
          </Button>
        ) : null}

        <Button
          type="button"
          variant="secondary"
          className="h-12 w-full text-base landscape:h-12"
          onClick={() => fileInputRef.current?.click()}
        >
          {t("billUpload")}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            e.target.value = "";
          }}
        />

        {cameraOn ? (
          <button
            type="button"
            onClick={stopCamera}
            className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            {t("billCancelCamera")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
