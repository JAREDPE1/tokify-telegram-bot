"use strict";

const fs = require("fs/promises");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");

const ejecutar = promisify(execFile);
const LIMITE_BYTES = 47_000_000;
const MAX_TIEMPO_MS = 180_000;
const EXT_VIDEO = [".mp4", ".mkv", ".webm", ".mov", ".m4v"];

class ErrorDescarga extends Error {
  constructor(motivo, descripcion, causa) {
    super(descripcion);
    this.name = "ErrorDescarga";
    this.motivo = motivo;
    this.cause = causa;
  }
}

function clasificar(error) {
  if (error instanceof ErrorDescarga) return error;
  const salida = [error?.stderr, error?.stdout, error?.message].filter(Boolean).join("\n");
  if (error?.code === "ENOENT" || /not found|not recognized as an internal command/i.test(salida)) {
    return new ErrorDescarga("dependencia", "yt-dlp is not installed or is not accessible to the bot.", error);
  }
  if (/timed out|timeout|ETIMEDOUT|killed by signal|ERR_CHILD_PROCESS_STDIO_MAXBUFFER/i.test(salida)) {
    return new ErrorDescarga("tiempo", "The download timed out. Try a shorter video.", error);
  }
  if (/file is larger than max|larger than max-filesize|File is larger than/i.test(salida)) {
    return new ErrorDescarga("tamano", "The video exceeds the download size limit.", error);
  }
  if (/429|too many requests|rate.limit/i.test(salida)) {
    return new ErrorDescarga("limite", "The platform is limiting requests. Please try again later.", error);
  }
  if (/login required|requires login|private (?:video|account|content)|This content is not available|403 Forbidden|not available in your country/i.test(salida)) {
    return new ErrorDescarga("acceso", "This content isn't publicly available for download.", error);
  }
  if (/Unexpected response from webpage request|Unable to extract|Failed to parse JSON|challenge page|impersonation/i.test(salida)) {
    return new ErrorDescarga("extractor", "The platform changed how it serves videos, and yt-dlp could not read this link. Try again later or update yt-dlp.", error);
  }
  if (/ffmpeg|ffprobe/i.test(salida)) {
    return new ErrorDescarga("ffmpeg", "FFmpeg could not process the media. Check the FFmpeg installation.", error);
  }
  return new ErrorDescarga("desconocido", "The video could not be processed. Please try a different public link.", error);
}

function mensajeError(error, tipo) {
  const e = clasificar(error);
  const prefijo = tipo === "audio" ? "🎵 MP3" : "🎬 Video";
  return `❌ ${prefijo}: ${e.message}\n\nOnly download content you have permission to use.`;
}

async function descargar(url, tipo, carpeta, opciones = {}) {
  if (!["audio", "video"].includes(tipo)) {
    throw new ErrorDescarga("tipo", "Unsupported download type.");
  }
  if (!url || !/^https:\/\//i.test(url)) {
    throw new ErrorDescarga("url", "Please send a valid HTTPS link.");
  }
  const binario = opciones.binario || process.env.YTDLP_PATH || "yt-dlp";
  const argumentos = [
    "--no-config",
    "--no-playlist",
    "--no-progress",
    "--socket-timeout", "20",
    "--retries", "2",
    "--fragment-retries", "2",
    "--max-filesize", "45M",
    "-o", path.join(carpeta, "tokify.%(ext)s")
  ];

  if (tipo === "audio") {
    argumentos.push("-x", "--audio-format", "mp3", "--audio-quality", "5");
  } else {
    // Prefer a moderate MP4 for reliable Telegram uploads.
    argumentos.push("--format-sort", "res:720,ext:mp4", "--recode-video", "mp4");
  }
  argumentos.push(url);

  try {
    await ejecutar(binario, argumentos, {
      timeout: MAX_TIEMPO_MS,
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true
    });
  } catch (e) {
    throw clasificar(e);
  }

  // No assumption that a successful yt-dlp run always produces "tokify.mp4".
  // The downloaded format or post-processing may change the extension.
  const entradas = await fs.readdir(carpeta, { withFileTypes: true });
  const extensiones = tipo === "audio" ? [".mp3"] : EXT_VIDEO;
  const archivos = entradas
    .filter(e => e.isFile() && e.name.startsWith("tokify."))
    .filter(e => extensiones.includes(path.extname(e.name).toLowerCase()))
    .sort((a, b) => {
      const preferida = tipo === "audio" ? ".mp3" : ".mp4";
      return Number(path.extname(b.name) === preferida) -
        Number(path.extname(a.name) === preferida);
    });

  if (archivos.length === 0) {
    throw new ErrorDescarga("archivo", "No compatible media file was produced by yt-dlp.");
  }

  const archivo = path.join(carpeta, archivos[0].name);
  const info = await fs.stat(archivo);

  if (!info.size) throw new ErrorDescarga("archivo", "The downloaded file is empty.");
  if (info.size > LIMITE_BYTES) {
    throw new ErrorDescarga("tamano", "The file is too large for this Telegram bot (47 MB limit).");
  }
  return { archivo, esMp4: path.extname(archivo).toLowerCase() === ".mp4" };
}

module.exports = { descargar, mensajeError, clasificar, ErrorDescarga };
