"use client";

import { useState, useRef, useCallback, useEffect } from "react";

export type TranscriptionStatus = "idle" | "recording" | "uploading" | "queued" | "processing" | "completed" | "error";

const MAX_RECORDING_SECONDS = 300; // 5 minutes
const WARNING_THRESHOLD_SECONDS = 240; // 4 minutes - start warning

interface UseAudioTranscriptionOptions {
  onTranscriptionComplete: (text: string) => void;
  onMaxTimeReached?: () => void;
}

export function useAudioTranscription({ onTranscriptionComplete, onMaxTimeReached }: UseAudioTranscriptionOptions) {
  const [status, setStatus] = useState<TranscriptionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isNearLimit, setIsNearLimit] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    };
  }, []);

  // Poll for transcription status
  const pollTranscription = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/transcript/${id}`);
      const data = await res.json() as { status: string; text?: string | null; error?: string | null };

      if (data.status === "completed" && data.text) {
        setStatus("completed");
        onTranscriptionComplete(data.text);
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
      } else if (data.status === "error" || data.error) {
        setStatus("error");
        setError(data.error || "Erro na transcrição");
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
      } else if (data.status === "queued") {
        setStatus("queued");
      } else if (data.status === "processing") {
        setStatus("processing");
      }
    } catch (err) {
      console.error("Polling error:", err);
      setStatus("error");
      setError("Erro ao verificar transcrição");
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    }
  }, [onTranscriptionComplete]);

  // Upload audio and start transcription
  const uploadAndTranscribe = useCallback(async (audioBlob: Blob) => {
    setStatus("uploading");
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", audioBlob, "audio.webm");

      const res = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json() as { error?: string };
        throw new Error(errData.error || "Falha no upload");
      }

      const data = await res.json() as {
        transcriptId?: string | null;
        status?: string;
        text?: string | null;
      };

      if ((data.status === "completed" || !!data.text) && data.text) {
        setStatus("completed");
        onTranscriptionComplete(data.text);
        return;
      }

      if (data.transcriptId) {
        setStatus("queued");
        pollingIntervalRef.current = setInterval(() => {
          void pollTranscription(data.transcriptId!);
        }, 5000);
        return;
      }

      throw new Error("Falha ao iniciar transcrição");
    } catch (err) {
      console.error("Upload error:", err);
      setStatus("error");
      setError(err instanceof Error ? err.message : "Erro no upload");
    }
  }, [pollTranscription, onTranscriptionComplete]);

  // Stop recording timer
  const stopRecordingTimer = useCallback(() => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setElapsedSeconds(0);
    setIsNearLimit(false);
  }, []);

  // Start recording
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });

      audioChunksRef.current = [];
      setElapsedSeconds(0);
      setIsNearLimit(false);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach(track => track.stop());
        stopRecordingTimer();
        void uploadAndTranscribe(audioBlob);
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setStatus("recording");
      setError(null);

      // Start timer
      let seconds = 0;
      recordingTimerRef.current = setInterval(() => {
        seconds += 1;
        setElapsedSeconds(seconds);

        // Warning at 4 minutes
        if (seconds >= WARNING_THRESHOLD_SECONDS) {
          setIsNearLimit(true);
        }

        // Auto-stop at 5 minutes
        if (seconds >= MAX_RECORDING_SECONDS) {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
            mediaRecorderRef.current.stop();
            onMaxTimeReached?.();
          }
        }
      }, 1000);
    } catch (err) {
      console.error("Recording error:", err);
      setStatus("error");
      setError("Erro ao acessar microfone. Verifique as permissões.");
    }
  }, [uploadAndTranscribe, stopRecordingTimer, onMaxTimeReached]);

  // Stop recording
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  // Reset to idle state
  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  const isProcessing = status === "uploading" || status === "queued" || status === "processing";
  const remainingSeconds = MAX_RECORDING_SECONDS - elapsedSeconds;

  return {
    status,
    error,
    isProcessing,
    startRecording,
    stopRecording,
    reset,
    elapsedSeconds,
    remainingSeconds,
    isNearLimit,
    maxRecordingSeconds: MAX_RECORDING_SECONDS,
  };
}
