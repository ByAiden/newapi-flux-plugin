// Black Forest Labs FLUX API (docs.bfl.ai): FLUX 3 Image, FLUX.2 and FLUX.1
// image generation and editing. Every model is one POST /v1/{model} that
// returns an id and a polling_url, polled at GET /v1/get_result?id={id}.
// The result's result.sample is a signed URL that expires (10 minutes on
// most models, one hour on FLUX 3 Image).
const FLUX3_MODELS = ["flux-3-image", "flux-3-image-klein"];
const FLUX2_MODELS = ["flux-2-max", "flux-2-pro", "flux-2-pro-preview", "flux-2-flex", "flux-2-klein-4b", "flux-2-klein-9b", "flux-2-klein-9b-preview"];
const KONTEXT_MODELS = ["flux-kontext-pro", "flux-kontext-max"];
const FLUX1_MODELS = KONTEXT_MODELS.concat(["flux-pro-1.1", "flux-pro-1.1-ultra", "flux-dev", "flux-pro-1.0-fill"]);
const ALL_MODELS = FLUX3_MODELS.concat(FLUX2_MODELS, FLUX1_MODELS);

const MEGAPIXEL = 1048576;
const FLUX3_TIERS = ["768sq", "1k", "1.5k", "2k", "4k"];
// The pixel area of each FLUX 3 resolution tier. Exact and match_input sizes
// are billed at the smallest tier holding at least as many pixels.
const FLUX3_TIER_PIXELS = { "768sq": 589824, "1k": 1048576, "1.5k": 2359296, "2k": 4194304, "4k": 16822272 };
const FLUX3_ASPECT_RATIOS = ["21:9", "2:1", "16:9", "3:2", "7:5", "4:3", "5:4", "1:1", "4:5", "3:4", "5:7", "2:3", "9:16", "1:2", "9:21", "auto"];
const FLUX3_MAX_SIDE = 6256;
const FLUX3_MAX_EDIT_PIXELS = 4194304;
const OUTPUT_FORMATS = ["jpeg", "png", "webp"];

// BFL's published pay-as-you-go prices in credits (1 credit = 0.01 USD),
// from docs.bfl.ai/quick_start/pricing and bfl.ai/pricing. They reserve a
// task's charge; the task settles on the cost BFL reports.
const FLUX3_CREDITS = {
  "flux-3-image": { "768sq": 4.1, "1k": 4.8, "1.5k": 7, "2k": 10, "4k": 60.7 },
  "flux-3-image-klein": { "768sq": 0.8, "1k": 0.9, "1.5k": 1.1, "2k": 1.4, "4k": 3.6 },
};
// FLUX.2: the first output megapixel, then each further output megapixel and
// each input megapixel. Megapixels are rounded up per image; output is capped
// at 4 MP; one reference image counts up to 4 MP, several count 1 MP each.
const FLUX2_RATES = {
  "flux-2-max": { first: 7, more: 3 },
  "flux-2-pro": { first: 3, more: 1.5 },
  "flux-2-pro-preview": { first: 3, more: 1.5 },
  "flux-2-flex": { first: 5, more: 5 },
  "flux-2-klein-4b": { first: 1.4, more: 0.1 },
  "flux-2-klein-9b": { first: 1.5, more: 0.2 },
  "flux-2-klein-9b-preview": { first: 1.5, more: 0.2 },
};
const FLUX2_MAX_MEGAPIXELS = 4;
const FLUX1_CREDITS = {
  "flux-kontext-pro": 4,
  "flux-kontext-max": 8,
  "flux-pro-1.1": 4,
  "flux-pro-1.1-ultra": 6,
  "flux-dev": 2.5,
  "flux-pro-1.0-fill": 5,
};
// A reported cost above this is not trusted; the reservation stands.
const MAX_CREDITS = 100;

// Hosts BFL hands out in polling_url: the global endpoint and its regional
// clusters. They receive the channel key, so they are listed in allowedHosts.
const POLL_HOSTS = ["api.bfl.ai", "api.us.bfl.ai", "api.eu.bfl.ai", "api.us1.bfl.ai", "api.us2.bfl.ai", "api.eu1.bfl.ai", "api.eu2.bfl.ai"];

