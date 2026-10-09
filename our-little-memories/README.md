# OUR LITTLE MEMORIES ♡

Frontend React + Vite untuk backend Supabase yang sudah kamu siapkan (`0001_init.sql`).

## Environment Variables
Dua nilai ini ada di Supabase: Project Settings → API.
- `VITE_SUPABASE_URL` = Project URL
- `VITE_SUPABASE_ANON_KEY` = anon / publishable key (JANGAN pakai service_role)

## Deploy gratis (tanpa install apa pun di komputer)
1. Ekstrak zip ini.
2. Buat akun di github.com, klik New repository, lalu "uploading an existing file", dan seret SEMUA isi folder (termasuk folder `src`) ke sana. Klik Commit.
3. Buat akun di vercel.com (login pakai GitHub), klik Add New → Project, pilih repo tadi.
4. Di bagian Environment Variables, isi dua nilai di atas, lalu klik Deploy.
5. Buka link yang diberikan Vercel di HP kamu dan Rita, lalu login dengan akun yang sudah dibuat di Supabase.

## Jalankan di komputer (opsional)
Butuh Node.js 18+. Salin `.env.example` jadi `.env`, isi nilainya, lalu: `npm install` dan `npm run dev`.
