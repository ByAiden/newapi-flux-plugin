---
translations:
  zh-CN: README.zh-CN.md
---
# FLUX

**English** | [简体中文](README.zh-CN.md)

Generates and edits images with Black Forest Labs' FLUX models through the [BFL API](https://docs.bfl.ai/): FLUX 3 Image and FLUX 3 Image Klein, FLUX.2 [max], [pro], [flex] and [klein], and the FLUX.1 models Kontext, FLUX1.1 [pro], FLUX1.1 [pro] Ultra, FLUX.1 [dev] and FLUX.1 Fill [pro].

## Channel setup

- Install the plugin, then add a channel of the Task Plugin type and bind it to `byaiden_flux`.
- The key is a BFL API key from the [BFL dashboard](https://dashboard.bfl.ai/). The plugin sends it in BFL's `x-key` header. One key serves every model.
- Leave the API address empty to use `https://api.bfl.ai`, BFL's global endpoint. Enter `https://api.eu.bfl.ai` or `https://api.us.bfl.ai` to keep requests in one region, or a proxy address that forwards BFL's paths. Leave `/v1` off the end.
- Add the models you offer to the channel. A channel can also offer them under other names through model mapping.

BFL returns a `polling_url` on a regional host such as `api.us1.bfl.ai`. The plugin polls it when the channel uses a BFL address and the host is one it lists (`api.bfl.ai`, `api.us.bfl.ai`, `api.eu.bfl.ai`, `api.us1.bfl.ai`, `api.us2.bfl.ai`, `api.eu1.bfl.ai`, `api.eu2.bfl.ai`); any other host is read as `GET /v1/get_result?id=` on the channel address instead, so the key never goes to an unlisted host. A channel on a proxy address always polls through the proxy.

## Models and endpoints

| Model | Price basis | Edits |
| --- | --- | --- |
| `flux-3-image` | Per image by resolution tier | Up to 10 reference images |
| `flux-3-image-klein` | Per image by resolution tier | Up to 10 reference images |
| `flux-2-max`, `flux-2-pro`, `flux-2-pro-preview`, `flux-2-flex` | Per megapixel of output and input | Up to 8 reference images |
| `flux-2-klein-4b`, `flux-2-klein-9b`, `flux-2-klein-9b-preview` | Per megapixel of output and input | Up to 4 reference images |
| `flux-kontext-pro`, `flux-kontext-max` | Per image | Up to 4 reference images |
| `flux-pro-1.1`, `flux-pro-1.1-ultra`, `flux-dev` | Per image | One image prompt (remix) |
| `flux-pro-1.0-fill` | Per image | One image and an optional mask (inpainting) |

| Endpoint | What it does |
| --- | --- |
| `POST /v1/{model}`, for example `POST /v1/flux-2-pro` | BFL's own request body for that model. The reply is BFL's `{id, polling_url}` with the gateway task id |
| `GET /v1/get_result?id={id}` | BFL's result object. When the image is ready, `result.sample` is the gateway's download address |
| `POST /v1/images/generations` | OpenAI Images API: `prompt`, `size`, `n` (1), `output_format`, `user`, plus BFL's own fields such as `aspect_ratio`, `resolution`, `seed`, `safety_tolerance`, `steps`, `guidance`, `prompt_upsampling`, `grounding` and `raw` |
| `POST /v1/images/edits` | OpenAI image edits, JSON or multipart. The images are the references in order, the image being edited first; `flux-pro-1.0-fill` also takes `mask` |

The BFL paths also work under the plugin's prefix, as `/byaiden_flux/v1/flux-2-pro` and `/byaiden_flux/v1/get_result`. The OpenAI Images endpoints wait for the image and answer with BFL's signed image URL, or with base64 data when the request sets `response_format: "b64_json"`.

How `size` is applied: FLUX 3 and FLUX.2 take it as `width` and `height`; Kontext and Ultra take it as an aspect ratio; FLUX1.1 [pro] and FLUX.1 [dev] scale it into 256 to 1440 pixels per side in multiples of 32; Fill keeps the input image's size and rejects `size`.

## Billing

Each model has a price table with a credits field, "BFL credit unit price". One BFL credit is 0.01 USD. The gateway reserves the credits from BFL's published price list and settles every finished task on the cost BFL reports for it, so one expression covers every model at list price:

```text
tier("base", u("credits") * 0.01)
```

Multiply by a margin, for example `* 1.2`, to resell above list price. The quota is the USD amount times 500000.

The other fields describe the image and allow pricing without credits:

- FLUX 3 models report `resolution` (`768sq`, `1k`, `1.5k`, `2k`, `4k`) and `image_count`. A request without a size is sent with `resolution: "1k"`, the size BFL bills by default. An exact `width` x `height`, or `match_input`, is billed at the smallest tier with at least as many pixels; `match_input` reserves `2k`, and a Klein edit without a size reserves `4k`, until BFL reports the delivered size.
- FLUX.2 models report `output_megapixels` and `input_megapixels`, rounded up to whole megapixels per image as BFL bills them. Output is capped at 4 MP. One reference image counts up to 4 MP; several count 1 MP each. A text-to-image request without a size is sent as 1024x1024. An edit without a size keeps the input's size and reserves 4 MP output and 4 MP input until BFL reports the actual megapixels in its submit reply.
- FLUX.1 models report `image_count`, always 1.

Recommended expressions at BFL's list price, one per model (multiply by your margin):

| Model | Expression |
| --- | --- |
| `flux-3-image` | `u("resolution") == "768sq" ? tier("768sq", u("image_count") * 0.041) : u("resolution") == "1k" ? tier("1k", u("image_count") * 0.048) : u("resolution") == "1.5k" ? tier("1.5k", u("image_count") * 0.07) : u("resolution") == "2k" ? tier("2k", u("image_count") * 0.1) : tier("4k", u("image_count") * 0.607)` |
| `flux-3-image-klein` | `u("resolution") == "768sq" ? tier("768sq", u("image_count") * 0.008) : u("resolution") == "1k" ? tier("1k", u("image_count") * 0.009) : u("resolution") == "1.5k" ? tier("1.5k", u("image_count") * 0.011) : u("resolution") == "2k" ? tier("2k", u("image_count") * 0.014) : tier("4k", u("image_count") * 0.036)` |
| `flux-2-max` | `tier("base", 0.07 + (u("output_megapixels") - 1) * 0.03 + u("input_megapixels") * 0.03)` |
| `flux-2-pro`, `flux-2-pro-preview` | `tier("base", 0.03 + (u("output_megapixels") - 1) * 0.015 + u("input_megapixels") * 0.015)` |
| `flux-2-flex` | `tier("base", 0.05 + (u("output_megapixels") - 1) * 0.05 + u("input_megapixels") * 0.05)` |
| `flux-2-klein-4b` | `tier("base", 0.014 + (u("output_megapixels") - 1) * 0.001 + u("input_megapixels") * 0.001)` |
| `flux-2-klein-9b`, `flux-2-klein-9b-preview` | `tier("base", 0.015 + (u("output_megapixels") - 1) * 0.002 + u("input_megapixels") * 0.002)` |
| `flux-kontext-pro`, `flux-pro-1.1` | `tier("base", u("image_count") * 0.04)` |
| `flux-kontext-max` | `tier("base", u("image_count") * 0.08)` |
| `flux-pro-1.1-ultra` | `tier("base", u("image_count") * 0.06)` |
| `flux-dev` | `tier("base", u("image_count") * 0.025)` |
| `flux-pro-1.0-fill` | `tier("base", u("image_count") * 0.05)` |

`u("credits") * 0.01` and these expressions agree at list price; the credits form also follows BFL's own rounding and any price change without an update. BFL does not publish separate prices for the preview endpoints; they are listed here at the price of their pinned versions. Check the [BFL pricing page](https://docs.bfl.ai/quick_start/pricing) when you set prices.

Failed tasks, including moderated ones, are refunded in full.

## Example

```bash
curl https://your-gateway.example.com/v1/images/generations \
  -H "Authorization: Bearer $NEW_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model": "flux-2-pro", "prompt": "A paper boat on a calm pond, watercolor", "size": "1536x1024"}'
```

An edit with BFL's own body, then the result:

```bash
curl https://your-gateway.example.com/v1/flux-3-image \
  -H "Authorization: Bearer $NEW_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Turn the scene to night, keep everything else", "images": ["https://example.com/street.jpg"], "resolution": "match_input"}'

curl "https://your-gateway.example.com/v1/get_result?id={id}" \
  -H "Authorization: Bearer $NEW_API_TOKEN"
```

## Limits

- BFL's image URLs expire: about 10 minutes on most models and one hour on FLUX 3 Image. Download the image right away, or ask for `response_format: "b64_json"` on the OpenAI Images API. A gateway download first asks BFL for a fresh URL; once BFL no longer has the result, the download fails.
- Each request returns one image, so `n` must be 1. OpenAI's `quality`, `style`, `background`, `moderation` and `output_compression` are accepted only as `auto`.
- `mask` works only on `flux-pro-1.0-fill`. FLUX 3 Image takes no `seed` or `output_format`; BFL rejects fields a model does not document, and so does the plugin, naming the field.
- Images are passed as URLs, base64 data or data URLs (sent as their base64 part), or uploaded in a multipart edit. `file_id`, `webhook_url`, `webhook_secret` and `callback_url` are rejected; poll the task instead.
- `safety_tolerance` goes up to 4 on FLUX 3, 5 on FLUX.2 and 6 on FLUX.1.
- The OpenAI Images endpoints wait for the image for up to `TASK_PLUGIN_PROTOCOL_TIMEOUT_SECONDS` (600 seconds by default). A task that runs longer, such as a 4K FLUX 3 image, keeps running and settles when it finishes. BFL submissions are not idempotent: a client retry starts and bills a new image.
- Native routes accept the gateway token as `Authorization: Bearer` only.
- Not covered: FLUX 3 Video, video editing and upscaling, the FLUX image tools (outpainting, erase, deblur, virtual try-on, expand), fine-tuned endpoints, and FLUX 3 Max, which runs on fal.
