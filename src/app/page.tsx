/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useEffect, useRef, useState } from "react";

type RecordingStatus = "idle" | "recording" | "finished" | "error";

export default function Home() {
  const [status, setStatus] = useState<RecordingStatus>("idle");
  const [message, setMessage] = useState<string>(
    "点击下方按钮开始录音，再点击一次结束。",
  );
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRequesting, setIsRequesting] = useState<boolean>(false);
  const [transcribing, setTranscribing] = useState<boolean>(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);

  // Web Audio 相关引用
  const isRecordingRef = useRef<boolean>(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordedBuffersRef = useRef<Float32Array[]>([]);
  const recordedLengthRef = useRef<number>(0);
  const audioBlobRef = useRef<Blob | null>(null);

  // 清理旧的音频 URL，避免内存泄露
  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  useEffect(() => {
    // 卸载组件时，停止录音并释放麦克风资源
    return () => {
      if (processorNodeRef.current) {
        processorNodeRef.current.disconnect();
      }
      if (sourceNodeRef.current) {
        sourceNodeRef.current.disconnect();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const startRecording = async () => {
    if (isRequesting || status === "recording") return;

    setError(null);

    if (typeof window === "undefined") {
      setError("当前环境不支持音频录制（非浏览器环境）。");
      setStatus("error");
      return;
    }

    if (typeof navigator === "undefined" || !navigator.mediaDevices) {
      setError("当前环境不支持音频录制（缺少 mediaDevices）。");
      setStatus("error");
      return;
    }

    const AudioCtx =
      (window as any).AudioContext || (window as any).webkitAudioContext;

    if (!AudioCtx) {
      setError(
        "当前浏览器不支持 AudioContext，请使用现代浏览器（如最新版 Chrome）。",
      );
      setStatus("error");
      return;
    }

    setIsRequesting(true);
    setMessage("正在请求麦克风权限，请在浏览器中点击允许。");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioContext = new AudioCtx();
      audioContextRef.current = audioContext;

      const sourceNode = audioContext.createMediaStreamSource(stream);
      sourceNodeRef.current = sourceNode;

      const bufferSize = 4096;
      const processorNode = audioContext.createScriptProcessor(
        bufferSize,
        1,
        1,
      );
      processorNodeRef.current = processorNode;

      recordedBuffersRef.current = [];
      recordedLengthRef.current = 0;

      processorNode.onaudioprocess = (event: any) => {
        if (!isRecordingRef.current) return;
        const input = event.inputBuffer.getChannelData(0);
        // 复制一份数据，避免后续被复用
        recordedBuffersRef.current.push(new Float32Array(input));
        recordedLengthRef.current += input.length;
      };

      sourceNode.connect(processorNode);
      processorNode.connect(audioContext.destination);

      isRecordingRef.current = true;
      setStatus("recording");
      setMessage("正在录音中... 再点击一次按钮结束录音。");
    } catch (err) {
      console.error(err);
      setError("获取麦克风权限失败或录音出错，请检查浏览器设置。");
      setStatus("error");
    } finally {
      setIsRequesting(false);
    }
  };

  const stopRecording = () => {
    if (status !== "recording") return;
    if (!audioContextRef.current) return;

    isRecordingRef.current = false;

    const audioContext = audioContextRef.current;
    const sampleRate = audioContext.sampleRate;
    const totalLength = recordedLengthRef.current;

    if (totalLength === 0) {
      setError("没有录到声音，请重试。");
      setStatus("error");
      return;
    }

    // 断开节点，停止采集
    if (processorNodeRef.current) {
      processorNodeRef.current.disconnect();
    }
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    audioContext.close();

    // 合并采集到的 Float32 数据
    const mergedBuffer = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of recordedBuffersRef.current) {
      mergedBuffer.set(chunk, offset);
      offset += chunk.length;
    }

    // 生成 WAV 文件（二进制）
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
    const blockAlign = (numChannels * bitsPerSample) / 8;
    const dataSize = mergedBuffer.length * (bitsPerSample / 8);
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    // RIFF header
    writeString(0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, "WAVE");

    // fmt chunk
    writeString(12, "fmt ");
    view.setUint32(16, 16, true); // PCM chunk size
    view.setUint16(20, 1, true); // 音频格式 1 = PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);

    // data chunk
    writeString(36, "data");
    view.setUint32(40, dataSize, true);

    // 写入 PCM 数据（Float32 -> Int16）
    let index = 44;
    for (let i = 0; i < mergedBuffer.length; i++) {
      const s = Math.max(-1, Math.min(1, mergedBuffer[i]));
      const int16 = s < 0 ? s * 0x8000 : s * 0x7fff;
      view.setInt16(index, int16, true);
      index += 2;
    }

    const blob = new Blob([view], { type: "audio/wav" });
    audioBlobRef.current = blob;

    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    const url = URL.createObjectURL(blob);
    setAudioUrl(url);

    setStatus("finished");
    setMessage("录音结束，可以在下方播放或点击按钮下载到本地（WAV 格式）。");

    // 清理缓存
    recordedBuffersRef.current = [];
    recordedLengthRef.current = 0;
    audioContextRef.current = null;
    sourceNodeRef.current = null;
    processorNodeRef.current = null;
    streamRef.current = null;
  };

  const handleDownload = () => {
    if (!audioBlobRef.current) return;

    const blob = audioBlobRef.current;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const fileName = `recording-${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}.wav`;

    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
  };

  const handleTranscribe = async () => {
    if (!audioBlobRef.current) {
      setTranscribeError("请先录音，然后再进行语音转文字。");
      return;
    }

    setTranscribing(true);
    setTranscribeError(null);
    setTranscript(null);

    try {
      const formData = new FormData();
      const fileName = `recording-${new Date()
        .toISOString()
        .replace(/[:.]/g, "-")}.wav`;

      formData.append("file", audioBlobRef.current, fileName);

      const res = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `请求失败（${res.status}）`);
      }

      const data = await res.json();
      setTranscript(data.text || "");
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : "语音转文字失败，请稍后重试。";
      setTranscribeError(msg);
    } finally {
      setTranscribing(false);
    }
  };

  const isRecording = status === "recording";

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
      <main className="flex w-full max-w-xl flex-col items-center gap-8 rounded-2xl bg-white/90 px-8 py-10 shadow-xl backdrop-blur dark:bg-zinc-900/90">
        <h1 className="text-center text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          语音录制示例
        </h1>

        <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">
          点击下面的按钮开始录音，再次点击结束，随后可以在下方直接回放或下载到本地。
        </p>

        <div className="flex items-center gap-3 rounded-xl bg-zinc-100 px-4 py-3 text-sm text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100">
          <span
            className={`inline-flex h-3 w-3 rounded-full ${
              isRecording
                ? "bg-red-500 shadow-[0_0_0_6px_rgba(248,113,113,0.4)] animate-pulse"
                : status === "finished"
                  ? "bg-emerald-500"
                  : status === "error"
                    ? "bg-yellow-400"
                    : "bg-zinc-400"
            }`}
          />
          <span>{message}</span>
        </div>

        {error && (
          <div className="w-full rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/60 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </div>
        )}

        <div className="flex w-full flex-col items-center gap-4">
          <button
            type="button"
            onClick={() => {
              if (isRecording) {
                stopRecording();
              } else {
                startRecording();
              }
            }}
            className={`inline-flex items-center justify-center rounded-full px-6 py-2.5 text-sm font-medium text-white shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
              isRecording
                ? "bg-red-600 hover:bg-red-700 focus-visible:ring-red-500"
                : "bg-zinc-900 hover:bg-zinc-800 focus-visible:ring-zinc-500 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
            }`}
          >
            {isRecording ? "停止录音" : "开始录音"}
          </button>

          {audioUrl && (
            <div className="flex w-full flex-col items-center gap-3 rounded-xl bg-zinc-100 px-4 py-4 dark:bg-zinc-800">
              <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
                最新录音
              </span>
              <audio className="w-full" controls src={audioUrl}>
                您的浏览器不支持 audio 标签。
              </audio>
              <div className="mt-2 flex w-full flex-col gap-2 sm:flex-row sm:justify-between">
                <button
                  type="button"
                  onClick={handleDownload}
                  className="inline-flex items-center justify-center rounded-full border border-zinc-300 px-4 py-1.5 text-xs font-medium text-zinc-800 transition hover:bg-zinc-200 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-700"
                >
                  下载录音到本地
                </button>
                <button
                  type="button"
                  onClick={handleTranscribe}
                  disabled={transcribing}
                  className="inline-flex items-center justify-center rounded-full border border-emerald-500 bg-emerald-500 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {transcribing ? "正在转文字..." : "转文字"}
                </button>
              </div>
            </div>
          )}

          {(transcript || transcribeError) && (
            <div className="mt-2 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                识别结果
              </div>
              {transcribeError ? (
                <div className="text-red-600 dark:text-red-300">
                  {transcribeError}
                </div>
              ) : (
                <div className="whitespace-pre-wrap break-words">
                  {transcript || "（结果为空）"}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