export const meta = {
  "apiVersion": 1,
  "key": "byaiden_flux",
  "name": "FLUX",
  "icon": "Bfl",
  "description": {
    "en": "FLUX image generation and editing by Black Forest Labs: FLUX 3 Image, FLUX.2 (max, pro, flex, klein) and FLUX.1 (Kontext, 1.1 pro, Ultra, dev, Fill)",
    "zh": "FLUX 图片生成与编辑（Black Forest Labs 官方 API）：FLUX 3 Image、FLUX.2（max、pro、flex、klein）与 FLUX.1（Kontext、1.1 pro、Ultra、dev、Fill）"
  },
  "version": "1.1.0",
  "author": {
    "name": "ByAiden",
    "url": "https://github.com/ByAiden"
  },
  "website": "https://docs.bfl.ai/",
  "baseUrl": "https://api.bfl.ai",
  "allowedHosts": [
    "api.bfl.ai",
    "api.us.bfl.ai",
    "api.eu.bfl.ai",
    "api.us1.bfl.ai",
    "api.us2.bfl.ai",
    "api.eu1.bfl.ai",
    "api.eu2.bfl.ai"
  ],
  "upstreams": [
    "vendor",
    "new_api"
  ],
  "models": [
    "flux-3-image",
    "flux-3-image-klein",
    "flux-2-max",
    "flux-2-pro",
    "flux-2-pro-preview",
    "flux-2-flex",
    "flux-2-klein-4b",
    "flux-2-klein-9b",
    "flux-2-klein-9b-preview",
    "flux-kontext-pro",
    "flux-kontext-max",
    "flux-pro-1.1",
    "flux-pro-1.1-ultra",
    "flux-dev",
    "flux-pro-1.0-fill"
  ],
  "fetchMode": "per_task",
  "usageSchema": {
    "credits": {
      "type": "number",
      "unit": "credit",
      "description": {
        "en": "BFL credit unit price",
        "zh": "BFL 积分单价"
      }
    },
    "image_count": {
      "type": "number",
      "unit": "count",
      "unitLabel": {
        "en": "image",
        "zh": "张"
      },
      "description": {
        "en": "Image unit price",
        "zh": "图片单价"
      }
    }
  },
  "usageExamples": [
    {
      "label": "flux-kontext-pro",
      "facts": {
        "credits": 4,
        "image_count": 1
      }
    },
    {
      "label": "flux-kontext-max",
      "facts": {
        "credits": 8,
        "image_count": 1
      }
    },
    {
      "label": "flux-pro-1.1-ultra",
      "facts": {
        "credits": 6,
        "image_count": 1
      }
    }
  ],
  "usageProfiles": [
    {
      "models": [
        "flux-3-image",
        "flux-3-image-klein"
      ],
      "schema": {
        "credits": {
          "type": "number",
          "unit": "credit",
          "description": {
            "en": "BFL credit unit price",
            "zh": "BFL 积分单价"
          }
        },
        "resolution": {
          "enum": [
            "768sq",
            "1k",
            "1.5k",
            "2k",
            "4k"
          ],
          "enumLabels": {
            "768sq": {
              "en": "768 x 768",
              "zh": "768 x 768"
            },
            "1k": {
              "en": "1K",
              "zh": "1K"
            },
            "1.5k": {
              "en": "1.5K",
              "zh": "1.5K"
            },
            "2k": {
              "en": "2K",
              "zh": "2K"
            },
            "4k": {
              "en": "4K",
              "zh": "4K"
            }
          },
          "description": {
            "en": "Output resolution tier",
            "zh": "输出分辨率档位"
          }
        },
        "image_count": {
          "type": "number",
          "unit": "count",
          "unitLabel": {
            "en": "image",
            "zh": "张"
          },
          "description": {
            "en": "Image unit price",
            "zh": "图片单价"
          }
        }
      },
      "examples": [
        {
          "label": "flux-3-image 1k",
          "facts": {
            "credits": 4.8,
            "resolution": "1k",
            "image_count": 1
          }
        },
        {
          "label": "flux-3-image 4k",
          "facts": {
            "credits": 60.7,
            "resolution": "4k",
            "image_count": 1
          }
        },
        {
          "label": "flux-3-image-klein 2k",
          "facts": {
            "credits": 1.4,
            "resolution": "2k",
            "image_count": 1
          }
        }
      ]
    },
    {
      "models": [
        "flux-2-max",
        "flux-2-pro",
        "flux-2-pro-preview",
        "flux-2-flex",
        "flux-2-klein-4b",
        "flux-2-klein-9b",
        "flux-2-klein-9b-preview"
      ],
      "schema": {
        "credits": {
          "type": "number",
          "unit": "credit",
          "description": {
            "en": "BFL credit unit price",
            "zh": "BFL 积分单价"
          }
        },
        "output_megapixels": {
          "type": "number",
          "unit": "count",
          "unitLabel": {
            "en": "megapixel",
            "zh": "百万像素"
          },
          "description": {
            "en": "Output megapixel unit price",
            "zh": "输出百万像素单价"
          }
        },
        "input_megapixels": {
          "type": "number",
          "unit": "count",
          "unitLabel": {
            "en": "megapixel",
            "zh": "百万像素"
          },
          "description": {
            "en": "Input image megapixel unit price",
            "zh": "输入图片百万像素单价"
          }
        },
        "image_count": {
          "type": "number",
          "unit": "count",
          "unitLabel": {
            "en": "image",
            "zh": "张"
          },
          "description": {
            "en": "Image unit price",
            "zh": "图片单价"
          }
        }
      },
      "examples": [
        {
          "label": "flux-2-pro 1024x1024",
          "facts": {
            "credits": 3,
            "output_megapixels": 1,
            "input_megapixels": 0,
            "image_count": 1
          }
        },
        {
          "label": "flux-2-pro 2048x2048",
          "facts": {
            "credits": 7.5,
            "output_megapixels": 4,
            "input_megapixels": 0,
            "image_count": 1
          }
        },
        {
          "label": "flux-2-max 1024x1024, 2 refs",
          "facts": {
            "credits": 13,
            "output_megapixels": 1,
            "input_megapixels": 2,
            "image_count": 1
          }
        }
      ]
    }
  ],
  "routes": [
    {
      "method": "POST",
      "path": "/v1/flux-3-image",
      "type": "submit",
      "decode": "createTask",
      "render": "taskCreated"
    },
    {
      "method": "POST",
      "path": "/v1/flux-3-image-klein",
      "type": "submit",
      "decode": "createTask",
      "render": "taskCreated"
    },
    {
      "method": "POST",
      "path": "/v1/flux-2-max",
      "type": "submit",
      "decode": "createTask",
      "render": "taskCreated"
    },
    {
      "method": "POST",
      "path": "/v1/flux-2-pro",
      "type": "submit",
      "decode": "createTask",
      "render": "taskCreated"
    },
    {
      "method": "POST",
      "path": "/v1/flux-2-pro-preview",
      "type": "submit",
      "decode": "createTask",
      "render": "taskCreated"
    },
    {
      "method": "POST",
      "path": "/v1/flux-2-flex",
      "type": "submit",
      "decode": "createTask",
      "render": "taskCreated"
    },
    {
      "method": "POST",
      "path": "/v1/flux-2-klein-4b",
      "type": "submit",
      "decode": "createTask",
      "render": "taskCreated"
    },
    {
      "method": "POST",
      "path": "/v1/flux-2-klein-9b",
      "type": "submit",
      "decode": "createTask",
      "render": "taskCreated"
    },
    {
      "method": "POST",
      "path": "/v1/flux-2-klein-9b-preview",
      "type": "submit",
      "decode": "createTask",
      "render": "taskCreated"
    },
    {
      "method": "POST",
      "path": "/v1/flux-kontext-pro",
      "type": "submit",
      "decode": "createTask",
      "render": "taskCreated"
    },
    {
      "method": "POST",
      "path": "/v1/flux-kontext-max",
      "type": "submit",
      "decode": "createTask",
      "render": "taskCreated"
    },
    {
      "method": "POST",
      "path": "/v1/flux-pro-1.1",
      "type": "submit",
      "decode": "createTask",
      "render": "taskCreated"
    },
    {
      "method": "POST",
      "path": "/v1/flux-pro-1.1-ultra",
      "type": "submit",
      "decode": "createTask",
      "render": "taskCreated"
    },
    {
      "method": "POST",
      "path": "/v1/flux-dev",
      "type": "submit",
      "decode": "createTask",
      "render": "taskCreated"
    },
    {
      "method": "POST",
      "path": "/v1/flux-pro-1.0-fill",
      "type": "submit",
      "decode": "createTask",
      "render": "taskCreated"
    },
    {
      "method": "GET",
      "path": "/v1/get_result",
      "type": "query",
      "taskIdParam": "id",
      "render": "taskResult"
    }
  ],
  "protocols": [
    {
      "name": "openai_image",
      "models": [
        "flux-3-image",
        "flux-3-image-klein",
        "flux-2-max",
        "flux-2-pro",
        "flux-2-pro-preview",
        "flux-2-flex",
        "flux-2-klein-4b",
        "flux-2-klein-9b",
        "flux-2-klein-9b-preview",
        "flux-kontext-pro",
        "flux-kontext-max",
        "flux-pro-1.1",
        "flux-pro-1.1-ultra",
        "flux-dev",
        "flux-pro-1.0-fill"
      ]
    }
  ]
};

