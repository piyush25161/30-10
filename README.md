# 💌 Photo Story - A Digital Love Letter

A romantic, animated, single-page website that presents 7 full-screen photos as a swipeable story, each paired with its own song and a personal message. Designed to feel like a handcrafted digital scrapbook.

---

## ✅ Quick Setup Checklist

### 1. Add your photos
Place **7 landscape photos** (`.jpg`) in the `assets/photos/` folder:
```
assets/photos/photo1.jpg
assets/photos/photo2.jpg
assets/photos/photo3.jpg
assets/photos/photo4.jpg
assets/photos/photo5.jpg
assets/photos/photo6.jpg
assets/photos/photo7.jpg
```
> **Tip:** Use landscape-oriented photos for the best look. The site will crop portrait photos to fit.

### 2. Add your songs
Place **7 songs** (`.mp3`) in the `assets/music/` folder:
```
assets/music/song1.mp3
assets/music/song2.mp3
assets/music/song3.mp3
assets/music/song4.mp3
assets/music/song5.mp3
assets/music/song6.mp3
assets/music/song7.mp3
```
> **Tip:** If you want a song to start at the chorus, set the `startAt` value in `config.js` to the second-count where the chorus begins.

### 3. Edit `js/config.js`
Open `js/config.js` and replace the placeholders:

| Field          | What to change                                                   |
|----------------|------------------------------------------------------------------|
| `herName`      | Her name (shown on the envelope)                                 |
| `myName`       | Your name (shown on the final page)                              |
| `introTitle`   | Title on the intro screen                                        |
| `closingMessage` | Your final message after all 7 photos                          |
| `songTitle`    | "Song Name - Artist" for each slide                              |
| `startAt`      | Seconds into the song to begin (e.g. `62` for 1:02)             |
| `message`      | Your 50-70 word personal message for each photo                  |
| `corner`       | Where the message card sits: `bottom-left`, `bottom-right`, `top-left`, or `top-right` |
| `accentColor`  | A soft hex colour for glows, hearts, and highlights per photo    |

### 4. Push to GitHub
```bash
git init
git add .
git commit -m "Our story 💕"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git push -u origin main
```

### 5. Enable GitHub Pages
1. Go to your repo on GitHub
2. Click **Settings** → **Pages** (left sidebar)
3. Under **Source**, select **Deploy from a branch**
4. Choose the **main** branch and **/ (root)** folder
5. Click **Save**
6. Wait 1-2 minutes, then visit `https://YOUR-USERNAME.github.io/YOUR-REPO/`

---

## 🎨 Customisation Tips

- **Accent colours**: Pick soft pastels that complement each photo. Try [coolors.co](https://coolors.co) for palette ideas.
- **Messages**: Aim for 50-70 words per photo. The text card auto-sizes, but very long messages may overflow on small screens.
- **Song start times**: Play each song in a music app, note the timestamp of your favourite part, and put that number (in seconds) as `startAt`.
- **Photo order**: Tell a story - maybe chronological, or themed (first meeting → favourite memory → future dreams).

## 🔧 Technical Notes

- **Pure static site** - HTML, CSS, vanilla JavaScript. No build step, no backend.
- **All paths are relative** - works on GitHub Pages at any repo name.
- **Graceful fallbacks** - missing photos show a soft placeholder, missing songs play silence.
- **Responsive** - optimised for landscape on phones, tablets, and laptops. Shows a "rotate your phone" prompt in portrait.
- **Respects `prefers-reduced-motion`** - heavy animations are toned down for accessibility.
- **iOS Safari compatible** - audio is unlocked on the first tap (the envelope interaction).

---

Made with ♥

