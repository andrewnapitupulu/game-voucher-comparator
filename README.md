# TopUp Scout — Game Price Comparator tanpa Database dan Cache

Web pembanding harga top-up game Indonesia. Setiap pencarian menghubungi sumber harga secara langsung, menormalisasi nama paket, mengelompokkan produk yang setara, lalu mengurutkan penawaran dari harga termurah.

## Fitur

- Pencarian nama game dan alias: `MLBB`, `FF`, `PUBGM`, `GI`, `VALO`.
- Adapter best-effort untuk halaman publik Codashop, UniPin, Lapakgaming, dan Dunia Games.
- Adapter feed JSON untuk partner/affiliate resmi.
- Fetch paralel dengan timeout per toko.
- Satu toko gagal tidak menggagalkan toko lain.
- Normalisasi paket seperti `77 Diamonds + 8 Bonus` dan `85 Diamonds`.
- Pemisahan diamond reguler, Weekly Pass, Welkin, membership, dan paket khusus.
- Sorting harga termurah, nominal, jumlah toko, dan potensi hemat.
- Status harga `Live` atau `Demo` ditampilkan secara transparan.
- Tidak memakai database.
- Tidak memakai Redis atau cache aplikasi.
- Opsional OpenAI untuk mengenali query game yang tidak terdapat pada alias lokal.
- Struktur Vercel-native: frontend statis di `public/`, Functions di `api/`.

## Penting mengenai sumber harga

Adapter halaman publik menggunakan ekstraksi HTML secara **best effort**. Website sumber dapat mengganti struktur halaman, memblokir server cloud, meminta CAPTCHA, atau membatasi penggunaan otomatis. Untuk penggunaan komersial, prioritaskan API, affiliate feed, atau izin tertulis dari masing-masing toko.

Harga yang tampil belum tentu memasukkan biaya admin pembayaran. Selalu tampilkan peringatan agar pengguna memeriksa harga final saat checkout.

## Menjalankan secara lokal

Persyaratan: Node.js 22 atau lebih baru. Deployment Vercel dikunci ke Node.js 24 melalui `package.json`.

```bash
cp .env.example .env
npm start
```

Buka:

```text
http://localhost:3000
```

Health check:

```text
http://localhost:3000/api/health
```

Contoh pencarian:

```text
http://localhost:3000/api/search?q=MLBB
```

Tidak ada `npm install` karena project hanya menggunakan API bawaan Node.js.

## Konfigurasi `.env`

```env
STORE_TIMEOUT_MS=6500
ALLOW_DEMO_FALLBACK=true
ENABLE_PUBLIC_PAGE_ADAPTERS=true
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5-mini
PROVIDER_FEEDS_JSON=[]
```

### Mode live saja

```env
ALLOW_DEMO_FALLBACK=false
ENABLE_PUBLIC_PAGE_ADAPTERS=true
```

Bila semua toko gagal diakses, hasil akan kosong atau hanya berisi sumber live yang berhasil.

### Mode UI/demo stabil

```env
ALLOW_DEMO_FALLBACK=true
ENABLE_PUBLIC_PAGE_ADAPTERS=true
```

Toko yang gagal diakses akan digantikan oleh fallback lokal dan diberi label `Demo`, bukan `Live`.

## Feed JSON partner

Masukkan konfigurasi melalui `PROVIDER_FEEDS_JSON`:

```env
PROVIDER_FEEDS_JSON=[{"id":"partner-a","name":"Partner A","url":"https://example.com/catalog/{gameSlug}.json","purchaseBaseUrl":"https://example.com"}]
```

Format respons yang didukung:

```json
[
  {
    "name": "85 Diamonds",
    "price": 23000,
    "url": "https://example.com/mobile-legends"
  }
]
```

Atau:

```json
{
  "products": [
    {
      "productName": "77 Diamonds + 8 Bonus",
      "sellingPrice": 22500,
      "purchaseUrl": "https://example.com/mobile-legends"
    }
  ]
}
```

## Deploy ke GitHub dan Vercel

1. Upload seluruh isi folder ini ke root repository GitHub.
2. Import repository tersebut di Vercel.
3. Framework Preset: `Other`.
4. Jangan mengisi Output Directory.
5. Tambahkan Environment Variables dari `.env.example`.
6. Deploy.

Struktur root yang benar:

```text
repository/
├── api/
├── public/
├── src/
├── test/
├── package.json
├── server.js
└── vercel.json
```

URL utama akan di-rewrite ke `/index.html`, sementara API tersedia pada `/api/search` dan `/api/health`.

## Menambah game

Edit `src/config/games.js`, lalu tambahkan:

- ID game.
- Nama dan alias.
- URL produk pada setiap toko.

Tambahkan fallback katalog di `src/data/fallback-offers.js` bila mode demo diperlukan.

## Menambah parser toko

1. Buat file baru di `src/stores/`.
2. Implementasikan objek `{ id, name, fetchOffers(game, options) }`.
3. Kembalikan array penawaran mentah.
4. Daftarkan adapter di `src/stores/index.js`.

Normalisasi dan grouping akan dilakukan oleh `src/services/normalizer.js`.

## Pengujian

```bash
npm test
```

## Batasan arsitektur tanpa database/cache

- Setiap pencarian memicu request baru ke seluruh toko.
- Respons bergantung pada kecepatan dan ketersediaan sumber.
- Tidak ada histori harga atau notifikasi harga turun.
- Tidak ada fallback harga terakhir selain data demo lokal.
- Traffic tinggi dapat memicu rate limit atau pemblokiran sumber.
- Biaya AI dapat berulang bila `OPENAI_API_KEY` diaktifkan.

Project ini paling cocok untuk MVP, validasi UI, atau penggunaan dengan feed resmi yang memang mengizinkan request real-time.
