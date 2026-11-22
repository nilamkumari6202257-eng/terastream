# CineMitra / TeraStream — self-hosted (no Supabase)

TeraBox video playback ab is project ke andar hi chalta hai. Koi external Supabase / Edge Function nahi chahiye.

## Kaise kaam karta hai
```
Browser (hls.js)  ->  /api/terabox?action=resolve&url=<terabox link>
                      server/terabox.mjs: share page -> pcftoken/jsToken -> share/list -> share/streaming (HLS)
                  <-  signed RELATIVE links (?action=playlist...) - m3u8 + segments isi server se proxy hote hain
```
- `server/terabox.mjs` — resolver + HLS proxy (Node 18+, zero dependency)
- `server/index.mjs` — production server (dist/ + API)
- `vite.config.ts` — `npm run dev` mein wahi API automatically mount hoti hai

## Setup
```bash
npm install
cp .env.example .env      # phir .env mein ADMIN_PASSWORD set karein (NDUS_TOKENS optional - admin panel se bhi add ho sakte hain)
npm run dev               # development  -> http://localhost:5173
# production
npm run build && npm start   # -> http://localhost:8787
```

## Admin panel ka data ab SERVER par save hota hai
Admin panel se jo bhi karein (ndus token, videos, categories, ads, settings) wo `data/store.json` mein save hota hai,
isliye har visitor / har phone par same asar hota hai. Pehle ye sirf aapke browser ke localStorage mein tha.
- Admin password server check karta hai: `.env` mein `ADMIN_PASSWORD` set karein (default `admin` hai, badlein).
- Token pool order: admin panel ke tokens (primary pehle) -> `.env` ke `NDUS_TOKENS`. Jo token sirf 10 sec preview deta hai, server use skip karke agla try karta hai.
- **`data/` folder persistent disk par rakhein** (Render/Railway free tier par disk reset ho jata hai -> `DATA_DIR` ko persistent volume par point karein), warna redeploy par admin data chala jayega.
- Pehle se localStorage mein jo data/tokens the, wo admin login karte hi server par ek baar upload ho jate hain.
- Views / likes / comments / watchlist abhi bhi har device ka apna (local) data hain.

## Bina ndus token ke bhi chalta hai (10 sec preview)
Token order: client header -> admin panel tokens -> `.env` tokens -> **anonymous (hamesha last mein)**.
Isliye token na ho, expire ho ya galat ho - tab bhi ~10 second ka preview chalta hai, error nahi aata. Full video ke liye valid VIP ndus token chahiye.

## Video nahi chal raha? Pehle ye karein
Admin panel -> **Tokens** tab -> neeche **Video link test**: link paste karke dekhein ki kaun sa step fail ho raha hai (page tokens / share list / streaming) aur kaun sa token use hua. Aam wajah:
- Hosting provider ka IP TeraBox ne block kiya hai (steps mein "tokens NOT found" aayega) -> dusra host / VPS try karein.
- Site static hosting (GitHub Pages, plain Netlify) par hai -> `/api/terabox` hai hi nahi. Node server chahiye.
- Multiple instances chala rahe hain -> sab par same `PROXY_SECRET` set karein.

## Admin panel kahan hai?
Public site par ab kahin "Admin" link nahi dikhta. Seedha **`https://yourdomain.com/admin`** kholein (bookmark kar lein) aur `ADMIN_PASSWORD` se login karein.

## Security notes
- NDUS tokens server par rehte hain; visitors ko kabhi nahi bheje jaate. Sirf logged-in admin ko admin panel mein dikhte hain.
- Proxy URLs HMAC-signed hain: koi bhi `/api/terabox` ko open proxy ki tarah use nahi kar sakta. Stream cookie URL mein sirf **encrypted** (AES-256-GCM) form mein jati hai, server memory/session par nirbhar nahi - restart ya multi-instance par bhi links chalte hain.
- Signing secret: `PROXY_SECRET` env, warna ek baar random banakar `DATA_DIR/store.json` mein save hota hai.
- Pehle ke hardcoded tokens source se hata diye gaye hain. Agar wo kisi public jagah share hue hain to unhe rotate karein.

## Hosting
Ye ab ek Node server hai (VPS, Railway, Render, Fly.io, Docker waghera). Sirf static hosting (GitHub Pages / plain Netlify) par API nahi chalegi.
Agar frontend alag domain par hai to build time par `VITE_TERABOX_API_BASE=https://api.example.com/api/terabox` set karein.

## Monetization (Adsterra) - kaise use karein
Admin panel -> **Ads & Monetization** tab. Har slot ke saath code paste karein, **Enabled** on karein, bas. (Khali slot visitors ko kuch nahi dikhata - koi fake placeholder nahi.)

| Slot | Kahan dikhta hai | Adsterra format |
|---|---|---|
| Header Banner | har page ke upar | Banner 728x90 (phone ke liye "Mobile code" mein 320x50) |
| Above / Below Player | video player ke upar / neeche | Banner 728x90 |
| Sidebar | watch page sidebar | Banner 300x250 |
| Between Related | related / catalog videos ke beech | Native Banner |
| Native Banner | home, browse, wait page | Native Banner |
| Social Bar | poori site | Social Bar script |
| Popunder | video **Play** click par | Popunder script ya Direct Link URL |

- Banner/native ads **alag sandboxed iframe** mein, **lazy + async** load hote hain (screen ke paas aane par) - site slow nahi hoti aur ek ad dusre ko tod nahi sakta.
- Popunder: Play click par, **24 ghante mein ek baar** (localStorage cap; Settings mein hours badal sakte hain).
- **Intermediate page**: Settings -> "Intermediate page" on karein. Video kholne se pehle "Please wait N seconds..." page aata hai (ads ke saath), phir video. Har video par 30 min mein ek baar.
- Social Bar / Popunder ka code badalne ke baad visitors ko ek baar page refresh karna padta hai.

## Phone / dusre device par admin changes
- Data server par (`data/store.json`) save hota hai. Site ab khud background mein har 30 sec, tab wapas khulne par, aur network wapas aane par naya data le leti hai - refresh ki zarurat nahi.
- Naye phone par (cache khali) site 10 sec tak server ka data wait karti hai, demo videos nahi dikhati.
- Save fail ho (session expire / server band) to ab saaf red message aata hai; success par "Server par save ho gaya" dikhta hai.
- Agar phir bhi alag dikhe: (1) site Node server se chal rahi ho (static hosting par nahi), (2) `DATA_DIR` persistent disk par ho.

## Deploy (kahin bhi)
Node 18+ chahiye, runtime dependency zero. Build ke liye devDependencies chahiye - `.npmrc` mein `include=dev` already set hai.
- **Docker / VPS / Coolify / Fly.io**: `docker build -t cinemitra . && docker run -p 8787:8787 -v cinemitra-data:/data -e ADMIN_PASSWORD=xxxx cinemitra`
- **Render**: `render.yaml` (Blueprint) - disk ke liye paid plan chahiye, warna admin data redeploy par ud jata hai.
- **Railway**: `railway.json` ready; ek Volume banakar `DATA_DIR=/data` set karein.
- **Heroku-style / Procfile hosts**: `Procfile` ready.
- Healthcheck: `/api/health`. Port `PORT` env se.

## Quickstart (ye zip)
```bash
npm install        # dev/build ke liye (server ko nahi chahiye)
npm start          # dist/ pehle se built hai -> http://localhost:8787
```
`dist/` is zip mein pre-built hai, isliye `npm install && npm start` se site turant chal jayegi (build ki zarurat nahi).
Production server (server/index.mjs) zero-dependency hai — sirf Node 18+ chahiye.