// The plugin's key; the gateway reads the manifest statically, so code uses this copy.
const PLUGIN_KEY = "byaiden_flux";

// A type-60 New API channel: the same plugin answers on another gateway,
// which serves BFL's paths under the plugin's key and takes its own token as
// Authorization: Bearer. Hosts that never set ctx.upstream mean BFL.
function viaGateway(ctx) {
  return !!(ctx && ctx.upstream && ctx.upstream.kind === "new_api");
}

// The API root requests go to: the channel address, plus the plugin key
// on another New API gateway.
function apiRoot(ctx) {
  return trimmed(ctx.baseUrl).replace(/\/+$/, "") + (viaGateway(ctx) ? "/" + PLUGIN_KEY : "");
}

function trimmed(value) {
  return String(value === undefined || value === null ? "" : value).trim();
}

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function present(value) {
  return value !== undefined && value !== null;
}

function given(value) {
  return present(value) && value !== "";
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

function familyOf(model) {
  if (FLUX3_MODELS.includes(model)) return "flux3";
  if (FLUX2_MODELS.includes(model)) return "flux2";
  return "flux1";
}

// The model the channel sends upstream: the mapped name first, then the
// client's.
function upstreamModel(identity) {
  const names = [identity.upstreamModel, identity.model].map(trimmed).filter(Boolean);
  for (const name of names) {
    if (ALL_MODELS.includes(name)) return name;
  }
  throw new Error((names[0] || "model") + " is not a supported FLUX model; use " + ALL_MODELS.join(", "));
}

function intField(value, name, min, max) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || (max !== null && value > max))
    throw new Error(name + " must be an integer from " + min + (max !== null ? " to " + max : ""));
  return value;
}

function numberField(value, name, min, max) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new Error(name + " must be a number from " + min + " to " + max);
  return value;
}

function boolField(value, name) {
  if (typeof value !== "boolean") throw new Error(name + " must be true or false");
  return value;
}

function enumField(value, name, allowed) {
  const text = trimmed(value).toLowerCase();
  if (!allowed.includes(text)) throw new Error(name + " must be one of " + allowed.join(", "));
  return text;
}

function stringField(value, name) {
  if (typeof value !== "string") throw new Error(name + " must be a string");
  return value.trim();
}

// An input image: an http(s) URL, base64 data, a data URL (sent as its base64
// part) or a gateway file placeholder from a multipart upload.
function imageRef(value, name) {
  const object = plainObject(value);
  if (object && object.__fileRef) return { __fileRef: object.__fileRef, encoding: "base64" };
  if (object && present(object.file_id)) throw new Error(name + ".file_id is not supported; pass a URL or base64 data");
  if (typeof value !== "string") throw new Error(name + " must be a URL or base64 image data");
  const text = value.trim();
  if (!text) throw new Error(name + " must not be empty");
  if (/^data:/i.test(text)) {
    const match = /^data:[^,]*;base64,([\s\S]+)$/i.exec(text);
    if (!match) throw new Error(name + " must be a base64 data URL");
    return match[1];
  }
  return text;
}

function ratioText(value, name) {
  const text = trimmed(value);
  const match = /^(\d+):(\d+)$/.exec(text);
  if (!match || Number(match[1]) <= 0 || Number(match[2]) <= 0) throw new Error(name + " must be a ratio such as 16:9");
  const ratio = Number(match[1]) / Number(match[2]);
  if (ratio > 21 / 9 + 1e-9 || ratio < 9 / 21 - 1e-9) throw new Error(name + " must be between 21:9 and 9:21");
  return text;
}

function sizePair(source, min, max) {
  const hasWidth = present(source.width);
  const hasHeight = present(source.height);
  if (!hasWidth && !hasHeight) return null;
  if (!hasWidth || !hasHeight) throw new Error("width and height must be set together");
  return { width: intField(source.width, "width", min, max), height: intField(source.height, "height", min, max) };
}

// Webhooks are rejected: BFL would post the result, with its own task id, to
// the caller's address.
function rejectWebhooks(source) {
  for (const key of ["webhook_url", "webhook_secret", "callback_url"]) {
    if (present(source[key])) throw new Error(key + " is not supported; poll the task instead");
  }
}

// Fields every BFL endpoint shares.
function commonFields(source, body, safetyMax) {
  if (present(source.user)) {
    const user = stringField(source.user, "user");
    if (!user || user.length > 256) throw new Error("user must be 1 to 256 characters");
    body.user = user;
  }
  if (present(source.safety_tolerance)) body.safety_tolerance = intField(source.safety_tolerance, "safety_tolerance", 0, safetyMax);
}

