# electron-updater equality compatibility

Stable electron-updater 6 still requires the deprecated standalone
`lodash.isequal` package. This entry point delegates that existing callable API
to `lodash/isEqual` from the maintained full Lodash package. No equality logic
is copied or changed.

The root override installs the packed archive instead of a directory link so
desktop runtime staging contains real files and remains relocatable. Both
`lodash.isequal` and `lodash` must be included in packaged runtime dependencies.

Rebuild the archive from the repository root after changing this package:

```sh
npm pack ./vendor/lodash-isequal --pack-destination ./vendor
```

Remove this adapter and its override when the stable updater drops its
standalone Lodash dependency.
