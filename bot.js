
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
const STICKER_ID = (process.env.DOWNLOAD_STICKER_ID || "").trim();
const STICKER_ARCHIVO = path.join(__dirname, "AnimatedSticker.tgs");

// Responde al sticker elegido con /stickerid para obtener su identificador.
bot.command("stickerid", async (ctx) => {
  const sticker = ctx.message.reply_to_message?.sticker;
  if (!sticker) {
    await ctx.reply("🎨 Envíame un sticker y respóndele con /stickerid.");
    return;
  }

  await ctx.reply(
    "🧩 Copia este ID y agrégalo en tu archivo .env:\n" +
    "DOWNLOAD_STICKER_ID=" + sticker.file_id
  );
});

// Sticker temporal mientras se descarga o convierte el archivo.
async function mostrarSticker(ctx) {
  try {
    // Priorizar el sticker animado que eligió el usuario.
    await fs.access(STICKER_ARCHIVO);
    return await ctx.replyWithSticker(new InputFile(STICKER_ARCHIVO));
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("⚠️ No se pudo usar AnimatedSticker.tgs:", error.message);
    }
  }

  // Alternativa opcional: usar un ID de sticker guardado en .env.
  if (STICKER_ID) {
    try {
      return await ctx.replyWithSticker(STICKER_ID);
    } catch (error) {
      console.error("⚠️ No se pudo enviar el sticker alternativo:", error.message);
    }
  }

  // No mostrar mensajes de progreso si el sticker no está disponible.
  return null;
}

async function borrarSticker(ctx, mensaje) {
  if (!mensaje) return;
  await ctx.api.deleteMessage(ctx.chat.id, mensaje.message_id)
    .catch((error) => {
      console.error("⚠️ No se pudo borrar el sticker:", error.message);
    });
}

// Detectar enlaces públicos de TikTok, Instagram y Facebook
function buscarEnlace(texto) {
  const enlaces = texto.match(/https?:\/\/[^\s<>"']+/gi) || [];

  for (let enlace of enlaces) {
    enlace = enlace.replace(/[.,!?;)\]]+$/g, "");

    try {
      const url = new URL(enlace);
      const dominio = url.hostname.toLowerCase();

      if (!["https:", "http:"].includes(url.protocol)) continue;

      let plataforma = null;

      if (dominio === "tiktok.com" || dominio.endsWith(".tiktok.com")) {
        plataforma = "TikTok";
      } else if (
        dominio === "instagram.com" ||
        dominio.endsWith(".instagram.com") ||
        dominio === "instagr.am" ||
        dominio.endsWith(".instagr.am")
      ) {
        plataforma = "Instagram";
      } else if (
        dominio === "facebook.com" ||
        dominio.endsWith(".facebook.com") ||
        dominio === "fb.watch" ||
        dominio.endsWith(".fb.watch") ||
        dominio === "fb.com" ||
        dominio.endsWith(".fb.com")
      ) {
        plataforma = "Facebook";
      }

      if (plataforma) {
        return { url: url.href, plataforma };
      }
    } catch {
      // Enlace no válido: continuar con los demás
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

// Recibir enlaces automáticamente
bot.on("message:text", async (ctx) => {
  const resultado = buscarEnlace(ctx.message.text);

  if (!resultado) {
    await ctx.reply(
      "📩 Envíame un enlace de video público de TikTok, Instagram o Facebook."
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
  let stickerTemporal;

  try {
    // Reaccionar directamente al enlace que envió el usuario.
    await ctx.react("❤️").catch((error) => {
      console.error("⚠️ Reacción no disponible:", error.message);
    });

    stickerTemporal = await mostrarSticker(ctx);

    carpeta = await fs.mkdtemp(
      path.join(os.tmpdir(), "tokify-")
    );

    const archivo = await descargar(
      resultado.url,
      "video",
      carpeta
    );

    const id = crypto.randomUUID();

    const botones = new InlineKeyboard()
      .text("🎵 MUSIC", `music:${id}`);

    sesiones.set(id, {
      enlace: resultado.url,
      plataforma: resultado.plataforma,
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
      "Comprueba que sea público, que tengas permiso para descargarlo y que no exceda el límite. Instagram y Facebook pueden exigir inicio de sesión."
    );

  } finally {
    await borrarSticker(ctx, stickerTemporal);

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
  let stickerTemporal;

  try {
    stickerTemporal = await mostrarSticker(ctx);

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
    await borrarSticker(ctx, stickerTemporal);

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
