/* =========================================================
   CERMIN EMOSI — script.js
   Alur kerja:
     kamera  →  AI (face-api) memberi ANGKA peluang tiap ekspresi
             →  KODE KITA memutuskan emoji, pesan, dan warna
   ========================================================= */

/* ---------- PENGATURAN (boleh diubah) ---------- */

// MISI 2: nama folder tempat file model AI berada.
const JALUR_MODEL = 'models';

// ✏️ AI baru menjawab jika yakin minimal 60%
const AMBANG_YAKIN = 0.6;
const BELUM_YAKIN = { emoji: "🤔", nama: "Belum yakin", teks: "Coba tunjukkan ekspresimu lebih jelas!" };

// Jeda antar tebakan (milidetik). Makin kecil makin cepat, tapi makin berat.
const JEDA_MS = 150;

// MISI 3: reaksi untuk setiap ekspresi.
// Kunci harus persis salah satu dari:
// neutral, happy, sad, angry, surprised, fearful, disgusted
const EKSPRESI = {
  neutral:   { emoji: '😐', pesan: 'Lagi santai kawan',          warna: '#ECEFF1' },
  happy:     { emoji: '😄', pesan: 'Senyummu menular!',          warna: '#FFF59D' },
  sad:       { emoji: '😢', pesan: 'Tenang, semua akan baik.',   warna: '#BBDEFB' },
  surprised: { emoji: '😲', pesan: 'Wah, kaget ya?',             warna: '#E1BEE7' },
  angry:     { emoji: '😠', pesan: 'Tarik napas dulu...',        warna: '#FFCDD2' },
  fearful:   { emoji: '😨', pesan: 'Tidak apa-apa, aman kok.',   warna: '#D1C4E9' },
  disgusted: { emoji: '🤢', pesan: 'Hmm, tidak enak ya?',        warna: '#C8E6C9' },
};

/* ---------- Bagian di bawah ini tidak perlu diubah ---------- */

const video       = document.getElementById('video');
const overlay     = document.getElementById('overlay');
const stage       = document.getElementById('stage');
const placeholder = document.getElementById('placeholder');
const elEmoji     = document.getElementById('emoji');
const elPesan     = document.getElementById('pesan');
const elAngka     = document.getElementById('angka');
const elStatus    = document.getElementById('status');
const btnMulai    = document.getElementById('btnMulai');

let sedangJalan = false;

function tampilStatus(teks, jenis) {
  elStatus.textContent = teks;
  elStatus.className = 'status' + (jenis ? ' ' + jenis : '');
}

// Memastikan library face-api sudah dimuat oleh index.html
function pastikanLibrary() {
  if (typeof faceapi === 'undefined') {
    tampilStatus(
      '❌ MISI 1: library face-api belum terpasang. Buka Console (F12) untuk melihat pesan error.',
      'error'
    );
    console.error(
      'faceapi tidak ditemukan. Pasang <script src="..."> face-api di index.html, ' +
      'SEBELUM <script src="script.js">.'
    );
    return false;
  }
  return true;
}

// Memilih "mesin" hitung AI: kartu grafis (webgl) kalau ada, kalau tidak pakai CPU
async function siapkanMesin() {
  const adaWebgl = await faceapi.tf.setBackend('webgl').catch(() => false);
  if (!adaWebgl) await faceapi.tf.setBackend('cpu');
  await faceapi.tf.ready();
}

// Memuat dua model AI: pendeteksi wajah dan penebak ekspresi
async function muatModel() {
  tampilStatus('⏳ Memuat model AI dari folder "' + JALUR_MODEL + '"...');
  await siapkanMesin();
  await faceapi.nets.tinyFaceDetector.loadFromUri(JALUR_MODEL);
  await faceapi.nets.faceExpressionNet.loadFromUri(JALUR_MODEL);
}

// Menyalakan kamera dan menyesuaikan ukuran kanvas
async function nyalakanKamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('Kamera hanya bisa dipakai lewat localhost atau HTTPS.');
  }
  const aliran = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
    audio: false,
  });
  video.srcObject = aliran;
  await new Promise((selesai) => { video.onloadedmetadata = selesai; });
  await video.play();

  overlay.width  = video.videoWidth;
  overlay.height = video.videoHeight;
  stage.style.aspectRatio = video.videoWidth + ' / ' + video.videoHeight;
  placeholder.hidden = true;
}

