# Yatsan İç Lojistik Planlama

React (Next.js 16 + TypeScript) ile geliştirilmiş iç lojistik planlama sistemi.
**GitHub + Vercel + Firebase** üçlüsüyle çalışır; tüm denemeler Vercel üzerinden yapılabilir,
lokalde çalıştırmak zorunlu değildir.

## Modüller

| Modül | Açıklama |
|---|---|
| **Özet** | Günlük KPI'lar, son 7 gün grafiği, durum dağılımı, istasyon yoğunluğu |
| **Araç Talepleri** | İstasyonların araç talepleri; onay → plana alma → tamamlama akışı |
| **Rota Planlama** | Araç bazlı rota editörü: sıralı duraklar, her hat için **boş/yüklü** seçimi, talep bağlama, otomatik km hesabı, boş km oranı, yazdırılabilir görev formu |
| **Sevkiyatlar** | Dış tedarikçiden gelen / müşteriye giden yük kayıtları |
| **İstasyonlar & Mesafeler** | Merkez depo, yatak depo, sevkiyat deposu, üretim istasyonları, dış tedarikçiler; istasyonlar arası **iki yönlü mesafe matrisi (metre)** |
| **Araçlar** | Forklift / transpalet / çekici filosu yönetimi |
| **Raporlar** | Dönemsel KPI, günlük seri, araç bazlı km, CSV dışa aktarım |
| **Kullanıcılar** | Rol yönetimi: **admin / planlayici / izleyici** (ilk kayıt olan otomatik admin olur) |
| **Ayarlar** | Bağlantı durumu, ortam değişkenleri rehberi, güvenlik kuralları, demo veri yönetimi |

## Mimari

```
GitHub (kaynak kod)  →  Vercel (build + hosting)  →  Firebase (Auth + Firestore)
```

- **Veri katmanı çift modludur** (`src/lib/db.ts`):
  - Firebase ortam değişkenleri **giriliyse** → Firebase Auth + Firestore (canlı, çok kullanıcılı).
  - **Girili değilse** → otomatik **Demo modu**: veriler tarayıcıda (localStorage) tutulur, tam işlevsel.
- Firebase config **kod içinde değildir**; build zamanında `NEXT_PUBLIC_FIREBASE_*`
  ortam değişkenlerinden okunur. Anahtar rotasyonu/kurulum yalnızca Vercel panosundan yapılır.

## 1) GitHub'a Yükleme

```bash
# zip'i açtığınız klasörde
git init
git add .
git commit -m "Yatsan İç Lojistik Planlama v2 (React)"
git branch -M main
git remote add origin https://github.com/<KULLANICI_ADI>/<REPO_ADI>.git
git push -u origin main
```

> `.gitignore` hazır: `node_modules`, `.next`, `.env*` dosyaları repoya girmez.

## 2) Vercel'e Bağlama

