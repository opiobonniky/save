# save

A terminal tool for downloading videos from YouTube, TikTok, Facebook, and hundreds of
other sites, with an interactive format picker.

Built as a thin, friendly wrapper around [yt-dlp](https://github.com/yt-dlp/yt-dlp),
which does the actual site-specific extraction work.

## Features

- **Playlists.** Paste a playlist URL and choose to download the whole thing
  or pick specific videos from an interactive checklist.
- **Batch mode.** `save --batch urls.txt` downloads every URL in a
  text file (one per line, `#` for comments), with bounded `--jobs` concurrency.
- **Interactive by default.** Single-video links open the format picker unless
  `--quality`, `--format`, or `--audio` selects a non-interactive mode.
- **Quality presets.** Skip the picker with a preset from 360p through 2160p,
  or use unlimited `best` through `--quality`.
- **Friendly format picker.** Formats are labeled as 360p, 720p, 1080p, etc.;
  YouTube storyboard thumbnails are excluded from downloadable choices.
- **Saved defaults.** `save config set outputDir ~/Videos` remembers
  a default output directory (and default subtitle language) across runs.
  `save config get` / `config reset` to inspect or clear.
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
index resolution, quality presets, URL classification, and batch parsing. A CI workflow
(`.github/workflows/ci.yml`) runs this on every push and builds release
artifacts on tagged versions.

**What automated tests intentionally don't cover:** actual extraction
against real video platforms. That requires live network access to
YouTube/TikTok/etc., which isn't something a CI-friendly unit test should
depend on — that layer is verified by actually running the tool against a
real URL (see Known limitations).


`save` uses yt-dlp's native concurrent-fragment downloader by default
(`--concurrent-fragments 4`, configurable with `--connections`). It starts faster, reports progress more often,
and works particularly well for the DASH/HLS streams used by YouTube.

For a large direct file, opt in to aria2c's multi-connection downloader:

```bash
save <url> --aria2
```

aria2c can improve throughput when connection count is the bottleneck, but it
has a slower startup phase and some platforms rate-limit its parallel requests.
The CLI uses the same moderate connection count for aria2 rather than forcing 16.

## Installation

### Dependency-free application

Download the archive for your computer from the
[latest release](https://github.com/opiobonniky/save/releases/latest):

| System | Archive |
| --- | --- |
| Linux x64 | `save-<version>-linux-x64.zip` |
| Windows x64 | `save-<version>-windows-x64.zip` |
| macOS Intel | `save-<version>-macos-x64.zip` |
| macOS Apple silicon | `save-<version>-macos-arm64.zip` |

The archive contains the app runtime, standalone yt-dlp, ffmpeg, ffprobe, and
Deno. It does not need Node.js, Python, npm, yt-dlp, ffmpeg, Deno, sudo, or a
system package manager. Keep the `libexec` directory beside the main
executable; the application resolves its private tools from there.

On Linux or macOS, extract and run it in place:

```bash
unzip save-<version>-<platform>-<arch>.zip
cd save-<version>-<platform>-<arch>
./save doctor
./save <url>
```

The extracted archive also includes an optional `install.sh`, which copies the
whole self-contained application under `/usr/local` and adds the `save`
command to `PATH`.

On Windows, extract the ZIP and run these commands in PowerShell:

```powershell
.\save.cmd doctor
.\save.cmd <url>
```

Windows SmartScreen and macOS Gatekeeper may warn because release files are not
yet signed with paid platform certificates. Release dependencies are verified
during the build, and macOS executables receive an ad-hoc signature.

### npm alternative

```bash
npm install -g @opiobonniky/save
save --version
```

The npm package installs only the `save` command.

The npm installation does not run `sudo` or modify system packages behind the
scenes. On first use, the CLI downloads standalone yt-dlp and ffmpeg binaries,
verifies their pinned SHA-256 checksums, and stores them in the user's cache.
No dependency install scripts or Python are required. Full YouTube support
still needs Deno 2.3+ or Node.js 22+; use the dependency-free archive to receive
Deno too. `aria2` remains optional.

### From a local checkout

Running `npm install` only installs development dependencies. Use either the
installer or npm's global install command to register `save` on `PATH`:

```bash
git clone https://github.com/opiobonniky/save.git
cd save
bash install.sh
```

The equivalent manual commands are:

```bash
npm install
npm install -g .
```

If npm reports `EEXIST` for `save`, remove the package that currently owns that
command before installing. Do not use `npm install --force`; it can overwrite
an unrelated executable.

### Debian and Ubuntu

Build and install the local Debian package with apt so its dependencies are
resolved automatically:

```bash
npm install
npm run build:binary
bash scripts/build-deb.sh
sudo apt install ./dist/save_1.1.7-1_amd64.deb
```

Use `apt install ./file.deb`, including the `./`. Plain `install save` is a
different Linux file-copy command, while `dpkg -i` does not resolve missing
dependencies automatically.

For users to run `sudo apt install save` by package name, the generated
`.deb` must first be published in a signed apt repository. A GitHub Release can
host direct `.deb` downloads, but it is not itself an apt repository.

### Build a dependency-free archive

Run this on the target operating system and architecture:

```bash
npm install
npm run build:standalone
```

The builder downloads pinned yt-dlp and Deno releases, verifies their published
SHA-256 checksums, copies native ffmpeg/ffprobe builds, tests the finished app
with a restricted `PATH`, and writes the release archive under `dist/`.

## Requirements

- Dependency-free archives: no separately installed software
- npm installations: Node.js 18+; yt-dlp is prepared automatically on first use
- Debian package: system `yt-dlp` and ffmpeg packages
- npm/ Debian: Deno 2.3+ or Node.js 22+ for full YouTube JavaScript challenge support
- `aria2c` optional for multi-connection acceleration (`aria2` package on apt)

Check the installed runtime at any time:

```bash
save doctor
```

## Uninstalling

Use the command matching the installation method:

```bash
npm uninstall -g @opiobonniky/save
sudo apt remove save
bash uninstall.sh  # standalone installer
```

System media tools are left installed because other applications may use them.

## Known limitations

- **TikTok photo carousels are not video streams.** TikTok short links and
  `/photo/` routes are normalized so yt-dlp can inspect them, but yt-dlp may
  expose only the post's audio track rather than the carousel images.
- **Video-only formats use ffmpeg.** Many high-resolution formats (1080p+ on
  YouTube, for example) ship video and audio as separate streams. This tool
  detects that automatically and merges in the best audio track for you. npm
  installations and dependency-free archives include ffmpeg; Debian uses the
  system package.
- **Progress percentage isn't shown for a small number of streams** (some
  live/unknown-size streams use a yt-dlp progress format with no percentage
  at all). The download still completes correctly and displays its live speed.
- **Linux archives require a reasonably current x64 glibc system.** They do not
  require application packages, but the packaged runtime still relies on the
  operating system's standard C runtime and kernel interfaces.

## Usage

Quote URLs in the terminal. This is required for URLs containing characters
such as `?` or `&`, which shells such as zsh otherwise interpret themselves.
An unquoted `&` makes Bash run the downloader in the background, producing a
`[1] <pid>` message and treating anything after it as a separate command.

```bash
# Open the interactive format picker
save "https://youtube.com/watch?v=xyz"

# Select a quality preset, including unlimited best quality
save "https://youtube.com/watch?v=xyz" --quality 720p
save "https://youtube.com/watch?v=xyz" --quality best

# Explicitly request the picker (equivalent to the default):
save "https://youtube.com/watch?v=xyz" --choose

# Save to a specific directory (trailing argument)
save "https://youtube.com/watch?v=xyz" ~/Videos

# Skip straight to a known format id (no picker)
save "https://youtube.com/watch?v=xyz" -f 137

# Audio only (best available audio track, converted to mp3)
save "https://youtube.com/watch?v=xyz" --audio

# Subtitles alongside the video
save "https://youtube.com/watch?v=xyz" --subs en,es

# Just list formats without downloading
save "https://youtube.com/watch?v=xyz" --list-formats

# Playlist — prompts to download all or pick specific videos
save "https://youtube.com/playlist?list=xyz"

# Batch mode with two simultaneous downloads
save --batch urls.txt ~/Videos --jobs 2

# Force a fresh download even if the file already exists
save "https://youtube.com/watch?v=xyz" --overwrite

# Opt in to aria2c for a large direct file (slower startup)
save "https://youtube.com/watch?v=xyz" --aria2 --connections 4

# Print startup, transfer, processing, and total timings
save "https://youtube.com/watch?v=xyz" --timing

# Route requests through a local HTTP or SOCKS proxy
save "https://example.com/video" --proxy "socks5://127.0.0.1:1080"

# Save performance defaults
save config set quality 720p
save config set connections 4
```

If a site is blocked by the local network, connect a system-wide VPN before
running the command. Alternatively, pass an HTTP(S) or SOCKS proxy with
`--proxy`. Avoid putting proxy passwords directly in commands because they may
be retained in shell history.

A desktop notification fires automatically when a download finishes. Click it
to open the destination folder on Linux (`notify-send` + `xdg-open`) or macOS
when `terminal-notifier` is installed. macOS falls back to a non-clickable
`osascript` notification. Headless systems silently skip notifications, and
the notification listener never blocks the CLI.

## Project structure

```
save/
├── bin/
│   └── save.js             # CLI entry point (argument parsing, orchestration)
├── src/
│   ├── extract.js           # fetches available formats for a URL via yt-dlp
│   ├── prompt.js              # interactive format picker (inquirer)
│   ├── download.js             # runs the download, renders progress bar
│   ├── formatUtils.js           # shared format display/merge-detection helpers
│   └── checkDeps.js               # runtime safety-net dependency check
├── scripts/
│   └── install-deps.sh       # auto-installs yt-dlp/ffmpeg (used by both install paths)
├── dist/
│   └── save-linux          # prebuilt standalone binary (after npm run build:binary)
├── install.sh                  # installs via npm (machine already has Node.js)
├── install-standalone.sh         # installs the bundled binary (no Node.js needed)
├── package.json
└── README.md
```

## How it works

1. Ordinary single-video downloads use `extract.js` to populate the format picker.
2. Explicit `--quality`, `--format`, and `--audio` selections avoid prompting;
   playlists use flat metadata and selected playlist indices.
3. `prompt.js` shows the format or playlist picker only when interaction is needed.
4. `download.js` runs the download, parsing its progress output
   into a live terminal progress bar, and saves the file into the resolved output
   directory (current directory by default, or the trailing path argument).

## A note on responsible use

Downloading from some platforms may conflict with their Terms of Service depending
on how you use the content (personal archiving vs. redistribution). Use responsibly
and respect each platform's terms.
