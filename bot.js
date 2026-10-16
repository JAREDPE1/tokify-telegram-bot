
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

// Estadísticas locales: contamos usuarios únicos en chats privados.
// Estos datos comienzan a registrarse desde que se instale esta versión.
const fsLocal = require("fs");
const ARCHIVO_USUARIOS = path.join(__dirname, "usuarios.json");
const DIA = 24 * 60 * 60 * 1000;
const AHORA = () => Date.now();

let registroUsuarios;
try {
  registroUsuarios = JSON.parse(fsLocal.readFileSync(ARCHIVO_USUARIOS, "utf8"));
  if (!registroUsuarios.salt || !registroUsuarios.usuarios) {
    throw new Error("Formato de estadísticas no válido");
  }
} catch (error) {
  if (error.code !== "ENOENT") {
    console.error("⚠️ No se pudo cargar usuarios.json:", error.message);
  }
  registroUsuarios = {
    inicio: new Date().toISOString(),
    salt: crypto.randomBytes(24).toString("hex"),
    usuarios: {}
  };
}

// Las escrituras se serializan y usan un archivo temporal para evitar corrupción.
let escrituraUsuarios = Promise.resolve();
function guardarUsuarios() {
  escrituraUsuarios = escrituraUsuarios
    .catch(() => {})
    .then(async () => {
      const temporal = ARCHIVO_USUARIOS + ".tmp";
      await fs.writeFile(temporal, JSON.stringify(registroUsuarios), {
        mode: 0o600
      });
      await fs.rename(temporal, ARCHIVO_USUARIOS);
    });
  escrituraUsuarios.catch(error => {
    console.error("❌ Error guardando estadísticas:", error.message);
  });
}

function registrarUsuario(id) {
  const clave = crypto.createHmac("sha256", registroUsuarios.salt)
    .update(String(id))
    .digest("hex");
  const ahora = AHORA();
  const previo = registroUsuarios.usuarios[clave];

  // No guardar a disco por cada mensaje: actualizar como máximo cada 5 minutos.
  if (!previo || ahora - previo >= 5 * 60 * 1000) {
    registroUsuarios.usuarios[clave] = ahora;
    guardarUsuarios();
  }
}

bot.use(async (ctx, next) => {
  if (ctx.chat?.type === "private" && ctx.from?.id && !ctx.from.is_bot) {
    registrarUsuario(ctx.from.id);
  }
  await next();
});

// Este comando muestra tu propio ID (no revela el token).
bot.command("miid", async (ctx) => {
  await ctx.reply("🪪 Your Telegram user ID: " + ctx.from.id);
});

// Solo el dueño configurado en .env puede consultar las estadísticas.
bot.command("estadisticas", async (ctx) => {
  if (!process.env.BOT_ADMIN_ID ||
      String(ctx.from?.id) !== String(process.env.BOT_ADMIN_ID)) {
    await ctx.reply("🔒 Statistics are only available to the bot owner.");
    return;
  }

  const visitas = Object.values(registroUsuarios.usuarios);
  const fechaLimite = AHORA() - 30 * DIA;
  const mes = visitas.filter(fecha => fecha >= fechaLimite).length;
  await ctx.reply(
    "📊 TOKIFY — Bot Statistics\n\n" +
    "👥 Total users recorded: " + visitas.length + "\n" +
    "📅 Active in last 30 days: " + mes + "\n" +
    "🗓️ Tracking started: " + registroUsuarios.inicio.slice(0, 10) + "\n\n" +
    "ℹ️ These are local counts, not Telegram's official monthly-user metric."
  );
});

require("./inicio")(bot);
const ejecutar = promisify(execFile);

const sesiones = new Map();
// Cola controlada: máximo 2 descargas/conversiones ejecutándose y 20 en espera.
// Los manejadores de Telegram sólo programan el trabajo y responden rápido.
const MAX_SIMULTANEAS = 2;
const MAX_EN_ESPERA = 20;
const MAX_ESPERA_MS = 15 * 60 * 1000;
const cola = [];
const usuariosEnProceso = new Set();
let trabajosActivos = 0;

function ejecutarCola() {
  while (trabajosActivos < MAX_SIMULTANEAS && cola.length > 0) {
    const tarea = cola.shift();

    if (Date.now() - tarea.creada > MAX_ESPERA_MS) {
      usuariosEnProceso.delete(tarea.usuario);
      Promise.resolve()
        .then(tarea.alExpirar)
        .catch(error => console.error("❌ Error avisando expiración:", error));
      continue;
    }

    trabajosActivos++;
    console.log(`📥 Descargas activas: ${trabajosActivos}/${MAX_SIMULTANEAS}; en espera: ${cola.length}`);

    // No bloqueamos la recepción de los siguientes mensajes de Telegram.
    Promise.resolve()
      .then(tarea.trabajo)
      .catch(error => console.error("❌ Error inesperado en la cola:", error))
      .finally(() => {
        trabajosActivos--;
        usuariosEnProceso.delete(tarea.usuario);
        ejecutarCola();
      });
  }
}

