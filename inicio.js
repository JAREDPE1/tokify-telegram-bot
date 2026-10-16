
const fs = require("fs");
const path = require("path");
const { InlineKeyboard, InputFile } = require("grammy");

const ARCHIVO = path.join(__dirname, "idiomas.json");
const IMAGEN_TUTORIAL_ES = path.join(__dirname, "tutorial_tiktok.png");

const idiomas = [
  ["es", "🇪🇸 Español"],
  ["en", "🇺🇸 English"],
  ["pt", "🇧🇷 Português"],
  ["fr", "🇫🇷 Français"],
  ["de", "🇩🇪 Deutsch"],
  ["it", "🇮🇹 Italiano"],
  ["ru", "🇷🇺 Русский"],
  ["ar", "🇸🇦 العربية"],
  ["hi", "🇮🇳 हिन्दी"],
  ["id", "🇮🇩 Indonesia"]
];

const tutoriales = {
  es: `🎬 ¡Bienvenido a Tokify | Video & Music!

📥 Descarga videos de TikTok y obtén su audio MP3.

📖 ¿Cómo usar el bot?

1️⃣ Abre TikTok y busca un video.
2️⃣ Pulsa Compartir y copia el enlace.
3️⃣ Envíame el enlace aquí.
4️⃣ Espera a que te envíe el video.
5️⃣ Pulsa 🎵 MUSIC para obtener su audio.

✅ No necesitas escribir comandos.
🔒 Descarga contenido que tengas permiso de usar.`,

  en: `🎬 Welcome to Tokify | Video & Music!

📥 Download TikTok videos and get MP3 audio.

📖 How to use the bot:

1️⃣ Open TikTok and find a video.
2️⃣ Tap Share and copy the link.
3️⃣ Send the link to this chat.
4️⃣ Wait for your video.
5️⃣ Tap 🎵 MUSIC to get its audio.

✅ No commands required.
🔒 Only download content you have permission to use.`,

  pt: `🎬 Bem-vindo ao Tokify | Video & Music!

📥 Baixe vídeos do TikTok e obtenha áudio MP3.

📖 Como usar:

1️⃣ Abra o TikTok e escolha um vídeo.
2️⃣ Toque em Compartilhar e copie o link.
3️⃣ Envie o link neste chat.
4️⃣ Aguarde o envio do vídeo.
5️⃣ Toque em 🎵 MUSIC para obter o áudio.

✅ Não precisa usar comandos.
🔒 Baixe apenas conteúdo autorizado.`,

  fr: `🎬 Bienvenue sur Tokify | Video & Music !

📥 Téléchargez des vidéos TikTok et obtenez l'audio MP3.

📖 Mode d'emploi :

1️⃣ Ouvrez TikTok et choisissez une vidéo.
2️⃣ Appuyez sur Partager et copiez le lien.
3️⃣ Envoyez le lien ici.
4️⃣ Attendez la vidéo.
5️⃣ Appuyez sur 🎵 MUSIC pour obtenir l'audio.

✅ Aucune commande nécessaire.
🔒 Téléchargez uniquement les contenus autorisés.`,

  de: `🎬 Willkommen bei Tokify | Video & Music!

📥 Lade TikTok-Videos und MP3-Audio herunter.

📖 So funktioniert es:

1️⃣ Öffne TikTok und wähle ein Video.
2️⃣ Tippe auf Teilen und kopiere den Link.
3️⃣ Sende den Link in diesen Chat.
4️⃣ Warte auf das Video.
5️⃣ Tippe auf 🎵 MUSIC für die Audiodatei.

✅ Keine Befehle erforderlich.
🔒 Lade nur erlaubte Inhalte herunter.`,

  it: `🎬 Benvenuto su Tokify | Video & Music!

📥 Scarica video TikTok e ottieni audio MP3.

📖 Come funziona:

1️⃣ Apri TikTok e scegli un video.
2️⃣ Tocca Condividi e copia il link.
3️⃣ Invia il link in questa chat.
4️⃣ Attendi il video.
5️⃣ Tocca 🎵 MUSIC per ottenere l'audio.

✅ Non servono comandi.
🔒 Scarica solo contenuti autorizzati.`,

  ru: `🎬 Добро пожаловать в Tokify | Video & Music!

📥 Скачивайте видео TikTok и получайте MP3.

📖 Как пользоваться:

1️⃣ Откройте TikTok и выберите видео.
2️⃣ Нажмите «Поделиться» и скопируйте ссылку.
3️⃣ Отправьте ссылку в этот чат.
4️⃣ Дождитесь получения видео.
5️⃣ Нажмите 🎵 MUSIC для получения аудио.

✅ Команды не нужны.
🔒 Скачивайте только разрешённый контент.`,

  ar: `🎬 مرحباً بك في Tokify | Video & Music!

📥 حمّل فيديوهات TikTok واحصل على الصوت بصيغة MP3.

📖 طريقة الاستخدام:

1️⃣ افتح TikTok واختر فيديو.
2️⃣ اضغط على مشاركة وانسخ الرابط.
3️⃣ أرسل الرابط إلى هذه المحادثة.
4️⃣ انتظر حتى يصلك الفيديو.
5️⃣ اضغط 🎵 MUSIC للحصول على الصوت.

✅ لا تحتاج إلى كتابة أوامر.
🔒 حمّل المحتوى المسموح لك باستخدامه فقط.`,

  hi: `🎬 Tokify | Video & Music में आपका स्वागत है!

📥 TikTok वीडियो डाउनलोड करें और MP3 ऑडियो पाएँ।

📖 इस्तेमाल कैसे करें:

1️⃣ TikTok खोलें और वीडियो चुनें।
2️⃣ शेयर दबाकर लिंक कॉपी करें।
3️⃣ लिंक इस चैट में भेजें।
4️⃣ वीडियो आने का इंतज़ार करें।
5️⃣ ऑडियो के लिए 🎵 MUSIC दबाएँ।

✅ कमांड लिखने की ज़रूरत नहीं है।
🔒 केवल अनुमति वाला कंटेंट डाउनलोड करें।`,

  id: `🎬 Selamat datang di Tokify | Video & Music!

📥 Unduh video TikTok dan dapatkan audio MP3.

📖 Cara menggunakan:

1️⃣ Buka TikTok dan pilih video.
2️⃣ Tekan Bagikan dan salin tautannya.
3️⃣ Kirim tautan ke chat ini.
4️⃣ Tunggu video dikirim.
5️⃣ Tekan 🎵 MUSIC untuk mendapatkan audio.

✅ Tidak perlu mengetik perintah.
🔒 Unduh hanya konten yang diizinkan.`
};

