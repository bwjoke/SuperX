# SuperX 1.1.6 — Timeline return stability

Approved for GitHub Stable/Latest publication by the maintainer on October 31, 2026, after the installed spacing acceptance recorded below. Publication and workflow results are pending at this source snapshot. Chrome Web Store remains at 1.1.5; the 1.1.6 upload has not been submitted. Existing tags and archives remain unchanged.

Accepted installation ZIP: `SuperX-1.1.6.zip`, SHA256 `81bc9a9c745c30e8e68e0ee8923e48e8c85b2e6a10ab32ca651cefc9df70ca9e`. Use these same bytes for GitHub and the Chrome Web Store. Independent in-memory rebuilding confirmed all 52 packaged files match the accepted archive.

The maintainer reported vertical timeline movement after opening a post detail and returning, only with Custom mode enabled. An automated installed Chrome inspection could not complete because the computer-use app approval timed out; the reproduction measurements below come from isolated Chromium fixtures. The maintainer subsequently installed the first 1.1.6 candidate and confirmed that return navigation no longer shook the timeline, while reporting a vertically misplaced button on the detail page.

## Reproduced causes

- In a constrained native action group, inserting a third flex item beside Grok/More wraps the group from 32px to 68px. A real History API back/forward fixture moved the timeline by 33px on the first return and accumulated 66px after another return. The same fixture had no drift with the post button disabled, Automatic mode or Pause.
- The previous minimum hitbox sizes enlarged native 16px and 20px rows. Small-control fixtures reproduced 48px to 192px of accumulated drift across returns. The fixtures send no real provider requests.

## Changes

Keep the native action group intact by mounting SuperX beside the group in the outer header row. Only SuperX's own logical margins are adjusted to follow the native spacing and row direction. Its measured width and height are set before insertion, with no imposed 20px/24px minimum. Zero-sized native controls wait until they can be measured. Only the SuperX host is excluded from scroll-anchor selection.

No window scroll position, `history.scrollRestoration`, document-wide scroll anchoring, or native X styles are overridden. Existing cached answers and user-triggered checks retain their existing behavior. Installed-browser verification is still required for the maintainer's exact X layout.

## Verification

- 1,354 local unit/contract checks passed; 69 JavaScript files passed syntax validation. Added cases cover small/fractional controls, zero-sized hydration, visible More fallback when legacy Grok is hidden, keeping the native action group intact in normal/reversed rows, native icon alignment in tall headers, and placement after a preceding subscription control, including nested action groups.
- 134 isolated Chromium detail-header checks across 16 old/new X scenarios passed. SuperX and Grok have the same measured vertical center in every case, including top/center alignment, Subscribe/Follow controls, nested groups, RTL and reversed rows. Native action groups and header heights remain unchanged. Four old/new detail screenshots were inspected.
- The corrected detail candidate also passed 66 small-control/focus checks and reran all 162 history/layout checks below, with no page errors or external requests.
- 162 isolated Chromium layout checks across 20 scenarios passed, covering both X structures, constrained wrapping action groups, narrow long-author layouts, RTL and row-reverse. Before/after history navigation, the candidate preserves the target post position and native action-group dimensions, with no extra document overflow or model requests. The final browser run recorded zero page errors and zero external requests; an earlier 18-check screenshot run confirmed the same before/after position.
- Existing first-use guide checks: 98 passed with no browser errors or external requests. The guide, click and hover behavior remain available after moving the control.

The candidate is local and unpublished. The GitHub and Chrome Web Store 1.1.5 tag and installation files remain unchanged.

The first installer, `artifacts/preview-1.1.6-back-navigation/SuperX-1.1.6.zip`, remains preserved. The updated candidate is packaged separately under `artifacts/preview-1.1.6-detail-button/`. Reload the developer installation and refresh X; check both detail-button alignment and repeated detail/back navigation. Do not enable a store copy and unpacked copy simultaneously. The maintainer's installed return-navigation check passed; the revised detail alignment still needs installed-browser confirmation.

## Detail-header alignment correction

