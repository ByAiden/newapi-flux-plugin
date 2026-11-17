---
changelogVersion: 1
plugin: "byaiden_flux"
version: "1.1.0"
locale: "zh-CN"
---
# Changelog

## [1.1.0]

### Added

- 支持经由另一个 New API 网关：外层网关的 New API（类型 60）渠道可以绑定本插件，插件用网关令牌代替 `x-key`，在中间网关 `/byaiden_flux` 下的 BFL 路由提交和查询，通过中间网关签名的链接下载，并计算相同的用量，外层可以直接用同样的计费表达式。
