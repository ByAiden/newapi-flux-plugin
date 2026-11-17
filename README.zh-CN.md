---
locale: zh-CN
---
# FLUX

[English](README.md) | **简体中文**

通过 [BFL API](https://docs.bfl.ai/) 调用 Black Forest Labs 的 FLUX 模型生成和编辑图片：FLUX 3 Image 与 FLUX 3 Image Klein，FLUX.2 [max]、[pro]、[flex]、[klein]，以及 FLUX.1 系列的 Kontext、FLUX1.1 [pro]、FLUX1.1 [pro] Ultra、FLUX.1 [dev] 和 FLUX.1 Fill [pro]。

## 渠道设置

- 安装插件后，新建“任务插件”类型的渠道，并绑定 `byaiden_flux`。
- 密钥填 [BFL 控制台](https://dashboard.bfl.ai/) 创建的 BFL API Key，插件用 BFL 的 `x-key` 请求头发送。同一个 Key 可调用全部模型。
- API 地址留空即使用 BFL 全球入口 `https://api.bfl.ai`。需要固定区域时填 `https://api.eu.bfl.ai` 或 `https://api.us.bfl.ai`；也可以填转发 BFL 路径的代理地址。末尾不要带 `/v1`。
- 渠道模型里加入要提供的模型。也可以通过模型映射用其他名字对外提供。

BFL 返回的 `polling_url` 位于 `api.us1.bfl.ai` 这类区域域名上。渠道使用 BFL 地址且该域名在插件列出的范围内（`api.bfl.ai`、`api.us.bfl.ai`、`api.eu.bfl.ai`、`api.us1.bfl.ai`、`api.us2.bfl.ai`、`api.eu1.bfl.ai`、`api.eu2.bfl.ai`）时，插件直接轮询它；其他域名一律改为在渠道地址上调用 `GET /v1/get_result?id=`，密钥不会发往未列出的域名。使用代理地址的渠道始终经代理轮询。

## 模型与接口

| 模型 | 计价方式 | 编辑 |
| --- | --- | --- |
| `flux-3-image` | 按分辨率档位按张计费 | 最多 10 张参考图 |
| `flux-3-image-klein` | 按分辨率档位按张计费 | 最多 10 张参考图 |
| `flux-2-max`、`flux-2-pro`、`flux-2-pro-preview`、`flux-2-flex` | 按输出和输入的百万像素计费 | 最多 8 张参考图 |
| `flux-2-klein-4b`、`flux-2-klein-9b`、`flux-2-klein-9b-preview` | 按输出和输入的百万像素计费 | 最多 4 张参考图 |
| `flux-kontext-pro`、`flux-kontext-max` | 按张计费 | 最多 4 张参考图 |
| `flux-pro-1.1`、`flux-pro-1.1-ultra`、`flux-dev` | 按张计费 | 一张图片提示（重绘变体） |
| `flux-pro-1.0-fill` | 按张计费 | 一张图片和可选蒙版（局部重绘） |

| 接口 | 用途 |
| --- | --- |
| `POST /v1/{model}`，例如 `POST /v1/flux-2-pro` | 该模型的 BFL 原生请求体。返回 BFL 的 `{id, polling_url}`，其中 id 为网关任务 id |
| `GET /v1/get_result?id={id}` | BFL 的结果对象。图片完成后，`result.sample` 是网关的下载地址 |
| `POST /v1/images/generations` | OpenAI Images API：`prompt`、`size`、`n`（1）、`output_format`、`user`，以及 BFL 自有字段，如 `aspect_ratio`、`resolution`、`seed`、`safety_tolerance`、`steps`、`guidance`、`prompt_upsampling`、`grounding`、`raw` |
| `POST /v1/images/edits` | OpenAI 图片编辑，支持 JSON 和 multipart。图片按顺序作为参考图，被编辑的图片放第一张；`flux-pro-1.0-fill` 另外接受 `mask` |

BFL 路径也可以加插件前缀访问，例如 `/byaiden_flux/v1/flux-2-pro` 和 `/byaiden_flux/v1/get_result`。OpenAI Images 接口会等待图片完成，返回 BFL 的签名图片地址；请求设置 `response_format: "b64_json"` 时返回 base64 数据。

`size` 的处理方式：FLUX 3 和 FLUX.2 转为 `width` 和 `height`；Kontext 和 Ultra 转为宽高比；FLUX1.1 [pro] 和 FLUX.1 [dev] 等比缩放到每边 256 至 1440 像素且为 32 的倍数；Fill 保持输入图片尺寸，不接受 `size`。

## 计费

每个模型的价格表都有积分字段“BFL 积分单价”。1 BFL 积分等于 0.01 美元。网关按 BFL 公布的价目表预扣积分，任务完成后按 BFL 报告的实际费用结算，因此一个表达式即可按官方价覆盖全部模型：

```text
tier("base", u("credits") * 0.01)
```

如需加价转售，再乘以倍率，例如 `* 1.2`。额度（quota）等于美元金额乘以 500000。

其他字段描述图片本身，可用于不依赖积分的定价：

- FLUX 3 模型报告 `resolution`（`768sq`、`1k`、`1.5k`、`2k`、`4k`）和 `image_count`。未指定尺寸的请求会显式发送 `resolution: "1k"`，即 BFL 默认计费的尺寸。精确的 `width` x `height` 或 `match_input` 按像素数不小于它的最小档位计费；在 BFL 报告实际尺寸前，`match_input` 按 `2k` 预扣，未指定尺寸的 Klein 编辑按 `4k` 预扣。
- FLUX.2 模型报告 `output_megapixels` 和 `input_megapixels`，与 BFL 计费一致，按每张图片向上取整到整数百万像素。输出最多计 4 MP。只有一张参考图时最多计 4 MP，多张参考图时每张计 1 MP。未指定尺寸的文生图按 1024x1024 发送。未指定尺寸的编辑保持输入尺寸，先按 4 MP 输出和 4 MP 输入预扣，再按 BFL 提交回复中的实际百万像素结算。
- FLUX.1 模型报告 `image_count`，固定为 1。

按 BFL 官方价的推荐表达式（每个模型一条，按需再乘倍率）：

| 模型 | 表达式 |
| --- | --- |
| `flux-3-image` | `u("resolution") == "768sq" ? tier("768sq", u("image_count") * 0.041) : u("resolution") == "1k" ? tier("1k", u("image_count") * 0.048) : u("resolution") == "1.5k" ? tier("1.5k", u("image_count") * 0.07) : u("resolution") == "2k" ? tier("2k", u("image_count") * 0.1) : tier("4k", u("image_count") * 0.607)` |
| `flux-3-image-klein` | `u("resolution") == "768sq" ? tier("768sq", u("image_count") * 0.008) : u("resolution") == "1k" ? tier("1k", u("image_count") * 0.009) : u("resolution") == "1.5k" ? tier("1.5k", u("image_count") * 0.011) : u("resolution") == "2k" ? tier("2k", u("image_count") * 0.014) : tier("4k", u("image_count") * 0.036)` |
| `flux-2-max` | `tier("base", 0.07 + (u("output_megapixels") - 1) * 0.03 + u("input_megapixels") * 0.03)` |
| `flux-2-pro`、`flux-2-pro-preview` | `tier("base", 0.03 + (u("output_megapixels") - 1) * 0.015 + u("input_megapixels") * 0.015)` |
| `flux-2-flex` | `tier("base", 0.05 + (u("output_megapixels") - 1) * 0.05 + u("input_megapixels") * 0.05)` |
| `flux-2-klein-4b` | `tier("base", 0.014 + (u("output_megapixels") - 1) * 0.001 + u("input_megapixels") * 0.001)` |
| `flux-2-klein-9b`、`flux-2-klein-9b-preview` | `tier("base", 0.015 + (u("output_megapixels") - 1) * 0.002 + u("input_megapixels") * 0.002)` |
| `flux-kontext-pro`、`flux-pro-1.1` | `tier("base", u("image_count") * 0.04)` |
| `flux-kontext-max` | `tier("base", u("image_count") * 0.08)` |
| `flux-pro-1.1-ultra` | `tier("base", u("image_count") * 0.06)` |
| `flux-dev` | `tier("base", u("image_count") * 0.025)` |
| `flux-pro-1.0-fill` | `tier("base", u("image_count") * 0.05)` |

按官方价时，`u("credits") * 0.01` 与上述表达式结果一致；积分写法还能跟随 BFL 自己的取整方式和价格调整，无需更新插件。BFL 没有单独公布 preview 端点的价格，这里按对应固定版本的价格列出。设置价格前请先查看 [BFL 价格页](https://docs.bfl.ai/quick_start/pricing)。

失败的任务（包括被内容审核拦截的任务）全额退款。

## 示例

```bash
curl https://your-gateway.example.com/v1/images/generations \
  -H "Authorization: Bearer $NEW_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model": "flux-2-pro", "prompt": "A paper boat on a calm pond, watercolor", "size": "1536x1024"}'
```

用 BFL 原生请求体编辑图片，再查询结果：

```bash
curl https://your-gateway.example.com/v1/flux-3-image \
  -H "Authorization: Bearer $NEW_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Turn the scene to night, keep everything else", "images": ["https://example.com/street.jpg"], "resolution": "match_input"}'

curl "https://your-gateway.example.com/v1/get_result?id={id}" \
  -H "Authorization: Bearer $NEW_API_TOKEN"
```

## 经由另一个 New API 网关

外层网关转发到持有 BFL 渠道的中间网关时，两边都安装本插件：

- 中间网关：按「渠道设置」建任务插件渠道，并设置自己的价格。
- 外层网关：新建 **New API** 渠道（类型 60），Base URL 填中间网关地址，密钥填中间网关的令牌，在「上游任务插件」里选择本插件，并把 FLUX 模型加到渠道里。

外层插件会向中间网关的 `POST /byaiden_flux/v1/{model}` 提交，并在 `GET /byaiden_flux/v1/get_result?id=` 查询，用 `Authorization: Bearer` 加令牌鉴权（不用 BFL Key，也不发 `x-key`）。图片下载走中间网关签名的链接，中间网关的服务器地址（系统设置）必须能被外层网关访问。外层的 `get_result` 返回外层自己的下载地址；OpenAI 图片回复里是中间网关签名的链接，不需要密钥即可下载。

外层计费：外层按同样的方式计算用量（`resolution`、`image_count`、`output_megapixels`、`input_megapixels`、`credits`），上面的表达式可以直接使用。中间网关不会转出 BFL 报告的费用（它的回复对所有客户端都隐藏费用），所以外层的 `credits` 按 BFL 价目表和报告的分辨率或百万像素计算，而不是 BFL 自己给出的数字；按模型写的表达式在外层是精确的，`u("credits") * 0.01` 按标价计算。

## 限制

- BFL 的图片地址会过期：大多数模型约 10 分钟，FLUX 3 Image 为 1 小时。请及时下载，或在 OpenAI Images API 上使用 `response_format: "b64_json"`。网关下载时会先向 BFL 获取新地址；BFL 不再保留结果后，下载会失败。
- 每个请求只返回一张图片，`n` 必须为 1。OpenAI 的 `quality`、`style`、`background`、`moderation`、`output_compression` 只接受 `auto`。
- `mask` 仅 `flux-pro-1.0-fill` 支持。FLUX 3 Image 不接受 `seed` 和 `output_format`；模型未记载的字段 BFL 会拒绝，插件也会拒绝并指明字段名。
- 图片可传 URL、base64 数据或 data URL（发送其中的 base64 部分），也可在 multipart 编辑请求中上传。`file_id`、`webhook_url`、`webhook_secret`、`callback_url` 会被拒绝，请改为轮询任务。
- `safety_tolerance` 上限：FLUX 3 为 4，FLUX.2 为 5，FLUX.1 为 6。
- OpenAI Images 接口最多等待 `TASK_PLUGIN_PROTOCOL_TIMEOUT_SECONDS`（默认 600 秒）。超时的任务（如 4K 的 FLUX 3 图片）会继续运行，完成后再结算。BFL 提交接口不是幂等的：客户端重试会生成并计费一张新图片。
- 原生路由只接受 `Authorization: Bearer` 形式的网关令牌。
- 未包含：FLUX 3 Video、视频编辑与超分、FLUX 图片工具（扩图、擦除、去模糊、虚拟试穿、Expand）、微调端点，以及运行在 fal 上的 FLUX 3 Max。

经 New API 上游下载文件时，调用中间网关 `/v1/tasks/{id}/artifacts/{key}/content`，携带 Bearer 令牌；直接访问厂商 CDN 时仍不携带密钥。
