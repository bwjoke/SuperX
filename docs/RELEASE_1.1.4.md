# 1.1.4 video-cover input fix

Local candidate, October 28, 2026. Public release channels remain unchanged.

## Confirmed failure

Two checks on the new X profile layout returned HTTP 400 with `API_IMAGE_INPUT` / `invalid_image`:

- `https://x.com/abdullababakre/status/2112971597648978044`: own video cover.
- `https://x.com/abdullababakre/status/2115171376357421120`: video cover in the quoted post, `https://x.com/rebryk/status/2115126244782248363`.

Both native covers are extensionless `pbs.twimg.com/amplify_video_thumb/...` URLs using `format=webp`. Unauthenticated HTTP checks found the native URLs returned 200 / image/webp, while the former request builder stripped their query and produced 404 responses. The same paths with `format=jpg&name=orig` returned 200 / image/jpeg with matching JPEG file signatures. Evidence: `artifacts/image-input-20261028/diagnosis.json`.

## Fix and verification

The common request builder now selects an explicit JPEG rendition for WebP video covers, keeping their required format and fixed size. This applies to API Key, subscription and local Build, including main posts, nested quotes and draft reply context. Existing JPEG/PNG handling and removal of arbitrary query parameters are preserved. No automatic retries, missing-image fallback or new permissions were added.

- 1,306 unit/contract checks, syntax and package validation passed.
- Media-input suite: 35 passed. Added the two actual URL shapes for API/OAuth, main and quoted posts, reply context, and the local Build image-loading path.
- The public-CDN checks above did not access account credentials or call a model. Successful CDN loading is separate from installed-provider acceptance.

Candidate ZIP: `artifacts/preview-1.1.4-video-cover/SuperX-1.1.4.zip`, SHA-256 `b594ab34408be3984db943b9a6f4b1e7307fe559bb8ba84027f8f0727ef95704`.

## Installed acceptance

After the maintainer reloaded 1.1.4, direct DOM inspection of the same author page confirmed both original failures completed with sourced answers and no `invalid_image` error. The first post reported 13,153 tokens; the second, including its quoted video, reported 28,603 tokens. Both answer cards had `aria-busy="false"`. No detail page was opened to obtain these results and the agent did not issue an additional model retry.

Evidence: `artifacts/preview-1.1.4-video-cover/live-20261028/acceptance.json` and `profile-success.png`.

Existing 1.1.3 and earlier archives remain unchanged. This candidate has not been published to GitHub or the Chrome Web Store.