// Menggambar kotak hijau di sekitar wajah
function gambarKotak(hasil) {
  const ctx = overlay.getContext('2d');
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  if (!hasil) return;
  const { x, y, width, height } = hasil.detection.box;
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#00C853';
  ctx.strokeRect(x, y, width, height);
}

// Menampilkan emoji, pesan, dan warna latar
function tampilReaksi(kunci) {
  let emoji, pesan, warna;

  if (kunci === 'tidak-ada-wajah') {
    emoji = '🔍'; pesan = 'Wajahmu belum terlihat. Hadapkan ke kamera.'; warna = '#ECEFF1';
  } else if (kunci === 'ragu') {
    emoji = '🤔'; pesan = 'AI masih ragu...'; warna = '#ECEFF1';
  } else if (EKSPRESI[kunci]) {
    ({ emoji, pesan, warna } = EKSPRESI[kunci]);
  } else {
    emoji = '❓';
    pesan = 'Belum ada reaksi untuk "' + kunci + '". Tambahkan di objek EKSPRESI.';
    warna = '#ECEFF1';
  }

  elEmoji.textContent = emoji;
  elPesan.textContent = pesan;
  document.body.style.setProperty('--warna', warna);
}

// Menampilkan angka mentah dari AI (3 teratas)
function tampilAngka(urut) {
  elAngka.textContent = urut
    .slice(0, 3)
    .map((e) => e.expression + ' ' + Math.round(e.probability * 100) + '%')
    .join('  ·  ');
}

// Satu kali tebakan: AI memberi angka, kode kita memutuskan
async function tebakSekali() {
  const opsi = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });
  const hasil = await faceapi.detectSingleFace(video, opsi).withFaceExpressions();

  gambarKotak(hasil);

  if (!hasil) {
    elAngka.textContent = '';
    tampilReaksi('tidak-ada-wajah');
    return;
  }

  const urut = hasil.expressions.asSortedArray(); // dari yang paling yakin
  const teratas = urut[0];
  tampilAngka(urut);

   if (teratas.probability < AMBANG_YAKIN) {
     tampilReaksi('ragu');
   } else {
     tampilReaksi(teratas.expression);
   }
}

async function ulangi() {
  if (!sedangJalan) return;
  try {
    await tebakSekali();
  } catch (galat) {
    console.error(galat);
    tampilStatus('⚠️ Terjadi galat saat menebak. Lihat Console (F12).', 'error');
  }
  setTimeout(ulangi, JEDA_MS);
}

btnMulai.addEventListener('click', async () => {
  if (sedangJalan || !pastikanLibrary()) return;
  btnMulai.disabled = true;

  try {
    await muatModel();
  } catch (galat) {
    console.error(galat);
    tampilStatus(
      '❌ MISI 2: model AI tidak bisa dimuat dari folder "' + JALUR_MODEL + '". ' +
      'Periksa nama folder dan buka halaman lewat localhost, bukan klik dua kali file.',
      'error'
    );
    btnMulai.disabled = false;
    return;
  }

  try {
    await nyalakanKamera();
  } catch (galat) {
    console.error(galat);
    let alasan = galat.message;
    if (galat.name === 'NotAllowedError') alasan = 'Izin kamera ditolak. Izinkan kamera di browser.';
    if (galat.name === 'NotFoundError')   alasan = 'Kamera tidak ditemukan.';
    tampilStatus('❌ Kamera gagal menyala: ' + alasan, 'error');
    btnMulai.disabled = false;
    return;
  }

  sedangJalan = true;
  tampilStatus('✅ AI siap. Ubah ekspresimu!', 'ok');
  tampilReaksi('tidak-ada-wajah');
  ulangi();
});

// Saat halaman dibuka: langsung cek apakah library sudah terpasang
if (pastikanLibrary()) {
  tampilStatus('Siap. Tekan "Mulai Kamera".');
}