// Cargar idiomas guardados
let preferencias = {};

try {
  preferencias = JSON.parse(
    fs.readFileSync(ARCHIVO, "utf8")
  );
} catch {
  preferencias = {};
}

function guardarIdioma(usuario, idioma) {
  preferencias[usuario] = idioma;

  fs.writeFileSync(
    ARCHIVO,
    JSON.stringify(preferencias, null, 2),
    "utf8"
  );
}

function crearBotones() {
  const teclado = new InlineKeyboard();

  for (let i = 0; i < idiomas.length; i += 2) {
    teclado.text(idiomas[i][1], `idioma:${idiomas[i][0]}`);

    if (idiomas[i + 1]) {
      teclado.text(
        idiomas[i + 1][1],
        `idioma:${idiomas[i + 1][0]}`
      );
    }

    if (i + 2 < idiomas.length) {
      teclado.row();
    }
  }

  return teclado;
}

module.exports = function configurarInicio(bot) {

  // Menú de idiomas al presionar START
  bot.command("start", async (ctx) => {
    await ctx.reply(
      "🌍 Welcome to Tokify!\n" +
      "Choose your language / Selecciona tu idioma:",
      { reply_markup: crearBotones() }
    );
  });

  // Cambiar de idioma cuando quiera
  bot.command("idioma", async (ctx) => {
    await ctx.reply(
      "🌍 Choose your language / Selecciona tu idioma:",
      { reply_markup: crearBotones() }
    );
  });

  // Procesar la selección del idioma
  bot.callbackQuery(/^idioma:([a-z]{2})$/, async (ctx) => {
    const idioma = ctx.match[1];

    if (!tutoriales[idioma]) {
      await ctx.answerCallbackQuery({
        text: "Idioma no disponible"
      });
      return;
    }

    try {
      guardarIdioma(ctx.from.id, idioma);

      await ctx.answerCallbackQuery({
        text: "✅ Idioma guardado"
      });

      const nombre = idiomas.find(
        (item) => item[0] === idioma
      )[1];

      await ctx.editMessageText(
        `✅ ${nombre}`
      );

      // En español: usar la imagen de guía en lugar del tutorial largo.
      // En otros idiomas: mantener el texto traducido hasta crear
      // sus respectivas imágenes.
      if (idioma === "es" && fs.existsSync(IMAGEN_TUTORIAL_ES)) {
        try {
          await ctx.replyWithPhoto(
            new InputFile(IMAGEN_TUTORIAL_ES),
            {
              caption:
                "🎬 HOW TO USE TOKIFY\n\n" +
                "1️⃣ Open TikTok, Instagram, or Facebook.\n" +
                "2️⃣ Tap Share and select Copy Link.\n" +
                "3️⃣ Paste the link into this chat.\n" +
                "4️⃣ Receive your video when available!\n\n" +
                "🎵 Tap MUSIC to get the audio in MP3 format.\n" +
                "✅ Download only content you have permission to use."
            }
          );
        } catch (error) {
          console.error("❌ No se pudo enviar la imagen tutorial:", error.message);
          await ctx.reply(tutoriales[idioma]);
        }
      } else {
        await ctx.reply(tutoriales[idioma]);
      }

    } catch (error) {
      console.error("Error de idioma:", error);

      await ctx.reply(
        "❌ No se pudo guardar tu idioma. Inténtalo otra vez."
      );
    }
  });
};