Moving the control out of the native action group left it with `align-self:center`. In a two-line author header with top-aligned native actions, that centers SuperX against the whole author area rather than against Grok. The maintainer's screenshot confirms this regression in the first local candidate.

The outer control now follows Grok's measured vertical center, accounting for the header's border/padding. Its offset is bounded by the existing content height so it cannot enlarge the row. If a native Subscribe/Follow control precedes Grok, the SuperX button keeps its original position immediately before Grok instead of moving before the whole action strip. Version remains 1.1.6, unpublished.

## Post-header logo proportions

After installing the aligned candidate, the maintainer reported that the SuperX logo still looked slightly smaller than Grok. The symbol has a 35×33 viewBox and artwork bounds of approximately 34.273×32. Containing it in a 20px square yields a painted area of approximately 19.584×18.286px; matching icon boxes alone does not match the visual proportions. This can explain the perceived difference, although the exact native icon has not been measured in the maintainer's current page.

Apply a modest 1.05 paint transform to the post-header logo and its countdown layer, multiplying the existing hover transform. Do not change the host, button hitbox, halo, offsets, shared SVG artwork, draft button or sidebar logo. The prior alignment candidate remains preserved; the revised local archive is `artifacts/preview-1.1.6-post-logo/SuperX-1.1.6.zip`.

The revised candidate passed 1,354 unit/contract checks and 69 syntax checks. Isolated Chromium verification passed 230 detail/optical checks, 90 small-control/focus checks and 222 history/layout checks. Normal and hovered logo layers retain the same centers and paint scale, while native hitboxes, header heights and return positions remain unchanged. These fixture runs made no external or model requests; visual size in the maintainer's installed X page still needs confirmation.

## Balanced spacing around native subscription controls

The maintainer reported that Subscribe detail headers felt crowded while headers without Subscribe felt too loose. The previous mount paths inherited different spacing: a flat subscription strip kept its own narrow gap, while a button mounted in the outer author header inherited a larger gap. The outer path could add positive spacing but could not reduce that larger gap.

The first spacing revision used a common 4–6px hitbox gap. It passed geometry checks but still looked crowded: the native More dots occupy less of their SVG box than Grok. Matching hitbox gaps did not match the visible whitespace. The maintainer explicitly selected native Grok-to-More whitespace as the reference.

The final revision reads the native Grok and More SVG painted bounds, maps their viewBoxes into unhovered CSS dimensions and uses their visible gap for SuperX-to-Grok and Subscribe-to-SuperX spacing. It accounts for the approved SuperX mark's bounds and 1.05 paint scale. If SVG bounds are unavailable, it uses the native button gap; only a missing native peer uses the conservative fallback. Signed logical margins compensate native parent gaps, margins and empty leading insets. Author-row auto spacing, native control dimensions and vertical alignment remain unchanged. Distributed rows retain their pre-insertion measurement to avoid feedback from the added control.

The final fixture uses the actual Grok paths and a narrower three-dot More icon. Its eight old/new X layouts cover no CTA, flat/nested Subscribe, native margins and padded hitboxes: 114 checks passed, with visible-gap error below 0.006px. The earlier fixed-gap candidate failed 14 of these checks. Final small-control/history checks passed 66 checks with zero scroll drift, header growth or new generation requests. The current source also passed all 1,354 unit/contract checks and 69 syntax checks.

The guard against crossing another native button remains in place: only unoccupied leading space can be compensated. All browser fixture runs reported zero page errors or external requests. Earlier candidate archives and reports remain preserved. The final local package is `artifacts/preview-1.1.6-native-button-spacing/SuperX-1.1.6.zip`.

On October 31, 2026, after reloading this candidate, the maintainer confirmed that the spacing in the feed and post detail now matches the native controls ("现在一致了"). This completes the installed visual acceptance for the spacing correction. The previously recorded installed return-navigation result and the final candidate's automated history checks remain separate evidence. Version stays at 1.1.6; no GitHub or store publication was performed. The tested installation archive is unchanged (SHA256 `81bc9a9c745c30e8e68e0ee8923e48e8c85b2e6a10ab32ca651cefc9df70ca9e`); this acceptance update only changes the local record.
