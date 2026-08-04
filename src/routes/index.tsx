import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { JobGrid } from "@/components/JobGrid";
import { CameraCapture } from "@/components/CameraCapture";
import { Generating } from "@/components/Generating";
import { ResultScreen } from "@/components/ResultScreen";
import {
  PROFESSIONS,
  buildPromptForProfession,
  type Profession,
} from "@/lib/professions";
import { transformPhoto } from "@/lib/transform";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Future Me — E3 Career Photo Booth" },
      {
        name: "description",
        content:
          "Pick a dream job, take a selfie, and meet your grown-up self as a pilot, doctor, astronaut and more. A playful career photo booth by E3.",
      },
      { property: "og:title", content: "Future Me — E3 Career Photo Booth" },
      {
        property: "og:description",
        content:
          "Pick a dream job, take a selfie, and meet your grown-up self as a pilot, doctor, astronaut and more. A playful career photo booth by E3.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FutureMeKiosk,
});

type Stage =
  | { kind: "pick" }
  | { kind: "camera"; profession: Profession }
  | { kind: "generating"; profession: Profession; photo: string }
  | { kind: "result"; profession: Profession; imageUrl: string }
  | { kind: "error"; profession: Profession; photo: string; message: string };

function FutureMeKiosk() {
  const [stage, setStage] = useState<Stage>({ kind: "pick" });

  const runTransform = async (profession: Profession, photo: string) => {
    setStage({ kind: "generating", profession, photo });
    try {
      // Build the prompt per-request from the tapped profession — never from
      // a constant or a value captured at load time.
      const prompt = buildPromptForProfession(profession);
      console.log("[FutureMe] generating for profession:", profession.id, {
        title: profession.title,
        promptPreview: prompt.slice(0, 120) + "…",
      });
      const { imageUrl } = await transformPhoto(photo, prompt);
      setStage({ kind: "result", profession, imageUrl });
    } catch (e) {
      setStage({
        kind: "error",
        profession,
        photo,
        message: e instanceof Error ? e.message : "Something went wrong",
      });
    }
  };

  if (stage.kind === "pick") {
    return (
      <JobGrid
        onPick={(p) => setStage({ kind: "camera", profession: p })}
      />
    );
  }

  if (stage.kind === "camera") {
    return (
      <CameraCapture
        onCancel={() => setStage({ kind: "pick" })}
        onCaptured={(photo) => void runTransform(stage.profession, photo)}
      />
    );
  }

  if (stage.kind === "generating") {
    return <Generating photoDataUrl={stage.photo} />;
  }

  if (stage.kind === "result") {
    return (
      <ResultScreen
        profession={stage.profession}
        imageUrl={stage.imageUrl}
        onRestart={() => setStage({ kind: "pick" })}
      />
    );
  }

  // error
  return (
    <div className="flex min-h-screen items-center justify-center px-6 text-center">
      <div className="max-w-md">
        <h2 className="font-display text-3xl font-bold text-foreground">
          That didn't work
        </h2>
        <p className="mt-2 text-foreground/70">{stage.message}</p>
        <div className="mt-6 flex flex-col gap-3">
          <button
            onClick={() => void runTransform(stage.profession, stage.photo)}
            className="rounded-full bg-gradient-to-r from-primary to-accent px-6 py-3 font-display text-lg font-bold text-white"
          >
            Try again
          </button>
          <button
            onClick={() => setStage({ kind: "pick" })}
            className="text-sm text-foreground/60 underline"
          >
            Pick a different job
          </button>
        </div>
        {/* keep PROFESSIONS referenced to satisfy tree-shaking side-effect concerns */}
        <span className="sr-only">{PROFESSIONS.length} jobs available</span>
      </div>
    </div>
  );
}
