import youtubeDlExec from 'youtube-dl-exec';

// Packaged binaries use the system executable because child binaries cannot run
// from a pkg snapshot. Normal npm installs use youtube-dl-exec's managed copy.
export const youtubedl = process.pkg ? youtubeDlExec.create('yt-dlp') : youtubeDlExec;
