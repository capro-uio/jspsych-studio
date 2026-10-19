# Tachisto brand book

Tachisto builds jsPsych experiments without code. It is named after the tachistoscope, the lab instrument that showed a stimulus for an exact number of milliseconds. The brand borrows from that world: a fixation cross, timed exposure, and a calm, precise lab bench where the participant's stimulus is the only loud thing.

**One rule above the rest:** `stimulus` vermilion is the stimulus. It marks what is shown, what is active, and what runs. Everything else stays quiet in `ink` on `paper`.

## Voice and copy

- Write for researchers who do not code: psychology students, lab managers, clinicians. Use the field's own words (trial, block, stimulus, fixation, inter-trial interval, response key, counterbalancing) and avoid developer words (config, payload, JSON object, callback) unless the screen is the code view.
- Address the user as "you". The product speaks as "Tachisto" only in system messages ("Tachisto saved your experiment").
- Sentence case everywhere: buttons, headings, menu items. Uppercase appears only through the `label` style.
- Buttons say exactly what happens: "Add trial", "Preview experiment", "Export to jsPsych". The toast confirms in the past tense: "Exported".
- Durations always carry a unit and a space: "500 ms", "60 Hz", "2 s". Set them in `timing`.
- Errors say what went wrong and how to fix it: "This trial is 8 ms long, but a 60 Hz screen can only show 16.7 ms frames. Set it to 17 ms or more."
- No emoji, no exclamation marks, no "Oops".

## Logo

The logo is the word **tachisto**. Its first t is drawn as a fixation cross (`stimulus`) on a hooked tail (`ink`). The second t uses the same hooked shape, entirely in `ink`. The first t is enlarged and drops below the baseline like a drop cap.

- Use `tachisto-wordmark.svg` on `paper` and `paper-raised` in light, and `tachisto-wordmark-dark.svg` in dark. Never recolour the files, set them in a font, or rebuild the t from a "+" glyph.
- Use the icon (`tachisto-icon.svg`, the t alone) where the wordmark is narrower than 120px wide: the app header at small widths, browser tabs, the loader. Use `tachisto-app-icon.svg` (on a tile) only where a platform wants a square: PWA manifest, social cards.
- `favicon.svg` follows the browser's colour scheme by itself.
- Clear space around the mark equals the width of the cross arm on every side.
- The cross arms are equal. Never stretch the vertical arm: an elongated cross reads as a religious symbol, not a fixation cross.
- `tachisto-loader.svg` and `tachisto-wordmark-animated.svg` animate only the first t: stimulus (vermilion), then mask (`mask` grey), then blank, every `duration-cycle`. Use them for loading and while an experiment preview starts. They fall back to a still vermilion cross for users who prefer reduced motion. Never animate the second t.

## Colour

- `paper` is the ground. Panels and sidebars sink into `paper-sunk`; trial cards and dialogs rise on `paper-raised`. Separate them with `line`, not shadows.
- Text is `ink`, with `ink-muted` for secondary text and `ink-subtle` for placeholders. `ink-subtle` never goes on `paper-sunk`.
- `stimulus` is for graphics: the cross, the playhead, the active trial's edge, stimulus blocks on the timeline. When vermilion must be text, use `stimulus-text`. A filled vermilion surface is `stimulus-fill` with `on-stimulus` text.
- Spend vermilion sparingly: one primary button per view, one active item per list. If a screen has three vermilion things, two are wrong.
- `mask` marks masks, blanks and intervals on the timeline, mirroring the logo animation.
- `signal` (blue-teal) is the focus ring and success colour. `caution` and `danger` always come with an icon and a word. `danger` sits near `stimulus` in hue, so never let colour alone say "error".

## Type

- `display` family (Jost) for headings and the experiment title only. It is the logo's face.
- `sans` family (Atkinson Hyperlegible) for all UI and running text. It was designed for low-vision readers, which suits a tool that builds screens for participants.
- `mono` family (IBM Plex Mono) for durations (`timing`) and code (`code`). Use tabular figures (`font-variant-numeric: tabular-nums`) wherever numbers line up.
- All three load from Google Fonts: `family=Jost:wght@500&family=Atkinson+Hyperlegible:wght@400;700&family=IBM+Plex+Mono:wght@400;500`.
- Keep running text near 65 characters wide. Headings get `text-wrap: balance`.

## Space, shape and depth

- Spacing follows a 4px grid: `space-1` through `space-12`. Panels use `space-8` on desktop and `space-4` on phones.
- Corners stay tight: `radius-sm` for timeline blocks and tags, `radius-md` for buttons, inputs and cards, `radius-lg` only for dialogs and the app tile. Nothing is pill-shaped.
- `shadow-pop` is for things that float above the page (menus, popovers, dialogs). Everything else is flat, separated by `line`.

## Motion

- Motion should feel like a shutter, not a swoosh. Anything that stands for a stimulus switches in steps, with no easing or fading.
- UI hover and press states transition over `duration-ui`.
- Respect `prefers-reduced-motion`: replace animation with the end state.

## Iconography