1. [vercel.com](https://vercel.com) → **Add New → Project** → GitHub reposunu seçin.
2. Framework **Next.js** otomatik algılanır — build ayarlarına dokunmayın.
3. Önce **Environment Variables eklemeden** deploy edin: uygulama Demo modda anında çalışır.
4. Her `git push` sonrası Vercel otomatik build alır; **Preview** ve **Production** URL'lerinden
   tüm testleri yapabilirsiniz.

## 3) Firebase Kurulumu (Canlı Mod)

1. [console.firebase.google.com](https://console.firebase.google.com) → **Proje oluştur**.
2. **Authentication → Sign-in method → Email/Password → Etkinleştir**.
3. **Firestore Database → Create database** (üretim modu) → bölge seçin.
4. **Rules** sekmesine repodaki `firestore.rules` içeriğini yapıştırın → **Publish**.
5. **Project settings → Your apps → Web app (</>)** ekleyin → açılan `firebaseConfig`
   değerlerini kopyalayın.

### Ortam Değişkenleri (Vercel)

Vercel → **Project → Settings → Environment Variables** (Production + Preview + Development
ortamlarının tümünü seçin):

| Değişken | Değer (Firebase config'ten) |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | `apiKey` |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `authDomain` (ör. `yatsan-lojistik.firebaseapp.com`) |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `projectId` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `storageBucket` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `appId` |

6. Vercel'de **Deployments → en son deploy → Redeploy** (Environment Variables ilk kez
   girildiyse yeniden build gerekir).
7. Uygulama açılışında **DEMO** rozeti kaybolur; Ayarlar sayfası "Firebase yapılandırılmış" gösterir.

> İlk kayıt olan kullanıcı **otomatik yönetici** olur. Diğer kullanıcılar Kayıt Ol ile eklenir,
> rolleri Kullanıcılar sayfasından atanır.

### İsteğe bağlı: Lokal geliştirme

Lokalde çalıştırmak isterseniz proje köküne `.env.local` oluşturup aynı değişkenleri yazın:

```bash
npm install
npm run dev   # http://localhost:3000
```

## Şoför Paneli ve Araç Takip

Sabit hat araçları (hep aynı yerden yükleyip aynı yere boşaltan araçlar) için ayrı bir
mobil ekran sistemi vardır:

- **Araç Takip (masaüstü):** Operasyon → Araç Takip. Her aracın canlı durumu (Boşta / Yeni görev /
  Yolda / İstasyonda / Dolu bekliyor), şoförün bastığı pinler ve bugünün hareketleri.
  **İstasyondan Araç Çağır** düğmesi görevi **boşta olan ilk araca** otomatik düşürür.
- **Şoför Paneli (mobil):** Rolü **Şoför** olan kullanıcı giriş yaptığında doğrudan mobil panele düşer;
  masaüstü modüllerini görmez. Panelden atanan işleri görür (hangi istasyondan → hangi istasyona,
  dolu/boş) ve pin basar:
  `Çıktım` → `Vardım — Yer dolu (indirme bekliyorum)` / `Vardım — Yer boş` → `İş bitti`.
- **Kurulum sırası:** ① Araçlar sayfasından araca **Sabit Hat** tanımlayın (nereden → nereye),
  ② Kullanıcılar sayfasından **Yeni Kullanıcı** ile şoför hesabı açıp araç atayın,
  ③ şoför telefonundan siteye girip **Ana ekrana ekle** der — uygulama gibi çalışır.
- İstasyonlar arası mesafeleri **İstasyonlar & Mesafeler** sayfasından girin; şoför paneli görevde
  mesafeyi gösterir.

> **Not:** Şoför hesabı açma ve `gorevler` koleksiyonu için Ayarlar sayfasındaki **güncel Firestore
> kurallarını** Firebase Console'a yapıştırın (eski kurallarda `users.create` yönetici izni ve
> `gorevler` kuralı yoktur).

## Demo Modu

- Firebase girilmeden uygulama tam işlevsel çalışır; veriler **yalnızca o tarayıcıda** tutulur.
- Giriş ekranındaki **"Demo hesabıyla gir"** düğmesi (`demo@yatsan.local` / `demo123`).
- Ayarlar → **Demo Verisini Yükle** ile örnek veri seti (8 istasyon, 18 mesafe, 5 araç,
  14 talep, 3 rota planı, 5 sevkiyat) kurulur.
- Firebase'e geçtikten sonra **Ayarlar → Demo Verisini Firebase'e Taşı** ile tarayıcıdaki
  kayıtları Firestore'a kopyalayabilirsiniz (ID'ler korunur).

## Proje Yapısı

```
src/
  app/            # Next.js App Router (layout, ana sayfa, global stiller)
  views/          # 9 modül görünümü (dashboard, requests, routes, ...)
  components/     # Icon, grafikler, modal, toast, kabuk (sidebar/topbar)
  lib/            # firebase.ts (ortam değişkenleri), db.ts (çift mod veri katmanı),
                  # types.ts, constants.ts, format.ts, demo-data.ts, csv.ts
  hooks/          # useCollection / useCollections (canlı dinleme), useHashRoute
firestore.rules   # Firestore güvenlik kuralları
```

## Roller

| Rol | Yetki |
|---|---|
| **Yönetici (admin)** | Tüm modüller + kullanıcı ve ayar yönetimi |
| **Planlayıcı (planlayici)** | Talep, rota, sevkiyat ve tanım işlemleri |
| **İzleyici (izleyici)** | Yalnızca görüntüleme |
| **Şoför (sofor)** | Yalnızca mobil görev paneli (atanan araç, Çıktım/Vardım pinleri) |
