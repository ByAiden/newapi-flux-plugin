---
changelogVersion: 1
plugin: "byaiden_flux"
version: "1.1.1"
locale: "en"
translations:
  zh-CN: CHANGELOG.zh-CN.md
---
# Changelog

## [1.1.1]

### Fixed

- The README expressions for the FLUX.2 models now fold the first megapixel into the constant (`0.04 + u("output_megapixels") * 0.03 + ...` instead of `0.07 + (u("output_megapixels") - 1) * 0.03 + ...`), so the gateway's model page shows them as a price table; the charges are unchanged. The margin advice now multiplies the price instead of appending `* 1.2`, which the page cannot show as a table.
