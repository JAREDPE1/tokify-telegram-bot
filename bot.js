
require("dotenv").config();

const { Bot, InputFile, InlineKeyboard } = require("grammy");
const { execFile } = require("child_process");
const { promisify } = require("util");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

if (!process.env.BOT_TOKEN) {
  console.error("❌ Falta BOT_TOKEN en .env");
  process.exit(1);
}

const bot = new Bot(process.env.BOT_TOKEN);
require("./inicio")(bot);
const ejecutar = promisify(execFile);

const sesiones = new Map();
const ocupados = new Set();
const LIMITE = 47_000_000;

// Detectar enlaces de TikTok
function buscarEnlace(texto) {
  const enlaces = texto.match(/https?:\/\/[^\s<>"']+/gi) || [];

  for (let enlace of enlaces) {
    enlace = enlace.replace(/[.,!?;)\]]+$/g, "");

    try {
      const url = new URL(enlace);
      const dominio = url.hostname.toLowerCase();

      if (
        ["http:", "https:"].includes(url.protocol) &&
        (dominio === "tiktok.com" ||
          dominio.endsWith(".tiktok.com"))
      ) {
        return url.href;
      }
    } catch {
      // Enlace no válido
    }
  }

  return null;
}

// Descargar video o MP3
async function descargar(url, tipo, carpeta) {
  const argumentos = [
    "--no-playlist",
    "--no-progress",
    "--no-warnings",
    "--max-filesize", "45M",
    "-o", path.join(carpeta, "tokify.%(ext)s")
  ];

  if (tipo === "audio") {
    argumentos.push(
      "-x",
      "--audio-format", "mp3",
      "--audio-quality", "5"
    );
  } else {
    argumentos.push("--recode-video", "mp4");
  }

  argumentos.push(url);

  await ejecutar("yt-dlp", argumentos, {
    timeout: 180000,
    maxBuffer: 1024 * 1024,
    windowsHide: true
  });

  const archivo = path.join(
    carpeta,
    tipo === "audio" ? "tokify.mp3" : "tokify.mp4"
  );

  const datos = await fs.stat(archivo);

  if (datos.size > LIMITE) {
    throw new Error("Archivo demasiado grande");
  }

  return archivo;
}

// Comando de bienvenida
bot.command("start", async (ctx) => {
  await ctx.reply(
    "🤖 ¡Bienvenido a Tokify | Video & Music!\n\n" +
    "🎬 Descarga videos de TikTok\n" +
    "🎵 Convierte videos a MP3\n" +
    "📥 Envíame un enlace de TikTok.\n\n" +
    "✅ No necesitas escribir comandos.\n" +
    "ℹ️ Descarga solo contenido que tengas permiso de usar."
  );
});

// Recibir enlaces automáticamente
bot.on("message:text", async (ctx) => {
  const enlace = buscarEnlace(ctx.message.text);

  if (!enlace) {
    await ctx.reply(
      "📩 Envíame un enlace válido de TikTok."
    );
    return;
  }

  const clave = `${ctx.chat.id}:${ctx.from.id}`;

  if (ocupados.has(clave)) {
    await ctx.reply("⏳ Espera a que termine tu descarga.");
    return;
  }

  ocupados.add(clave);
  let carpeta;

  try {
    await ctx.reply("⏳ Descargando tu video...");

    carpeta = await fs.mkdtemp(
      path.join(os.tmpdir(), "tokify-")
    );

    const archivo = await descargar(
      enlace,
      "video",
      carpeta
    );

    const id = crypto.randomUUID();

    const botones = new InlineKeyboard()
      .text("🎵 MUSIC", `music:${id}`);

    sesiones.set(id, {
      enlace,
      usuario: ctx.from.id,
      chat: ctx.chat.id,
      creado: Date.now()
    });

    await ctx.replyWithVideo(
      new InputFile(archivo),
      {
        caption: "🎬 Downloaded via Tokify | Video & Music",
        supports_streaming: true,
        reply_markup: botones
      }
    );

  } catch (error) {
    console.error("❌ Error de descarga:", error);

    await ctx.reply(
      "❌ No pude descargar este video.\n" +
      "Comprueba que sea público, descargable y no muy grande."
    );

  } finally {
    if (carpeta) {
      await fs.rm(carpeta, {
        recursive: true,
        force: true
      }).catch(() => {});
    }

    ocupados.delete(clave);
  }
});

// Botón para descargar música
bot.callbackQuery(/^music:([\da-f-]+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();

  const id = ctx.match[1];
  const sesion = sesiones.get(id);

  if (
    !sesion ||
    Date.now() - sesion.creado > 30 * 60 * 1000
  ) {
    sesiones.delete(id);
    await ctx.reply(
      "⌛ El botón expiró. Envía nuevamente el enlace."
    );
    return;
  }

  if (
    ctx.from.id !== sesion.usuario ||
    ctx.chat.id !== sesion.chat
  ) {
    await ctx.reply(
      "🔒 Este botón pertenece al usuario que envió el enlace."
    );
    return;
  }

  const clave = `${ctx.chat.id}:${ctx.from.id}`;

  if (ocupados.has(clave)) {
    await ctx.reply("⏳ Ya tienes una descarga en proceso.");
    return;
  }

  ocupados.add(clave);
  let carpeta;

  try {
    await ctx.reply("🎵 Preparando tu música MP3...");

    carpeta = await fs.mkdtemp(
      path.join(os.tmpdir(), "tokify-")
    );

    const archivo = await descargar(
      sesion.enlace,
      "audio",
      carpeta
    );

    await ctx.replyWithAudio(
      new InputFile(archivo),
      {
        caption: "🎵 Downloaded via Tokify | Video & Music"
      }
    );

  } catch (error) {
    console.error("❌ Error del MP3:", error);

    await ctx.reply(
      "❌ No pude convertir este video a MP3."
    );

  } finally {
    if (carpeta) {
      await fs.rm(carpeta, {
        recursive: true,
        force: true
      }).catch(() => {});
    }

    ocupados.delete(clave);
  }
});

// Control de errores
bot.catch((error) => {
  console.error("❌ Error de Telegram:", error);
});

// Iniciar Tokify
console.log("🚀 Tokify | Video & Music iniciando...");
bot.start();
