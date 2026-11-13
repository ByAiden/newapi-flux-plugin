---
changelogVersion: 1
plugin: "byaiden_flux"
version: "1.0.0"
locale: "zh-CN"
---
# Changelog

## [1.0.0]

### Added

- 通过 BFL API 使用 Black Forest Labs FLUX 生成和编辑图片：FLUX 3 Image 与 FLUX 3 Image Klein，FLUX.2 [max]、[pro]、[flex]、[klein]（含 preview 端点），以及 FLUX.1 Kontext [pro]、[max]、FLUX1.1 [pro]、FLUX1.1 [pro] Ultra、FLUX.1 [dev] 和 FLUX.1 Fill [pro]。
- 支持 BFL 原生路由 `POST /v1/{model}` 和 `GET /v1/get_result`，以及 `/v1/images/generations`、`/v1/images/edits` 上的 OpenAI Images API，包括 multipart 上传和 Fill 的蒙版。
- 按模型系列报告用量：所有模型报告 BFL 积分，FLUX 3 报告分辨率档位，FLUX.2 报告输出和输入百万像素，并报告图片张数。任务按 BFL 官方价预扣，按 BFL 报告的实际费用结算。
- 支持在 BFL 区域 `polling_url` 域名上轮询；下载时获取新的签名图片地址，且不发送密钥。
