---
changelogVersion: 1
plugin: "byaiden_flux"
version: "1.1.0"
locale: "en"
translations:
  zh-CN: CHANGELOG.zh-CN.md
---
# Changelog

## [1.1.0]

### Added

- Works through another New API gateway: a New API (type 60) channel on an outer gateway can bind the plugin. It then submits and polls on the middle gateway's BFL routes under `/byaiden_flux` with the gateway token instead of `x-key`, downloads through the middle gateway's signed link, and computes the same usage facts, so the outer gateway prices with the same expressions.
