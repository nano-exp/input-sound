# Input Sound

语音转文字 Web 应用，基于 Next.js 和 whisper.cpp 实现。

## 功能

- 录制或上传音频文件
- 使用 whisper.cpp 进行本地语音识别
- 支持中文语音转文字

## 前置要求

- [whisper.cpp](https://github.com/ggerganov/whisper.cpp) 已编译安装
- 模型文件 `ggml-base.bin` 已下载到 `~/Developer/whisper.cpp/models/`

## 安装

```bash
bun install
```

## 开发

```bash
bun dev
```

访问 http://localhost:3000

## API

### POST /api/transcribe

上传音频文件进行转录。

**请求**: `multipart/form-data`
- `file`: 音频文件 (支持格式: wav, mp3, m4a, webm 等)

**响应**:
```json
{
  "text": "转录的文字内容"
}
```

## 项目结构

```
├── scripts/
│   └── transcribe.sh      # whisper-cli 封装脚本
├── src/
│   └── app/
│       ├── api/transcribe/
│       │   └── route.ts   # 转录 API 路由
│       ├── page.tsx       # 主页面
│       └── layout.tsx     # 根布局
```
