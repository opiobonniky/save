# download-me

A terminal tool for downloading videos from YouTube, TikTok, Facebook, and hundreds of
other sites, with an interactive format picker.

Built as a thin, friendly wrapper around [yt-dlp](https://github.com/yt-dlp/yt-dlp),
which does the actual site-specific extraction work.

## Features

- **Playlists.** Paste a playlist URL and choose to download the whole thing
  or pick specific videos from an interactive checklist.
- **Batch mode.** `download-me --batch urls.txt` downloads every URL in a
  text file (one per line, `#` for comments), non-interactively, with a
  pass/fail summary at the end.
- **Saved defaults.** `download-me config set outputDir ~/Videos` remembers
  a default output directory (and default subtitle language) across runs.
  `download-me config get` / `config reset` to inspect or clear.
- **Automatic retries.** Transient network failures retry automatically
  (10 attempts) instead of failing the whole download on one hiccup.
- **Resume awareness.** Partial downloads resume automatically (yt-dlp's
  own `.part`-file behavior) — now surfaced with a clear log line instead
  of happening silently.
- **`--overwrite`** forces a fresh download even if the file already exists
  (default behavior skips re-downloading and tells you it did).
- **`--subs [langs]`** downloads subtitles (default `en`; comma-separate
  for more, e.g. `--subs en,es`), converted to `.srt`.

## Testing

```bash
npm test
```

Runs the automated suite (`node --test`) covering the pure logic that
doesn't need network access: format detection/merging decisions, playlist
entry URL resolution, and batch-file parsing. A CI workflow
(`.github/workflows/ci.yml`) runs this on every push and builds release
artifacts on tagged versions.

**What automated tests intentionally don't cover:** actual extraction
against real video platforms. That requires live network access to
YouTube/TikTok/etc., which isn't something a CI-friendly unit test should
depend on — that layer is verified by actually running the tool against a
real URL (see Known limitations).


`download-me` auto-detects `aria2c` (installed automatically alongside
`yt-dlp`/`ffmpeg`) and uses it to accelerate downloads via multiple
simultaneous connections — usually the biggest speed win available, often
3-5x faster than a single-connection download on a fast link. Where
`aria2c` isn't available, it falls back to yt-dlp's own concurrent-fragment
downloading (`--concurrent-fragments 8`), which still parallelizes DASH/HLS
streams (the format most YouTube videos use).

You'll see `(accelerated via aria2c)` after a download completes when it
was used. No flags or configuration needed — this is automatic.

A couple of things worth knowing:
- Actual speed is still capped by your connection and by the source
  platform's own rate limiting — multi-connection downloading helps most
  when the bottleneck is *connection count*, not raw bandwidth.
- Some platforms may rate-limit or block multi-connection downloads more
  aggressively than single-connection ones. If a download fails right after
  switching to aria2c, that's the likely cause — the error message will
  mention this.

## Installing via package managers

### npm (publish once, install anywhere with Node.js)

The package is publish-ready: `npm pack --dry-run` shows a clean ~9KB
package (the large `dist/` binaries are intentionally excluded — they
don't belong in the npm registry).

```bash
npm login
npm publish
```

Once published, anyone can run:
```bash
npm install -g download-me
```

### apt / dpkg (Debian, Ubuntu, and derivatives)

```bash
npm run build:binary        # produces dist/download-me-linux
bash scripts/build-deb.sh   # produces dist/download-me_1.0.0-1_amd64.deb
sudo dpkg -i dist/download-me_1.0.0-1_amd64.deb
```

`ffmpeg` is declared as a hard dependency in the package, and `yt-dlp`/`aria2c`
are installed automatically via a postinst hook if missing. To distribute
this more widely (so people don't need the source), host the `.deb` in your
own apt repository, or attach it to a GitHub Release for direct download.

### Homebrew

A ready-to-use tap lives in the separate `homebrew-download-me/` folder
(see its own README for one-time setup — it needs the binary hosted on a
GitHub Release first, since Homebrew formulas reference a stable download
URL + checksum rather than bundling the binary directly). Once set up:

```bash
brew tap YOUR_USERNAME/download-me
brew install download-me
```

### Standalone binary / single-file installer

Covered above — no package manager involved at all, works even without
Node.js on the target machine.

## Requirements

- Node.js 18+
- `yt-dlp` installed and available on your `PATH`
- `ffmpeg` installed and available on your `PATH` — **required** for merging
  video-only formats with audio, and for converting `--audio` downloads to mp3
- `aria2c` (optional but recommended) — enables multi-connection accelerated
  downloads; installed automatically alongside the other dependencies

Install on Linux:

```bash
sudo apt install yt-dlp ffmpeg
# yt-dlp is often more up to date via pip:
pip install -U yt-dlp
```

## Uninstalling

```bash
bash uninstall.sh
```

Removes the `download-me` binary only. `yt-dlp`, `ffmpeg`, and `aria2c` are
left installed since other tools may depend on them — the script tells you
how to remove them too if you want.

## Known limitations

- **Playlists are not supported yet.** Passing a playlist URL shows a clear
  error instead of failing confusingly — pass a direct video URL instead.
- **Video-only formats need ffmpeg.** Many high-resolution formats (1080p+ on
  YouTube, for example) ship video and audio as separate streams. This tool
  detects that automatically and merges in the best audio track for you, but
  that merge step requires `ffmpeg` — without it, the download fails with an
  explanation pointing at ffmpeg.
- **Progress percentage isn't shown for a small number of streams** (some
  live/unknown-size streams use a yt-dlp progress format with no percentage
  at all). The download still completes correctly — the progress bar shows
  live speed with a "(size unknown)" note instead of a percentage in that case.
- **The standalone binary is Linux x86_64 only.** Running the standalone
  installer on any other OS/architecture is detected and refused with a
  clear message rather than installing a broken binary. The npm install path
  (`install.sh`) works on any platform with Node.js.

## Two ways to install

### Option 1 — Standalone binary (no Node.js required on the target machine)

This is what you want for handing the tool to someone whose machine doesn't
have Node.js installed. The Node runtime is bundled directly inside the
executable.

```bash
bash install-standalone.sh
```

That copies the prebuilt binary in `dist/download-me-linux` to `/usr/local/bin/download-me`
and auto-installs `yt-dlp`/`ffmpeg`. Nothing else is required on that machine.

If you're building it yourself (only the build machine needs Node.js):
```bash
npm install
npm run build:binary   # produces dist/download-me-linux (~60MB, self-contained)
```

### Option 2 — Via npm (for machines that already have Node.js)

```bash
bash install.sh
```

This installs `download-me` globally through npm, which also handles `PATH`
setup and triggers the same automatic `yt-dlp`/`ffmpeg` install.

Both options end with the exact same result: `download-me` runnable from
anywhere in the terminal, with `yt-dlp` and `ffmpeg` installed automatically.

**Note on distributing `install-download-me.sh`:** it must be downloaded and
run as a saved file (`bash install-download-me.sh`), not piped directly
through curl (`curl ... | bash`) — it reads its own embedded binary from its
file path, which doesn't exist when streamed through a pipe. If you host it
somewhere and want a true one-liner, download it to a temp file first:
```bash
curl -sSL <your-url> -o /tmp/install-download-me.sh && bash /tmp/install-download-me.sh
```

**Safety checks all three install paths now perform:**
- Detects whether `sudo` is available and skips it automatically if already running as root (rather than crashing when `sudo` isn't installed, e.g. inside containers)
- Refuses to install on anything other than Linux x86_64, with a clear message, instead of silently installing a broken binary
- Verifies the extracted/copied binary is a reasonable size and actually runs `--version` successfully before installing it system-wide

## Usage

```bash
# Zero-decision default: best quality, no prompts, no menu — paste and go
download-me https://youtube.com/watch?v=xyz

# Want control over the exact format instead? Opt in explicitly:
download-me https://youtube.com/watch?v=xyz --choose

# Save to a specific directory (trailing argument)
download-me https://youtube.com/watch?v=xyz ~/Videos

# Skip straight to a known format id (no picker)
download-me https://youtube.com/watch?v=xyz -f 137

# Audio only (best available audio track, converted to mp3)
download-me https://youtube.com/watch?v=xyz --audio

# Subtitles alongside the video
download-me https://youtube.com/watch?v=xyz --subs en,es

# Just list formats without downloading
download-me https://youtube.com/watch?v=xyz --list-formats

# Playlist — prompts to download all or pick specific videos
download-me https://youtube.com/playlist?list=xyz

# Batch mode — every URL in a text file, non-interactive
download-me --batch urls.txt ~/Videos

# Force a fresh download even if the file already exists
download-me https://youtube.com/watch?v=xyz --overwrite
```

A desktop notification fires automatically when a download finishes (Linux
via `notify-send`, macOS via `osascript`) — paste a link, tab away, and get
pinged instead of watching the terminal. Silently does nothing on systems
without a notifier (e.g. headless servers) — it never blocks or affects the
actual download.

## Project structure

```
download-me/
├── bin/
│   └── download-me.js      # CLI entry point (argument parsing, orchestration)
├── src/
│   ├── extract.js           # fetches available formats for a URL via yt-dlp
│   ├── prompt.js              # interactive format picker (inquirer)
│   ├── download.js             # runs the download, renders progress bar
│   ├── formatUtils.js           # shared format display/merge-detection helpers
│   └── checkDeps.js               # runtime safety-net dependency check
├── scripts/
│   └── install-deps.sh       # auto-installs yt-dlp/ffmpeg (used by both install paths)
├── dist/
│   └── download-me-linux      # prebuilt standalone binary (after npm run build:binary)
├── install.sh                  # installs via npm (machine already has Node.js)
├── install-standalone.sh         # installs the bundled binary (no Node.js needed)
├── package.json
└── README.md
```

## How it works

1. `extract.js` calls yt-dlp to fetch metadata + all available formats for the URL,
   without downloading anything.
2. If `--list-formats` was passed, the formats are printed and the tool exits.
3. Otherwise, `prompt.js` shows an interactive list so you can pick a format
   (unless `-f <formatId>` or `--audio` was passed, which skips the picker).
4. `download.js` runs the actual download via yt-dlp, parsing its progress output
   into a live terminal progress bar, and saves the file into the resolved output
   directory (current directory by default, or the trailing path argument).

## Ideas for extending this

- **Batch mode**: accept a `.txt` file of URLs and loop through downloads
- **Playlist support**: detect `isPlaylist` (already returned by `extractFormats`)
  and prompt "download all vs pick one"
- **Persistent config**: use a package like `conf` to remember a preferred default
  output directory or format across runs
- **Auto-update yt-dlp**: since sites change often, periodically run `yt-dlp -U`
  so extraction keeps working

## A note on responsible use

Downloading from some platforms may conflict with their Terms of Service depending
on how you use the content (personal archiving vs. redistribution). Use responsibly
and respect each platform's terms.
