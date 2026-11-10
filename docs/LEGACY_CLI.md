# Legacy local-engine CLI (historical reference only)

These commands describe the former local yt-dlp engine, not the current backend-only CLI.
See [the current README](../README.md) for supported commands.

A terminal tool for downloading videos from YouTube, TikTok, Facebook, and hundreds of
other sites, with an interactive format picker.

Built as a thin, friendly wrapper around [yt-dlp](https://github.com/yt-dlp/yt-dlp),
which does the actual site-specific extraction work.

## Optional usage reporting

Reporting is off by default. To report one invocation to your Download Me backend:

```bash
save "https://youtu.be/VIDEO_ID" --report-usage http://localhost:8080/api/v1
```

This sends a `CLI` usage visit and a User-Agent containing the CLI version, OS,
architecture and Node version. The server stores the request IP. No media URL,
filename, local path or hostname is sent. Each invocation uses a fresh anonymous
session, not a persistent device identifier. HTTPS is required except for localhost.
Reporting errors never prevent downloads. This does not report successful downloads
or increment download-completion totals.

## Features

- **Playlists.** Paste a playlist URL and choose to download the whole thing
  or pick specific videos from an interactive checklist.
- **Batch mode.** `save --batch urls.txt` downloads every URL in a
  text file (one per line, `#` for comments; blank lines are skipped), with
  bounded `--jobs` concurrency.
  Because URLs come from a file, the shell never parses them — a reliable
  workaround when unquoted URLs with `&` keep getting split (see the
  "Unquoted URLs" section under Usage).
- **Interactive by default.** Single-video links open the format picker unless
  `--quality`, `--format`, or `--audio` selects a non-interactive mode.
- **Quality presets.** Skip the picker with a preset from 360p through 2160p,
  or use unlimited `best` through `--quality`. On sites that only offer
  combined video+audio streams (e.g. TikTok), a preset automatically falls
  back to the best available format.
- **Friendly format picker.** A simple menu shows one row per quality — `720p |
  mp4 | 5.8MB`, `576p | mp4 | 4.9MB` — with a **Best quality (recommended)**
  option on top and an **Audio only (MP3)** conversion at the bottom. Cryptic
  format IDs are hidden (duplicate TikTok/YouTube variants are collapsed); power
  users can still see every ID with `--list-formats`. YouTube storyboard
  thumbnails are excluded from downloadable choices.
- **Saved defaults.** `save config set outputDir ~/Videos` remembers
  a default output directory (and default subtitle language) across runs.
  `save config get` / `config reset` to inspect or clear.
  Without an explicit directory, downloads go to your **Downloads folder**
  (`~/Downloads`, or `XDG_DOWNLOAD_DIR` when configured).
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
| Debian/Ubuntu x64 | `save_<version>-1_amd64.deb` |
| Windows x64 | `save-<version>-windows-x64.zip` |
| macOS Intel | `save-<version>-macos-x64.zip` or `.pkg` |
| macOS Apple silicon | `save-<version>-macos-arm64.zip` or `.pkg` |

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
command to `PATH`:

```bash
bash install.sh
```

Do not prefix the whole command with `sudo`; the installer requests privileges
only when needed. This also lets it replace an older npm/NVM `save` link that
would otherwise appear earlier in your user `PATH`.

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

Running `npm install` installs the package's dependencies but does not put
the `save` command on `PATH`. Use either the installer or npm's global
install command to register it:

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

Build and install the self-contained Debian package with apt:

```bash
npm install
npm run build:standalone
bash scripts/build-deb.sh
sudo apt install ./dist/save_<version>-1_amd64.deb
```

The `.deb` is the same dependency-free application as the standalone archive: it
bundles the app runtime plus its own yt-dlp, ffmpeg, ffprobe, and Deno binaries,
so no media tools (or Node.js, Python, etc.) need to be installed on the target
system. Only `aria2c` remains an optional recommendation for multi-connection
acceleration.

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
- Debian package: self-contained, same bundled tools as the dependency-free archive
- npm installation: Deno 2.3+ or Node.js 22+ for full YouTube JavaScript challenge support
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

- **TikTok bot detection.** TikTok periodically serves an anti-bot challenge
  instead of the video page, which yt-dlp reports as *"Unexpected response from
  webpage request"* or *"Unable to extract universal data for rehydration"*.
  `save` sends a current Chrome User-Agent by default (the widely-confirmed
  workaround; override with `--user-agent`) and retries the challenge
  automatically with backoff (up to 5 attempts), but failures can still be
  intermittent — retry, use a different network or `--proxy`, and consider
  browser cookies if it persists.
- **Bot/WAF-protected sites (e.g. IMDb, some news sites).** Some sites sit behind
  a web-application firewall that serves a challenge instead of the video page,
  so yt-dlp fails with *"Unable to extract ... data"*. Open the page in your
  browser first (it solves the challenge and saves a token cookie), then pass it
  through with `save <url> --cookies-from-browser <browser>`.
- **TikTok photo carousels are not video streams.** TikTok short links and
  `/photo/` routes are normalized so yt-dlp can inspect them, but yt-dlp may
  expose only the post's audio track rather than the carousel images.
- **Video-only formats use ffmpeg.** Many high-resolution formats (1080p+ on
  YouTube, for example) ship video and audio as separate streams. This tool
  detects that automatically and merges in the best audio track for you.
  Dependency-free archives, the Debian package, and npm installations all
  include ffmpeg.
- **Progress percentage isn't shown for a small number of streams** (some
  live/unknown-size streams use a yt-dlp progress format with no percentage
  at all). The download still completes correctly and displays its live speed.