function checkFields(source, allowed, model) {
  for (const key of Object.keys(source)) {
    if (!allowed.includes(key) && present(source[key])) throw new Error(key + " is not supported on " + model);
  }
}

function requiredPrompt(source) {
  const prompt = present(source.prompt) ? stringField(source.prompt, "prompt") : "";
  if (!prompt) throw new Error("prompt is required");
  return prompt;
}

// input_image, input_image_2, ... input_image_N in order without gaps.
function inputImages(source, max) {
  const names = ["input_image"];
  for (let index = 2; index <= max; index++) names.push("input_image_" + index);
  const images = [];
  names.forEach(function (name, position) {
    if (!present(source[name])) return;
    if (images.length !== position) throw new Error(name + " needs " + names[position - 1] + " first");
    images.push({ name: name, value: imageRef(source[name], name) });
  });
  return images;
}

function inputImageNames(max) {
  const names = ["input_image"];
  for (let index = 2; index <= max; index++) names.push("input_image_" + index);
  return names;
}

function tierForPixels(pixels) {
  for (const tier of FLUX3_TIERS) {
    if (pixels <= FLUX3_TIER_PIXELS[tier]) return tier;
  }
  return "4k";
}

// FLUX 3 Image and FLUX 3 Image Klein. Both reject unknown fields, so only
// their documented fields pass. Without a size the request sends
// resolution "1k", the default BFL bills; a Klein edit without a size keeps
// the first reference's size, which reserves the 4k price.
function flux3Request(source, model) {
  const klein = model === "flux-3-image-klein";
  const extra = klein ? ["seed", "output_format", "steps"] : ["grounding"];
  checkFields(source, ["prompt", "images", "aspect_ratio", "resolution", "width", "height", "safety_tolerance", "user"].concat(extra), model);
  const body = { prompt: requiredPrompt(source) };
  let refs = [];
  if (present(source.images)) {
    const list = Array.isArray(source.images) ? source.images : [source.images];
    if (list.length < 1 || list.length > 10) throw new Error("images takes 1 to 10 images");
    refs = list.map(function (image, index) {
      return imageRef(image, "images[" + index + "]");
    });
    body.images = refs;
  }
  if (present(source.aspect_ratio)) body.aspect_ratio = enumField(source.aspect_ratio, "aspect_ratio", FLUX3_ASPECT_RATIOS);
  const size = sizePair(source, klein ? 64 : 256, FLUX3_MAX_SIDE);
  let tier;
  if (size) {
    const pixels = size.width * size.height;
    if (pixels > FLUX3_TIER_PIXELS["4k"]) throw new Error("width x height must be at most " + FLUX3_TIER_PIXELS["4k"] + " pixels");
    if (!klein && refs.length && pixels > FLUX3_MAX_EDIT_PIXELS) throw new Error("width x height must be at most " + FLUX3_MAX_EDIT_PIXELS + " pixels with reference images");
    if (present(source.resolution)) throw new Error("set either resolution or width and height");
    body.width = size.width;
    body.height = size.height;
    tier = tierForPixels(pixels);
  } else if (present(source.resolution)) {
    const resolution = enumField(source.resolution, "resolution", klein ? FLUX3_TIERS : FLUX3_TIERS.concat(["match_input"]));
    if (resolution === "match_input" && !refs.length) throw new Error("resolution match_input needs reference images");
    body.resolution = resolution;
    // match_input follows the first reference, up to 4 MP.
    tier = resolution === "match_input" ? "2k" : resolution;
  } else if (klein && refs.length) {
    tier = "4k";
  } else {
    body.resolution = "1k";
    tier = "1k";
  }
  if (present(source.grounding)) body.grounding = boolField(source.grounding, "grounding");
  if (present(source.seed)) body.seed = intField(source.seed, "seed", 0, 4294967295);
  if (present(source.output_format)) body.output_format = enumField(source.output_format, "output_format", ["jpeg", "png"]);
  if (present(source.steps)) body.steps = intField(source.steps, "steps", 1, 16);
  commonFields(source, body, 4);
  return { body: body, refs: refs.length, tier: tier, action: refs.length ? "image_edit" : "text_to_image" };
}

// FLUX.2 [max], [pro], [flex] and [klein]. A text-to-image request without a
// size sends 1024x1024 so the reservation matches; an edit without a size
// keeps the input's size and reserves the 4 MP maximum.
function flux2Request(source, model) {
  const klein = /klein/.test(model);
  const maxRefs = klein ? 4 : 8;
  const extra = model === "flux-2-flex" ? ["prompt_upsampling", "guidance", "steps"] : klein ? [] : ["disable_pup"];
  checkFields(source, ["prompt", "seed", "width", "height", "safety_tolerance", "output_format", "user"].concat(inputImageNames(maxRefs), extra), model);
  const body = { prompt: requiredPrompt(source) };
  const images = inputImages(source, maxRefs);
  images.forEach(function (image) {
    body[image.name] = image.value;
  });
  const size = sizePair(source, 64, null);
  if (size) {
    body.width = size.width;
    body.height = size.height;
  } else if (!images.length) {
    body.width = 1024;
    body.height = 1024;
  }
  if (present(source.seed)) body.seed = intField(source.seed, "seed", 0, null);
  if (present(source.output_format)) body.output_format = enumField(source.output_format, "output_format", OUTPUT_FORMATS);
  if (present(source.disable_pup)) body.disable_pup = boolField(source.disable_pup, "disable_pup");
  if (present(source.prompt_upsampling)) body.prompt_upsampling = boolField(source.prompt_upsampling, "prompt_upsampling");
  if (present(source.guidance)) body.guidance = numberField(source.guidance, "guidance", 1.5, 10);
  if (present(source.steps)) body.steps = intField(source.steps, "steps", 1, 50);
  commonFields(source, body, 5);
  const pixels = body.width && body.height ? body.width * body.height : 0;
  return { body: body, refs: images.length, pixels: pixels, action: images.length ? "image_edit" : "text_to_image" };
}

