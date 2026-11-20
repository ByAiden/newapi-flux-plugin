---
changelogVersion: 1
plugin: "byaiden_flux"
version: "1.1.1"
locale: "zh-CN"
---
# Changelog

## [1.1.1]

### Fixed

- README 中 FLUX.2 模型的表达式把首个百万像素并入常数项（写成 `0.04 + u("output_megapixels") * 0.03 + ...`，不再是 `0.07 + (u("output_megapixels") - 1) * 0.03 + ...`），模型广场因此能显示成价格表；收费不变。加价说明改为直接乘价格，不再在末尾追加 `* 1.2`（模型广场无法把那种写法显示成价格表）。