- **Linux archives require a reasonably current x64 glibc system.** They do not
  require application packages, but the packaged runtime still relies on the
  operating system's standard C runtime and kernel interfaces.

## Usage

Quote URLs in the terminal. This is required for URLs containing characters
such as `?` or `&`, which shells such as zsh otherwise interpret themselves.

### Unquoted URLs: the `[1] <pid>` message

Forgetting the quotes on a URL that contains `&` splits the command at the
shell level, before `save` ever starts:

- The `&` tells the shell to run the command in the background — that's the
  `[1] <pid>` message (job number and process id).
- Everything after the `&` is treated as a separate command, which usually
  fails with `command not found`.

`save` cannot recover the part the shell cut off — it never receives it. It
does, however, detect what happened and reacts:

1. **Aborts when it would have prompted.** A backgrounded run has no usable
   interactive terminal, so when the command would have shown the format or
   playlist picker, `save` stops by default and prints a ready-to-paste
   command with the URL it received quoted. It detects the split either from
   the redirected stdin (scripts, cron, CI) or from the process group when an
   interactive shell backgrounds the job. A deliberate `save <url> &` is
   indistinguishable from an accidental split and is treated the same way —
   use `--continue-background` or an explicit selection to background on
   purpose. Pass `--continue-background` to download anyway (best quality, no
   picker, and playlists download in full without prompting). Commands with an
   explicit selection (`--quality`, `--format`, `--audio`) don't need a picker
   and continue after the warning.

   Note: Windows (`cmd`/PowerShell) truncates at an unquoted `&` without any
   of these signals, so quoting is essential there.
2. **Strips tracking parameters** on sites where the media ID lives in the URL
   path — TikTok, YouTube Shorts, Instagram reels/posts, and X/Twitter
   statuses — so even a split URL still points at the right video.
3. **Warns** when the URL it did receive looks cut off (a trailing `?`, `&`,
   or empty `key=`).

On your side, the reliable fixes are:

```bash
# Quote the whole URL (double or single quotes)
save "https://www.tiktok.com/@user/video/123?is_from_webapp=1&sender_device=pc"

# On TikTok, Shorts, Reels, and X the video ID is in the path, so the tracking
# query string is optional — and without it, no quoting is needed:
save https://www.tiktok.com/@user/video/123

# Batch mode: URLs live in a text file (one per line, # for comments), so the
# shell never parses them — no quoting needed at all:
save --batch urls.txt

# zsh: make quoting unnecessary with an alias (bash has no equivalent)
alias save='noglob save'
```

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