// FLUX.1 Kontext, FLUX1.1 [pro], FLUX1.1 [pro] Ultra, FLUX.1 [dev] and
// FLUX.1 Fill [pro]: one price per image.
function flux1Request(source, model) {
  const body = {};
  let refs = 0;
  let action = "text_to_image";
  if (KONTEXT_MODELS.includes(model)) {
    checkFields(source, ["prompt", "seed", "aspect_ratio", "output_format", "prompt_upsampling", "safety_tolerance", "user"].concat(inputImageNames(4)), model);
    body.prompt = requiredPrompt(source);
    const images = inputImages(source, 4);
    images.forEach(function (image) {
      body[image.name] = image.value;
    });
    refs = images.length;
    if (present(source.aspect_ratio)) body.aspect_ratio = ratioText(source.aspect_ratio, "aspect_ratio");
  } else if (model === "flux-pro-1.0-fill") {
    checkFields(source, ["image", "mask", "prompt", "steps", "prompt_upsampling", "seed", "guidance", "output_format", "safety_tolerance", "user"], model);
    if (!present(source.image)) throw new Error("image is required");
    body.image = imageRef(source.image, "image");
    if (present(source.mask)) body.mask = imageRef(source.mask, "mask");
    if (present(source.prompt)) body.prompt = stringField(source.prompt, "prompt");
    if (present(source.steps)) body.steps = intField(source.steps, "steps", 15, 50);
    if (present(source.guidance)) body.guidance = numberField(source.guidance, "guidance", 1.5, 100);
    refs = 1;
    action = "inpaint";
  } else {
    const fields = {
      "flux-pro-1.1": ["width", "height", "image_prompt"],
      "flux-pro-1.1-ultra": ["aspect_ratio", "raw", "image_prompt", "image_prompt_strength"],
      "flux-dev": ["width", "height", "image_prompt", "steps", "guidance"],
    }[model];
    checkFields(source, ["prompt", "seed", "prompt_upsampling", "output_format", "safety_tolerance", "user"].concat(fields), model);
    body.prompt = requiredPrompt(source);
    if (fields.includes("width")) {
      const size = sizePair(source, 256, 1440);
      if (size) {
        if (size.width % 32 || size.height % 32) throw new Error("width and height must be multiples of 32");
        body.width = size.width;
        body.height = size.height;
      }
    }
    if (present(source.aspect_ratio)) body.aspect_ratio = ratioText(source.aspect_ratio, "aspect_ratio");
    if (present(source.raw)) body.raw = boolField(source.raw, "raw");
    if (present(source.image_prompt)) {
      body.image_prompt = imageRef(source.image_prompt, "image_prompt");
      refs = 1;
      action = "image_prompt";
    }
    if (present(source.image_prompt_strength)) {
      if (!body.image_prompt) throw new Error("image_prompt_strength needs image_prompt");
      body.image_prompt_strength = numberField(source.image_prompt_strength, "image_prompt_strength", 0, 1);
    }
    if (present(source.steps)) body.steps = intField(source.steps, "steps", 1, 50);
    if (present(source.guidance)) body.guidance = numberField(source.guidance, "guidance", 1.5, 5);
  }
  if (present(source.seed)) body.seed = intField(source.seed, "seed", 0, null);
  if (present(source.output_format)) body.output_format = enumField(source.output_format, "output_format", OUTPUT_FORMATS);
  if (present(source.prompt_upsampling)) body.prompt_upsampling = boolField(source.prompt_upsampling, "prompt_upsampling");
  if (KONTEXT_MODELS.includes(model) && refs) action = "image_edit";
  commonFields(source, body, 6);
  return { body: body, refs: refs, action: action };
}

// Validates a BFL request body for a model and keeps only the fields BFL
// documents for it, so an unlisted field cannot change what the reservation
// covers. The model is the path, not a body field.
function bflRequest(source, model) {
  const input = Object.assign({}, source);
  delete input.model;
  rejectWebhooks(input);
  const family = familyOf(model);
  const request = family === "flux3" ? flux3Request(input, model) : family === "flux2" ? flux2Request(input, model) : flux1Request(input, model);
  request.family = family;
  return request;
}

// The usage facts a request reserves on the model the channel sends upstream.
function estimatedFacts(request, model) {
  if (request.family === "flux3") return { credits: FLUX3_CREDITS[model][request.tier], resolution: request.tier, image_count: 1 };
  if (request.family === "flux2") {
    const output = request.pixels ? Math.min(FLUX2_MAX_MEGAPIXELS, Math.ceil(request.pixels / MEGAPIXEL)) : FLUX2_MAX_MEGAPIXELS;
    const input = request.refs === 0 ? 0 : request.refs === 1 ? FLUX2_MAX_MEGAPIXELS : request.refs;
    return flux2Facts(model, output, input);
  }
  return { credits: FLUX1_CREDITS[model], image_count: 1 };
}

function flux2Facts(model, output, input) {
  const rate = FLUX2_RATES[model];
  return { credits: round3(rate.first + (output - 1) * rate.more + input * rate.more), output_megapixels: output, input_megapixels: input, image_count: 1 };
}

function submitIntent(model, request) {
  return { kind: "submit", model: model, action: request.action, requestBody: Object.assign({}, request.body, { model: model }) };
}