function ponerEnCola(usuario, trabajo, alExpirar) {
  if (usuariosEnProceso.has(usuario)) return { ok: false, motivo: "ocupado" };
  if (trabajosActivos >= MAX_SIMULTANEAS && cola.length >= MAX_EN_ESPERA) {
    return { ok: false, motivo: "llena" };
  }

  const enEspera = trabajosActivos >= MAX_SIMULTANEAS;
  usuariosEnProceso.add(usuario);
  cola.push({ usuario, trabajo, alExpirar, creada: Date.now() });
  ejecutarCola();
  return { ok: true, enEspera };
}

// Las sesiones de botones MUSIC caducan tras 30 minutos.
setInterval(() => {
  const ahora = Date.now();
  for (const [id, sesion] of sesiones) {
    if (ahora - sesion.creado > 30 * 60 * 1000) sesiones.delete(id);
  }
}, 5 * 60 * 1000).unref();

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

// Consulta opcional del estado de la cola.
bot.command("estado", async (ctx) => {
  await ctx.reply(
    `📊 Tokify\n⚡ Descargas activas: ${trabajosActivos}/${MAX_SIMULTANEAS}\n⏳ En espera: ${cola.length}/${MAX_EN_ESPERA}`
  );
});

// Recibir enlaces de TikTok, Instagram y Facebook sin bloquear el polling.
bot.on("message:text", async (ctx) => {
  const resultado = buscarEnlace(ctx.message.text);
  if (!resultado) {
    await ctx.reply("📩 Send a public TikTok, Instagram or Facebook video link.");
    return;
  }

  const respuesta = ponerEnCola(
    String(ctx.from.id),
    async () => {
      let carpeta;
      let stickerTemporal;
      try {
        stickerTemporal = await mostrarSticker(ctx);
        carpeta = await fs.mkdtemp(path.join(os.tmpdir(), "tokify-"));

        const archivo = await descargar(resultado.url, "video", carpeta);
        const id = crypto.randomUUID();
        const botones = new InlineKeyboard().text("🎵 MUSIC", `music:${id}`);

        sesiones.set(id, {
          enlace: resultado.url,
          plataforma: resultado.plataforma,
          usuario: ctx.from.id,
          chat: ctx.chat.id,
          creado: Date.now()
        });

        await ctx.replyWithVideo(new InputFile(archivo), {
          caption: "🎬 Downloaded via Tokify | Video & Music",
          supports_streaming: true,
          reply_markup: botones
        });
      } catch (error) {
        console.error("❌ Error de descarga:", error);
        await ctx.reply(
          "❌ I couldn't download this video. Check that it is public, " +
          "you have permission to download it and it is not too large."
        ).catch(e => console.error("❌ Error avisando al usuario:", e));
      } finally {
        await borrarSticker(ctx, stickerTemporal);
        if (carpeta) {
          await fs.rm(carpeta, { recursive: true, force: true }).catch(() => {});
        }
      }
    },
    async () => {
      await ctx.reply("⌛ Your request waited too long. Please send the link again.");
    }
  );

  if (!respuesta.ok) {
    await ctx.reply(
      respuesta.motivo === "ocupado"
        ? "⏳ You already have a download or conversion in progress or in the queue."
        : "🚦 Tokify is busy. The download queue is full; please try again later."
    );
    return;
  }

  // Reacción rápida al enlace, sin esperar que termine la descarga.
  ctx.react("❤️").catch(error => {
    console.error("⚠️ No se pudo reaccionar al mensaje:", error.message);
  });
});

// Botón MUSIC: usa la misma cola para no saturar la CPU con conversiones.
bot.callbackQuery(/^music:([\da-f-]+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();

  const id = ctx.match[1];
  const sesion = sesiones.get(id);

  if (!sesion || Date.now() - sesion.creado > 30 * 60 * 1000) {
    sesiones.delete(id);
    await ctx.reply("⌛ This button expired. Please send the link again.");
    return;
  }

  if (ctx.from.id !== sesion.usuario || ctx.chat.id !== sesion.chat) {
    await ctx.reply("🔒 This button belongs to the user who sent the link.");
    return;
  }

  const respuesta = ponerEnCola(
    String(ctx.from.id),
    async () => {
      let carpeta;
      let stickerTemporal;

      try {
        stickerTemporal = await mostrarSticker(ctx);
        carpeta = await fs.mkdtemp(path.join(os.tmpdir(), "tokify-"));
        const archivo = await descargar(sesion.enlace, "audio", carpeta);

        await ctx.replyWithAudio(new InputFile(archivo), {
          caption: "🎵 Downloaded via Tokify | Video & Music"
        });
      } catch (error) {
        console.error("❌ Error del MP3:", error);
        await ctx.reply("❌ I couldn't convert this video to MP3.")
          .catch(e => console.error("❌ Error avisando al usuario:", e));
      } finally {
        await borrarSticker(ctx, stickerTemporal);
        if (carpeta) {
          await fs.rm(carpeta, { recursive: true, force: true }).catch(() => {});
        }
      }
    },
    async () => {
      await ctx.reply("⌛ Your MP3 request waited too long. Please try again.");
    }
  );

  if (!respuesta.ok) {
    await ctx.reply(
      respuesta.motivo === "ocupado"
        ? "⏳ You already have a download or conversion in progress or in the queue."
        : "🚦 Tokify is busy. The download queue is full; please try again later."
    );
  }
});

// Control de errores
bot.catch((error) => {
  console.error("❌ Error de Telegram:", error);
});

// Iniciar Tokify
console.log("🚀 Tokify | Video & Music iniciando...");
bot.start();