# Send a different browser User-Agent (a current Chrome UA is sent by default)
save "https://example.com/video" --user-agent "Mozilla/5.0 ..."

# Pass your browser's cookies for sites behind login or bot/WAF challenges
# (first open the page in that browser so it has the right cookies)
save "https://www.imdb.com/video/vi..." --cookies-from-browser chrome

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

### Batch files

`--batch` reads URLs from a plain text file — one URL per line. Blank lines
and lines starting with `#` are ignored, surrounding whitespace is trimmed,
and URLs are never parsed by the shell, so no quoting is needed even when
they contain `&` or `?`.

Example `urls.txt`:

```
# One URL per line; # starts a comment
https://www.tiktok.com/@user/video/123?is_from_webapp=1&sender_device=pc
https://youtube.com/shorts/abc123?si=tracking

# Blank lines are fine too; playlists and mixed sites work
https://www.instagram.com/reel/AbCdEf/
https://youtube.com/playlist?list=PLxyz
```

Download them all, optionally with `--jobs` concurrency:

```bash
save --batch urls.txt ~/Videos --jobs 2
```

## Project structure

```
save/
├── bin/
│   └── save.js                  # CLI entry point: arg parsing, orchestration, config/doctor subcommands
├── src/                         # core modules (ES modules)
│   ├── options.js               # flag validation, quality presets, URL classification
│   ├── extract.js               # fetches available formats for a URL via yt-dlp
│   ├── formatUtils.js           # format display/merge-detection helpers, picker choices
│   ├── prompt.js                # interactive format picker (inquirer)
│   ├── download.js              # runs the download, renders progress bar
│   ├── progress.js              # parses yt-dlp/aria2c progress output
│   ├── batch.js                 # batch-file parsing and bounded worker pool
│   ├── config.js                # saved defaults (outputDir, quality, connections, subLangs)
│   ├── notify.js                # desktop notification when a download finishes
│   ├── ytdlp.js                 # low-level exec/spawn of yt-dlp
│   ├── ffmpeg.js                # resolves the ffmpeg/ffprobe location
│   ├── executables.js           # finds bundled/managed/system tool binaries
│   ├── managedYtDlp.js          # downloads & checksums a cached yt-dlp binary
│   ├── managedFfmpeg.js         # downloads & checksums a cached ffmpeg binary
│   ├── runtime.js               # JS-runtime detection, default Chrome user-agent
│   ├── checkDeps.js             # runtime safety-net dependency check
│   ├── toolVersions.js          # pinned yt-dlp/ffmpeg/Deno versions
│   ├── standaloneChecksum.js    # release-checksum parsing used by the standalone builder
│   └── version.js               # CLI version (kept in sync with package.json)
├── scripts/
│   ├── build-standalone.mjs     # builds the dependency-free archive (pkg + bundled tools)
│   ├── build-deb.sh             # builds the self-contained .deb from the archive
│   └── install-deps.sh          # optional Linux system dependency setup
├── test/                        # node --test unit tests for the pure-logic modules
├── packaging/
│   └── deb/                     # Debian package metadata consumed by scripts/build-deb.sh
├── dist/                        # build output (generated, not committed)
│   ├── save-<version>-linux-x64/    # dependency-free app: save + libexec/{yt-dlp,ffmpeg,ffprobe,deno}
│   └── save_<version>-1_amd64.deb  # self-contained Debian package (after npm run build:standalone + build-deb.sh)
├── .github/workflows/ci.yml     # runs tests on push, builds release artifacts on tags
├── install.sh                   # installs via npm (machine already has Node.js)
├── install-standalone.sh        # installs the bundled binary (no Node.js needed)
├── uninstall.sh                 # removes the standalone installation
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
   directory (your Downloads folder by default, or the trailing path argument).

## A note on responsible use

Downloading from some platforms may conflict with their Terms of Service depending
on how you use the content (personal archiving vs. redistribution). Use responsibly
and respect each platform's terms.