function hostOf(url) {
  const match = /^https:\/\/([^/?#:]+)(?::(\d+))?(?=[/?#]|$)/i.exec(trimmed(url));
  return match ? match[1].toLowerCase() + (match[2] && match[2] !== "443" ? ":" + match[2] : "") : "";
}

function pathOf(url) {
  const match = /^https?:\/\/[^/?#]+([^#]*)/i.exec(trimmed(url));
  return match ? match[1] || "/" : "";
}

// The address a task is polled at. BFL's polling_url is used as it is when
// the channel talks to BFL directly and the URL's host is one of BFL's
// polling hosts; a channel behind a proxy keeps its own host. Otherwise the
// task is read from the channel's /v1/get_result, which is also the middle
// gateway's query route on a New API channel.
function pollingURL(ctx) {
  const base = trimmed(ctx.baseUrl).replace(/\/+$/, "");
  const state = plainObject(ctx.state) || {};
  const data = plainObject(ctx.data) || {};
  const fallback = apiRoot(ctx) + "/v1/get_result?id=" + encodeURIComponent(ctx.taskId || ctx.upstreamTaskId);
  if (viaGateway(ctx)) return fallback;
  const polling = trimmed(state.polling_url || data.polling_url);
  if (!polling || !/^\/v1\/get_result\?/.test(pathOf(polling))) return fallback;
  const baseHost = hostOf(base);
  if (POLL_HOSTS.includes(baseHost)) return POLL_HOSTS.includes(hostOf(polling)) ? polling : fallback;
  return base + pathOf(polling);
}

// BFL takes the key as x-key; another New API gateway takes its token as Bearer.
function authHeaders(ctx) {
  return viaGateway(ctx) ? { Authorization: "Bearer " + (ctx.apiKey || "") } : { "x-key": ctx.apiKey || "" };
}

function queryHeaders(ctx) {
  return Object.assign({ Accept: "application/json" }, authHeaders(ctx));
}

function resultObject(data) {
  const object = plainObject(data);
  return object ? plainObject(object.result) : null;
}

function sampleURL(data) {
  const result = resultObject(data);
  return result ? trimmed(result.sample) : "";
}

function failureReason(data) {
  const object = plainObject(data) || {};
  const status = trimmed(object.status);
  const details = plainObject(object.details) || {};
  const reasons = Array.isArray(details["Moderation Reasons"]) ? details["Moderation Reasons"].map(trimmed).filter(Boolean) : [];
  const message = trimmed(object.error) || trimmed(details.error) || trimmed(details.message);
  let reason = status || "generation failed";
  if (reasons.length) reason += ": " + reasons.join(", ");
  else if (message) reason += ": " + message;
  return reason;
}

function progressText(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined;
  const percent = value <= 1 ? value * 100 : value;
  return Math.min(99, Math.round(percent)) + "%";
}

function imageMimeType(url) {
  const path = trimmed(url).split("?")[0].toLowerCase();
  if (/\.png$/.test(path)) return "image/png";
  if (/\.jpe?g$/.test(path)) return "image/jpeg";
  if (/\.webp$/.test(path)) return "image/webp";
  return "";
}

const FAILED_STATUSES = ["Request Moderated", "Content Moderated", "Error", "Failed", "Task not found", "No Card Generated"];

// BFL's submit reply without the cost it reports for the account.
function publicSubmit(data, taskId) {
  const object = plainObject(data) || {};
  const out = { id: taskId, polling_url: "/v1/get_result?id=" + encodeURIComponent(taskId) };
  for (const key of ["input_mp", "output_mp"]) {
    if (object[key] !== undefined) out[key] = object[key];
  }
  return out;
}

export const native = {
  // BFL's own body; the model is the last path segment.
  createTask: function (ctx) {
    if (!ctx.body || ctx.body.kind !== "json") throw new Error("JSON body required");
    const body = plainObject(ctx.body.value);
    if (!body) throw new Error("request body must be an object");
    const model = trimmed(ctx.path).split("/").pop();
    if (!ALL_MODELS.includes(model)) throw new Error(model + " is not a supported FLUX model");
    if (present(body.model) && trimmed(body.model) !== model) throw new Error("model is taken from the path; remove it from the body");
    return submitIntent(model, bflRequest(body, model));
  },
  taskCreated: function (ctx, task) {
    return publicSubmit(task.data, task.task_id);
  },
  // BFL's result object, without its cost and preview. result.sample is the
  // gateway's download address once the image is ready.
  taskResult: function (ctx, task) {
    const data = plainObject(task.data) || {};
    const status = present(data.status) ? data.status : "Pending";
    const out = { id: task.task_id, status: status, result: null, progress: present(data.progress) ? data.progress : null, details: present(data.details) ? data.details : null };
    if (task.status === "FAILURE" && !FAILED_STATUSES.includes(status)) {
      out.status = "Error";
      out.details = { error: task.fail_reason || "generation failed" };
      return out;
    }
    const result = resultObject(data);
    if (result) {
      out.result = Object.assign({}, result);
      const artifact = ctx.artifacts ? ctx.artifacts.image : null;
      if (artifact && trimmed(artifact.url)) out.result.sample = trimmed(artifact.url);
    }
    return out;
  },
  error: function (ctx, error) {
    return { detail: error.message, error: { code: error.code } };
  },
};

export function buildSubmitRequest(ctx) {
  const model = upstreamModel(ctx);
  const request = bflRequest(ctx.requestBody || {}, model);
  return {
    url: apiRoot(ctx) + "/v1/" + model,
    method: "POST",
    headers: Object.assign({ "Content-Type": "application/json", Accept: "application/json" }, authHeaders(ctx)),
    body: request.body,
    action: request.action,
  };
}

// BFL answers with id, polling_url and, for most models, the cost in credits
// and the input and output megapixels. They are kept in the plugin state,
// since each poll replaces the task data. Another New API gateway answers
// with its own task id and the megapixels, without the cost.
export function parseSubmitResponse(ctx, resp) {
  const body = plainObject(resp.body);
  const id = body ? trimmed(body.id) : "";
  if (!id) throw new Error("BFL did not return a task id");
  const model = upstreamModel(ctx);
  const request = bflRequest(ctx.requestBody || {}, model);
  const state = { model: model, refs: request.refs, reserved: estimatedFacts(request, model) };
  if (trimmed(body.polling_url)) state.polling_url = trimmed(body.polling_url);
  for (const key of ["cost", "input_mp", "output_mp"]) {
    if (typeof body[key] === "number" && Number.isFinite(body[key])) state[key] = body[key];
  }
  return { taskId: id, taskData: body, state: state };
}

export function extractUsage(ctx) {
  // Legacy per-call prices have no ratio to scale.
  if (ctx.usagePurpose === "billing_ratios") return null;
  const model = upstreamModel(ctx);
  return estimatedFacts(bflRequest(ctx.requestBody || {}, model), model);
}

export function buildQueryRequest(ctx) {
  return { url: pollingURL(ctx), method: "GET", headers: queryHeaders(ctx) };
}

export function parseTaskResult(ctx, body) {
  const data = plainObject(body);
  const status = data ? data.status : undefined;
  if (status === "Pending") {
    const progress = progressText(data.progress);
    return progress && progress !== "0%" ? { status: "IN_PROGRESS", progress: progress } : { status: "QUEUED" };
  }
  if (status === "Reasoning" || status === "Generating") {
    const progress = progressText(data.progress);
    return progress ? { status: "IN_PROGRESS", progress: progress } : { status: "IN_PROGRESS" };
  }
  if (status === "Ready") return sampleURL(data) ? { status: "SUCCESS", progress: "100%" } : { status: "FAILURE", reason: "BFL returned no image" };
  if (FAILED_STATUSES.includes(status)) return { status: "FAILURE", reason: failureReason(data) };
  return { status: "UNKNOWN", reason: "unrecognized status: " + String(status || "") };
}

function reportedMegapixels(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
  // BFL reports two decimals; 1.00 is one megapixel.
  return Math.ceil(value - 0.005);
}

function flux3TierFromMegapixels(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "";
  return tierForPixels(value * MEGAPIXEL * 0.99);
}

// The task settles on the credits BFL reports: the settled cost of the final
// poll, else the cost of the submit reply. The size facts follow the
// megapixels BFL reported. Without a reported cost the reservation stands.
export function extractUsageOnComplete(task, result, body) {
  const data = plainObject(body);
  if (!data || data.status !== "Ready") return null;
  const state = plainObject(task.state) || {};
  const reserved = plainObject(state.reserved);
  if (!reserved) return null;
  const model = trimmed(state.model) || upstreamModel(task);
  const facts = Object.assign({}, reserved);
  if (FLUX2_MODELS.includes(model)) {
    const output = Math.min(FLUX2_MAX_MEGAPIXELS, reportedMegapixels(state.output_mp));
    const refs = Number(state.refs) || 0;
    const input = refs === 1 ? Math.min(FLUX2_MAX_MEGAPIXELS, reportedMegapixels(state.input_mp)) : refs;
    if (output > 0 && (refs !== 1 || input > 0)) Object.assign(facts, flux2Facts(model, output, input));
  } else if (FLUX3_MODELS.includes(model)) {
    const tier = flux3TierFromMegapixels(state.output_mp);
    if (tier) Object.assign(facts, { resolution: tier, credits: FLUX3_CREDITS[model][tier] });
  }
  for (const value of [data.cost, state.cost]) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0 && value <= MAX_CREDITS) {
      facts.credits = round3(value);
      break;
    }
  }
  return facts;
}

export function listArtifacts(task) {
  if (task.status !== "SUCCESS") return [];
  const url = sampleURL(task.data);
  if (!url) return [];
  const artifact = { key: "image", type: "image" };
  const mimeType = imageMimeType(url);
  if (mimeType) artifact.mimeType = mimeType;
  return [artifact];
}

// BFL's signed sample URLs expire, so a download reads the task again first
// and falls back to the URL from the last poll. The URL is signed, so the
// download carries no credential.
export function buildContentRequest(ctx) {
  if (viaGateway(ctx)) {
    if (!ctx.upstreamTaskId) throw new Error("artifact_not_found");
    return {
      url: String(ctx.baseUrl || "").replace(/\/+$/, "") + "/v1/tasks/" + encodeURIComponent(ctx.upstreamTaskId) + "/artifacts/" + encodeURIComponent(ctx.artifactKey) + "/content",
      method: (ctx.clientRequest && ctx.clientRequest.method) || "GET",
      headers: { Authorization: "Bearer " + ctx.apiKey },
    };
  }
  if (ctx.artifactKey !== "image") throw new Error("artifact_not_found");
  let url = "";
  if (trimmed(ctx.upstreamTaskId)) {
    try {
      const response = utils.fetch({ url: pollingURL(Object.assign({}, ctx, { taskId: ctx.upstreamTaskId })), headers: queryHeaders(ctx) });
      if (response.status === 200) url = sampleURL(response.body);
    } catch (_error) {
      url = "";
    }
  }
  if (!url) url = sampleURL(ctx.data);
  if (!url) throw new Error("artifact_not_found");
  return { url: url, method: ctx.clientRequest.method, credentialless: true };
}

function sizeParts(size) {
  const parts = trimmed(size).toLowerCase().replace("*", "x").split("x");
  const width = Number(parts[0]);
  const height = Number(parts[1]);
  if (parts.length !== 2 || !Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw new Error("size must be WIDTHxHEIGHT or auto");
  return { width: width, height: height };
}

function greatestDivisor(a, b) {
  return b ? greatestDivisor(b, a % b) : a;
}

// Scales a size into the FLUX1.1 [pro] / FLUX.1 [dev] box: 256 to 1440 pixels
// per side, multiples of 32.
function fluxOneSize(width, height) {
  const scale = Math.min(1, 1440 / Math.max(width, height));
  const fit = function (side) {
    return Math.max(256, Math.min(1440, Math.round((side * scale) / 32) * 32));
  };
  return { width: fit(width), height: fit(height) };
}

// size from the OpenAI Images API, in the field each model takes.
function applySize(source, size, model) {
  if (!given(size) || trimmed(size).toLowerCase() === "auto") return;
  const sides = sizeParts(size);
  const family = familyOf(model);
  if (family === "flux3" || family === "flux2") {
    if (present(source.width) || present(source.height) || present(source.resolution)) return;
    source.width = sides.width;
    source.height = sides.height;
  } else if (KONTEXT_MODELS.includes(model) || model === "flux-pro-1.1-ultra") {
    if (present(source.aspect_ratio)) return;
    const divisor = greatestDivisor(sides.width, sides.height);
    source.aspect_ratio = sides.width / divisor + ":" + sides.height / divisor;
  } else if (model === "flux-pro-1.1" || model === "flux-dev") {
    if (present(source.width) || present(source.height)) return;
    Object.assign(source, fluxOneSize(sides.width, sides.height));
  } else {
    throw new Error("size is not supported on " + model + "; the output keeps the input image's size");
  }
}

// Images for an edit, in the fields each model takes.
function applyImages(source, images, mask, model) {
  const family = familyOf(model);
  if (mask !== undefined && model !== "flux-pro-1.0-fill") throw new Error("mask is only supported on flux-pro-1.0-fill");
  if (family === "flux3") {
    source.images = images;
  } else if (family === "flux2" || KONTEXT_MODELS.includes(model)) {
    const names = inputImageNames(family === "flux2" ? (/klein/.test(model) ? 4 : 8) : 4);
    if (images.length > names.length) throw new Error(model + " takes at most " + names.length + " images");
    images.forEach(function (image, index) {
      source[names[index]] = image;
    });
  } else if (model === "flux-pro-1.0-fill") {
    if (images.length !== 1) throw new Error("flux-pro-1.0-fill takes one image");
    source.image = images[0];
    if (mask !== undefined) source.mask = mask;
  } else {
    // FLUX1.1 [pro], Ultra and [dev] take one image prompt to remix.
    if (images.length !== 1) throw new Error(model + " takes one image, used as its image prompt");
    source.image_prompt = images[0];
  }
}

const OPENAI_FIELDS = ["model", "prompt", "n", "size", "response_format", "user", "image", "images", "mask", "quality", "style", "background", "moderation", "output_compression", "output_format"];
// BFL fields a client may add on the OpenAI Images API.
const VENDOR_FIELDS = [
  "aspect_ratio",
  "resolution",
  "width",
  "height",
  "grounding",
  "seed",
  "steps",
  "guidance",
  "safety_tolerance",
  "prompt_upsampling",
  "disable_pup",
  "raw",
  "image_prompt_strength",
];

// The OpenAI Images API: prompt, size, n (1), output_format and user, plus
// BFL's own fields. An edit's images are the references, the image being
// edited first; flux-pro-1.0-fill takes one image and an optional mask.
function openAIImageRequest(req, operation, images, mask, model) {
  for (const key of Object.keys(req)) {
    if (!OPENAI_FIELDS.includes(key) && !VENDOR_FIELDS.includes(key) && present(req[key])) throw new Error(key + " is not supported");
  }
  if (given(req.n) && Number(req.n) !== 1) throw new Error("n must be 1; BFL returns one image per request");
  for (const key of ["quality", "style", "background", "moderation", "output_compression"]) {
    if (given(req[key]) && trimmed(req[key]).toLowerCase() !== "auto") throw new Error(key + " is not supported");
  }
  const source = { prompt: req.prompt };
  for (const key of VENDOR_FIELDS) {
    if (present(req[key])) source[key] = req[key];
  }
  if (given(req.output_format)) source.output_format = trimmed(req.output_format).toLowerCase() === "jpg" ? "jpeg" : req.output_format;
  if (given(req.user)) source.user = req.user;
  if (operation === "edit") {
    if (!images.length) throw new Error("image is required");
    applyImages(source, images, mask, model);
  } else {
    if (images.length || mask !== undefined) throw new Error("images are only valid on /v1/images/edits");
    if (model === "flux-pro-1.0-fill") throw new Error("flux-pro-1.0-fill edits an image; use /v1/images/edits");
  }
  applySize(source, req.size, model);
  return bflRequest(source, model);
}

function protocolModel(ctx) {
  try {
    return upstreamModel({ upstreamModel: ctx.upstreamModel, model: ctx.model });
  } catch (_error) {
    return trimmed(ctx.model);
  }
}

// An OpenAI image given as a URL string, {image_url}, {url} or base64.
function openAIImage(value) {
  const object = plainObject(value);
  if (object && present(object.image_url)) return typeof object.image_url === "string" ? object.image_url : plainObject(object.image_url) ? object.image_url.url : object.image_url;
  if (object && present(object.url)) return object.url;
  return value;
}

// Multipart text fields, each given once.
function formFields(body) {
  const req = {};
  const fields = body.fields || {};
  for (const name of Object.keys(fields)) {
    if (fields[name].length > 1) throw new Error(name + " must be provided once");
    const value = fields[name][0];
    // Numbers and booleans arrive as text in a form.
    if (/^-?\d+(\.\d+)?$/.test(value) && VENDOR_FIELDS.includes(name)) req[name] = Number(value);
    else if ((value === "true" || value === "false") && VENDOR_FIELDS.includes(name)) req[name] = value === "true";
    else req[name] = value;
  }
  return req;
}

function uploadedImage(file, name) {
  if (!/^image\//.test(file.mimeType || "")) throw new Error(name + " must be an image");
  return { __fileRef: file.ref, encoding: "base64" };
}

export const protocols = {
  openai_image: {
    decodeRequest: function (ctx) {
      if (!ctx.body || (ctx.body.kind !== "json" && ctx.body.kind !== "multipart")) throw new Error("JSON or multipart body required");
      const operation = ctx.operation === "edit" ? "edit" : "generate";
      let req;
      let images = [];
      let mask;
      if (ctx.body.kind === "json") {
        req = plainObject(ctx.body.value);
        if (!req) throw new Error("JSON object required");
        if (present(req.images)) {
          if (!Array.isArray(req.images)) throw new Error("images must be an array");
          images = req.images.map(openAIImage);
        }
        if (present(req.image)) images = (Array.isArray(req.image) ? req.image : [req.image]).map(openAIImage).concat(images);
        if (present(req.mask)) mask = openAIImage(req.mask);
      } else {
        req = formFields(ctx.body);
        for (const file of ctx.body.files || []) {
          if (file.field === "image" || file.field === "image[]") images.push(uploadedImage(file, "image"));
          else if (file.field === "mask") {
            if (mask !== undefined) throw new Error("mask must be provided once");
            mask = uploadedImage(file, "mask");
          } else throw new Error("unexpected file field: " + file.field);
        }
        if (given(req.image)) images.unshift(req.image);
        if (given(req.mask)) {
          if (mask !== undefined) throw new Error("mask must be provided once");
          mask = req.mask;
        }
      }
      const request = openAIImageRequest(req, operation, images, mask, protocolModel(ctx));
      return submitIntent(ctx.model, request);
    },
    render: function (ctx, task) {
      const url = sampleURL(task.data);
      return { data: url ? [{ url: url }] : [] };
    },
  },
};
