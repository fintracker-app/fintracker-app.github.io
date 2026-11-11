// Pengirim pengingat FinTracker versi web.
// Dijalankan otomatis oleh GitHub Actions setiap 15 menit.
//
// Untuk setiap akun di Firestore "webPush/{uid}":
// - Pengingat harian: kalau jam pengingat sudah lewat, belum dikirim hari ini,
//   dan hari ini belum ada pengeluaran yang dicatat.
// - Pengingat awal periode: di hari pertama periode baru, mulai jam 08.00.

const admin = require('firebase-admin');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const db = admin.firestore();

const APP_URL = 'https://fintracker-app.github.io/app/';
const ICON_URL = 'https://fintracker-app.github.io/app/icons/Icon-192.png';

// Waktu lokal pengguna (dibaca dengan getUTC...)
function localNow(offsetMinutes) {
  return new Date(Date.now() + offsetMinutes * 60 * 1000);
}

function ymd(date) {
  return date.toISOString().slice(0, 10);
}

// Apakah ada pengeluaran di tanggal ini (dari data aplikasi di users/{uid})
async function hasExpenseOn(uid, dateText) {
  const snap = await db.collection('users').doc(uid).get();

  if (!snap.exists) {
    return false;
  }

  try {
    const data = JSON.parse(snap.get('json') || '{}');

    return (data.transactions || []).some(
      (t) => t.type === 'expense' && String(t.date).slice(0, 10) === dateText,
    );
  } catch (e) {
    return false;
  }
}

// Mengirim ke semua perangkat milik satu akun.
// Mengembalikan token yang sudah tidak berlaku (untuk dihapus).
async function send(tokens, title, body) {
  const result = await admin.messaging().sendEachForMulticast({
    tokens,
    notification: { title, body },
    webpush: {
      notification: { icon: ICON_URL },
      fcmOptions: { link: APP_URL },
    },
  });

  const invalid = [];

  result.responses.forEach((r, i) => {
    const code = r.error && r.error.code;

    if (
      code === 'messaging/registration-token-not-registered' ||
      code === 'messaging/invalid-registration-token' ||
      code === 'messaging/invalid-argument'
    ) {
      invalid.push(tokens[i]);
    }
  });

  console.log(`Terkirim ${result.successCount}, gagal ${result.failureCount}: ${title}`);

  return invalid;
}

async function main() {
  const snap = await db.collection('webPush').get();

  console.log(`Memeriksa ${snap.size} akun`);

  for (const doc of snap.docs) {
    const d = doc.data();

    const tokens = Array.isArray(d.tokens) ? d.tokens : [];

    if (tokens.length === 0) {
      continue;
    }

    try {
      const offset = typeof d.tzOffsetMinutes === 'number' ? d.tzOffsetMinutes : 420;

      const now = localNow(offset);

      const today = ymd(now);

      const minutesNow = now.getUTCHours() * 60 + now.getUTCMinutes();

      const updates = {};

      let invalid = [];

      // 1. Pengingat harian
      if (d.dailyOn !== false) {
        const target = (d.dailyHour ?? 20) * 60 + (d.dailyMinute ?? 0);

        if (minutesNow >= target && d.lastDailySent !== today) {
          updates.lastDailySent = today;

          if (!(await hasExpenseOn(doc.id, today))) {
            invalid = invalid.concat(
              await send(
                tokens,
                'Sudah catat pengeluaran hari ini?',
                'Catat sekarang supaya uangmu tetap terpantau. Cuma semenit kok.',
              ),
            );
          }
        }
      }

      // 2. Pengingat awal periode
      if (d.periodOn !== false && typeof d.nextPeriodStart === 'string') {
        if (
          today >= d.nextPeriodStart &&
          minutesNow >= 8 * 60 &&
          d.lastPeriodSent !== d.nextPeriodStart
        ) {
          updates.lastPeriodSent = d.nextPeriodStart;

          invalid = invalid.concat(
            await send(
              tokens,
              'Periode baru dimulai',
              'Uang saku sudah masuk? Yuk catat pemasukanmu dan cek pembagian budget.',
            ),
          );
        }
      }

      if (invalid.length > 0) {
        updates.tokens = admin.firestore.FieldValue.arrayRemove(...new Set(invalid));
      }

      if (Object.keys(updates).length > 0) {
        await doc.ref.update(updates);
      }
    } catch (e) {
      console.error(`Gagal memproses ${doc.id}:`, e.message);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
