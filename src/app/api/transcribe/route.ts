import { NextRequest, NextResponse } from "next/server";
import { promisify } from "util";
import { execFile } from "child_process";
import path from "path";
import fs from "fs/promises";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || typeof (file as any).arrayBuffer !== "function") {
      return NextResponse.json(
        { error: "未找到上传的音频文件。" },
        { status: 400 }
      );
    }

    const inputFile = file as unknown as File;
    const arrayBuffer = await inputFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const tempDir = path.join(process.cwd(), "tmp-audio");
    await fs.mkdir(tempDir, { recursive: true });

    const safeName =
      (inputFile.name || "audio")
        .replace(/[^a-zA-Z0-9_.-]/g, "_")
        .replace(/\.(?!wav$)[^.]+$/i, "") + ".wav";

    const tempFilePath = path.join(
      tempDir,
      `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`
    );

    await fs.writeFile(tempFilePath, buffer);

    const scriptPath = path.join(process.cwd(), "scripts/transcribe.sh");
    const { stdout, stderr } = await execFileAsync("bash", [
      scriptPath,
      tempFilePath,
    ]);

    fs.unlink(tempFilePath).catch(() => {});

    if (stderr && stderr.trim().length > 0) {
      console.error("whisper-cli stderr:", stderr);
    }

    const text = stdout.trim();

    return NextResponse.json({ text });
  } catch (error: unknown) {
    console.error("Transcribe error:", error);
    const message =
      error instanceof Error ? error.message : "语音转文字失败，请稍后重试。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