- Use Lucide icons (outline, 1.5px stroke, 20px in the UI, 16px inline), coloured `ink` or `ink-muted`. Lucide is a substitute until Tachisto has its own set.
- The fixation cross is the brand's own glyph. Use it for empty states ("Add your first trial") and the "Preview" action. Draw it with equal arms, in `stimulus`.
- No emoji anywhere in the product.

## Applying it

The next section maps these rules onto Tachisto's screens: header, timeline, trial cards, forms, preview and empty states.

## Applying to the app

How to rebrand Tachisto's current generic UI. Work through it screen by screen, replacing hard-coded colours, fonts and radii with the tokens in this system. Use them as CSS custom properties (`var(--paper)`, `var(--space-4)`) from `brand/tokens.css`, or mirror the same names in the app's theme file. Never copy hex values into components.

### Global setup

- Load the three Google Fonts families listed under Type, and set `body` to the `body` style on `paper` in `ink`.
- Theme: the light theme is the default. Switch to dark by setting `data-theme="dark"` on `<html>`, and follow `prefers-color-scheme` when the user has not chosen a theme.
- Focus: every interactive element shows a 2px solid `signal` outline with a 2px offset on `:focus-visible`. Never remove outlines without this replacement.
- Replace the favicon with `favicon.svg` and the page title prefix with "Tachisto".

### App header

- Height 56px, `paper` background, a `line` bottom border.
- Left: the wordmark at 28px tall (the icon alone below 480px viewport width), linking to the experiment list.
- Centre or left after the logo: the experiment name in `heading-3`. It is editable in place, with `line-strong` underline on hover.
- Right: secondary actions as quiet buttons, then a single primary button, "Preview experiment".

### Buttons

- Primary: `stimulus-fill` background, `on-stimulus` text in `body-strong`, `radius-md`, padding `space-2` × `space-4`. One per view.
- Secondary: transparent background, `ink` text, 1px `line-strong` border.
- Quiet (toolbar, icon buttons): no border, `ink-muted` icon, `paper-sunk` on hover.
- Destructive: secondary style with `danger` text and a trash icon. The confirm step inside the dialog uses a `danger` fill with `paper` text.
- Disabled: `ink-subtle` text, `line` border, no fill. Never lower opacity on the whole button.

### Timeline (the editor's core)

- The track sits on `paper-sunk`, with `radius-md` corners and `space-3` padding.
- Blocks are `radius-sm` rectangles, each sized in proportion to its duration whenever durations are known:
  - Fixation: `paper-raised` block with a small `ink` cross.
  - Stimulus: `stimulus-fill` fill, with `on-stimulus` label text set in `label`. Plain `stimulus` is too light for white text in light theme.
  - Mask, blank, inter-trial interval: `mask` fill, `ink` label.
  - Response or untimed: `paper-raised` with a dashed `line-strong` border, labelled "Until response".
- The duration sits under each block in `timing`, `ink-muted` ("500 ms").
- Selection: a 2px `ink` outline. The selected trial's card in the side list gets `stimulus-tint`.
- The playhead during preview is a 2px `stimulus` line.

### Trial cards and lists

- `paper-raised` cards, 1px `line` border, `radius-md`, padding `space-4`. No shadows and no coloured left-border stripes.
- Title in `heading-3`, plugin name in `code` and `ink-muted` (for example `html-keyboard-response`), summary in `body-sm`.
- The drag handle is a quiet icon button on the left. While dragging, the card gets `shadow-pop`.

### Forms (trial settings panel)

- Labels use the `label` style (uppercase via CSS) in `ink-muted`, placed above the field with a `space-1` gap.
- Inputs: `paper-raised`, 1px `line-strong` border, `radius-md`, `body` text, padding `space-2` × `space-3`. On focus, the `signal` ring.
- Duration fields are numeric inputs in `timing` with a fixed "ms" suffix inside the field. Under them in `body-sm` `ink-muted`, show the equivalent in frames at the detected refresh rate: "≈ 30 frames at 60 Hz".
- Validation: `danger` text and icon under the field, plus a 1px `danger` border. Never colour alone.
- Group related settings under `heading-3` titles with `space-6` between groups.

### Preview mode

- The preview runs full-bleed on the participant's own background (usually white or black, as set in the experiment). No Tachisto chrome appears inside the participant view.
- Outside it, a thin bar on `paper-sunk` holds the exit button and the trial counter in `timing` ("Trial 12 of 80").
- While the experiment loads, show `tachisto-loader.svg` centred at 48px.

### Empty states

- Centre a 64px fixation cross in `stimulus` with a `heading-2` line ("No trials yet") and one primary button ("Add trial").
- Never use illustrations or emoji.

### Tables (results, participant lists)

- Header row on `paper-sunk` in `label` style, body rows in `body-sm`, with `line` separators between rows.
- Numbers right-aligned in `timing`.

### Toasts and status

- Toasts appear bottom-left on `ink` with `paper` text (an inverted surface), `radius-md`, auto-dismissed after 4 s. Success shows a check icon in `signal`.
- Unsaved changes: a `caution` dot plus "Unsaved" in `body-sm` beside the experiment name.
