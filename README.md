# save — videos and MP3s from your terminal

Install once, paste a YouTube link and download. **save connects automatically**;
you do not need to enter a server address or create an account. There is no
Node.js or extra media software to install when using the standalone package.

## Install

On Ubuntu or Debian, open the .deb with your software installer, or run:

```sh
sudo apt install ./save_2.0.0-1_amd64.deb
```

If apt shows “Setting up save” followed by “Download is performed unsandboxed as
root”, the installation still succeeded. That notice can appear for an installer
in a private Downloads folder. Run `save --version` to check; no reinstall is needed.

For the Linux ZIP, extract it, open a terminal in the extracted folder and run
`./install.sh`. You can use `./save` directly from that folder without installing.
Choose one installation method, not both.

### Install with npm instead

If you already have Node.js 18 or newer and npm, install the
[npm package](https://www.npmjs.com/package/@opiobonniky/save):

```sh
npm install -g @opiobonniky/save
save --version
```

Run the same install command to update to the latest published version. npm
installation requires Node.js; the standalone ZIP and .deb do not. Choose one
installation method to avoid conflicting copies of the `save` command.

## Download a video

```sh
save "https://youtu.be/VIDEO_ID"
save "https://youtu.be/VIDEO_ID" -q 1080p
save "https://youtu.be/VIDEO_ID" ~/Videos -q 720p
```

Without a quality option, select a format from the menu. Files go to your
Downloads folder unless you choose another folder after the link. Wait for
“Saved:” and the file location, then open the video with your usual player.

## Save audio

```sh
save "https://youtu.be/VIDEO_ID" -a
save "https://youtu.be/VIDEO_ID" ~/Music -a
```

`-a` saves an MP3. Use `-q` for video or `-a` for audio, not both together.

## Download several links

Put one video link per line in urls.txt, then run:

```sh
save -b urls.txt -q 720p
```

Downloads run one at a time. Empty lines and # comments are ignored. A failed
link stops the command so you can fix it before trying again.

## Useful shortcuts

| Short | Long | Purpose |
| --- | --- | --- |
| `-q` | `--quality <quality>` | Pick 720p, 1080p or best |
| `-a` | `--audio` | Save MP3 |
| `-f` | `--format <id>` | Pick a format listed by -l |
| `-c` | `--choose` | Open the interactive menu |
| `-l` | `--list-formats` | See available formats |
| `-b` | `--batch <file>` | Download links from a text file |
| `-o` | `--overwrite` | Replace an existing file deliberately |
| `-r` | `--report-usage` | Opt into visit reporting |
| `-h` | `--help` | Show help |
| `-V` | `--version` | Show the version |

## Need a hand?

- Can’t connect? Check your connection and try again shortly. Connection settings
  are already included; you do not need to enter them.
- Quality unavailable? Run `save "<url>" -l` or choose another quality from the menu.
- File already exists? Pick another folder, or use `-o` only to replace it.
- Want to stop? Press Ctrl+C. Interrupted local transfers are cleaned up.

Public single YouTube videos are supported, up to 30 minutes and 500 MB per
finished file. Playlists, private videos and other websites are not available yet.
Some videos save as MKV to include sound. An internet connection is required to
download; saved files can be played offline. Only save content you have permission
to download.

## Privacy

The service receives your video link and chosen format to prepare your file, and
can see your request IP and app details. Optional CLI visit reporting (`-r`) is off
by default; it does not include video links, filenames, hostnames or local folders.

Maintainers: technical setup, release builds and deployment details are in
[the maintainer documentation](docs/BACKEND_CLIENT.md), not part of installation.

## Upgrading from 1.x

Version 2 is a backend-only client, not the old local downloader. During current
development it automatically connects to `http://localhost:8080/api/v1`, so the
Download Me service must run on the same device. This is not yet a public hosted
download service. Other websites, playlists and old local-engine options are not
supported. See [release notes](CHANGELOG.md) before upgrading.
