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


`download-me` uses yt-dlp's native concurrent-fragment downloader by default
(`--concurrent-fragments 8`). It starts faster, reports progress more often,
and works particularly well for the DASH/HLS streams used by YouTube.

For a large direct file, opt in to aria2c's multi-connection downloader:

```bash
download-me <url> --aria2
```

aria2c can improve throughput when connection count is the bottleneck, but it
has a slower startup phase and some platforms rate-limit its parallel requests.

## Installation

### npm from GitHub

Until the package is published to the npm registry, install it directly from
GitHub:

```bash
npm install -g github:opiobonniky/download-me
download-me --version
```

On Debian or Ubuntu, install the external media tools once:

```bash
sudo apt update
sudo apt install ffmpeg aria2
```

The npm installation does not run `sudo` or modify system packages behind the
scenes. The npm dependency manages its own `yt-dlp` copy. `aria2` is optional,
but it enables accelerated downloads through its `aria2c` command.

After publishing the package with `npm publish`, the shorter registry command
will work:

```bash
npm install -g download-me
```

### From a local checkout

Running `npm install` only installs development dependencies. Use either the
installer or npm's global install command to register `download-me` on `PATH`:

```bash
git clone https://github.com/opiobonniky/download-me.git
cd download-me
bash install.sh
```

The equivalent manual commands are:

```bash
npm install
npm install -g .
npm run setup:linux
```

### Debian and Ubuntu

Build and install the local Debian package with apt so its dependencies are
resolved automatically:

```bash
npm install
npm run build:binary
bash scripts/build-deb.sh
sudo apt install ./dist/download-me_1.0.0-1_amd64.deb
```

Use `apt install ./file.deb`, including the `./`. Plain `install download-me`
is a different Linux file-copy command, while `dpkg -i` does not resolve
missing dependencies automatically.

For users to run `sudo apt install download-me` by package name, the generated
`.deb` must first be published in a signed apt repository. A GitHub Release can
host direct `.deb` downloads, but it is not itself an apt repository.

### Standalone Linux binary

The standalone build includes Node.js and supports Linux x86_64:

```bash
npm install
npm run build:binary
bash install-standalone.sh
```

## Requirements

- Node.js 18 or newer for npm installations
- `yt-dlp` available on `PATH` for standalone and Debian installations; npm
  installations receive a managed copy automatically
- `ffmpeg` for merging video and audio or producing MP3 files
- `aria2c` optional for multi-connection acceleration (`aria2` package on apt)

## Uninstalling

Use the command matching the installation method:

```bash
npm uninstall -g download-me
sudo apt remove download-me
bash uninstall.sh  # standalone installer
```

System media tools are left installed because other applications may use them.

## Known limitations

- **Video-only formats need ffmpeg.** Many high-resolution formats (1080p+ on
  YouTube, for example) ship video and audio as separate streams. This tool
  detects that automatically and merges in the best audio track for you.
- **Progress percentage isn't shown for a small number of streams** (some
  live/unknown-size streams use a yt-dlp progress format with no percentage
  at all). The download still completes correctly and displays its live speed.
- **The standalone binary is Linux x86_64 only.** The npm installation remains
  available on other platforms supported by Node.js and the external tools.

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

# Opt in to aria2c for a large direct file (slower startup)
download-me https://youtube.com/watch?v=xyz --aria2
```

A desktop notification fires automatically when a download finishes. Click it
to open the destination folder on Linux (`notify-send` + `xdg-open`) or macOS
when `terminal-notifier` is installed. macOS falls back to a non-clickable
`osascript` notification. Headless systems silently skip notifications, and
the notification listener never blocks the CLI.

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
