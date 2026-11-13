---
changelogVersion: 1
plugin: "byaiden_flux"
version: "1.0.0"
locale: "en"
translations:
  zh-CN: CHANGELOG.zh-CN.md
---
# Changelog

## [1.0.0]

### Added

- Image generation and editing with Black Forest Labs FLUX through the BFL API: FLUX 3 Image and FLUX 3 Image Klein, FLUX.2 [max], [pro], [flex] and [klein] (with the preview endpoints), and FLUX.1 Kontext [pro] and [max], FLUX1.1 [pro], FLUX1.1 [pro] Ultra, FLUX.1 [dev] and FLUX.1 Fill [pro].
- BFL's own routes `POST /v1/{model}` and `GET /v1/get_result`, and the OpenAI Images API at `/v1/images/generations` and `/v1/images/edits`, including multipart uploads and masks for Fill.
- Usage facts per model family: BFL credits for every model, the resolution tier on FLUX 3, output and input megapixels on FLUX.2, and the image count. Tasks reserve BFL's list price and settle on the cost BFL reports.
- Polling on BFL's regional `polling_url` hosts, and downloads that fetch a fresh signed image URL without sending the key.
