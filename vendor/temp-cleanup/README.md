# Tracked temporary-file cleanup

electron-builder 26 installs electron-winstaller through its Squirrel peer.
electron-winstaller still uses `temp` 0.9.4, whose only rimraf calls remove
tracked, generated literal paths. Its synchronous and callback calls pass
`{ maxBusyTries: 6 }`.

The root override replaces rimraf **only inside temp** with this adapter to
Node's `fs.rm` and `fs.rmSync`, preserving recursive removal, missing-path
handling, callbacks and retries. It is not a general replacement for rimraf's
old glob API. This removes the retired rimraf/glob/inflight dependency chain
without disabling the installer dependency.

The packed archive avoids filesystem links in clean installs. Rebuild it from
the repository root with:

```sh
npm pack ./vendor/temp-cleanup --pack-destination ./vendor
```

Remove this adapter and its override when the stable installer drops temp or
temp replaces its legacy rimraf calls.
