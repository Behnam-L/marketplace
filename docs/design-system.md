# Bon design system — agentic coding contract

Version 1.0 · Rewritten 2026-09-29 · Scope: Bon product interfaces and interactive prototypes.

Source: [Bon Design System](https://www.figma.com/design/Mlk08T6Iny0F8pUdk1AhNd/Bon-Design-System). Evidence dates: base extraction 2026-09-21, effects/grids 2026-09-26, saved-property audit 2026-09-27. This rewrite adds implementation policy, not new Figma verification. Append `?node-id=ID` to the source URL, replacing `:` in a node ID with `-`.

## 1. Start here

Treat this file as project design guidance within the task's governing instructions. **MUST** means required by this coding contract; **SHOULD** is the default unless the brief or existing project supplies a reason to differ.

| Read | When |
| --- | --- |
| §1–2 | Every UI task: authority, workflow, product decisions |
| §3 | Only foundations needed by the change; §3.5 defines code mapping |
| §4 | Only relevant component families |
| §5 | When choosing or exporting assets |
| §6–7 | Implementation behavior and completion checks |
| §8 | When required source evidence is missing |

### Evidence and decisions

| Label | Meaning | Agent action |
| --- | --- | --- |
| Verified | Retrieved source tokens, properties, or guidance | Preserve names, values, and documented exceptions |
| Observed | Measurements of specific sampled variants | Use for those samples; do not generalize to all states |
| Recommended | Implementation policy or adapter convention | Apply when the project has no established equivalent; do not claim official Bon provenance |
| Unverified | Missing or inaccessible source evidence | Follow §8; never invent a verified specification |

Unlabelled foundation tables and component option lists are verified within the stated snapshot coverage. Code naming, workflow, accessibility behavior, and fintech implementation rules are Recommended policy unless explicitly attributed to Figma.

**Decision order:** respect the user's task and project instructions; inspect existing component implementations and any current screen reference; apply verified Bon specifications; then use an explicit local fallback. A current screen may intentionally override a library value—preserve and report the difference. Existing code alone does not prove Bon fidelity. No official Bon code package or Code Connect mapping has been established.

**Defaults when unspecified:** Persian RTL, mobile first, Light theme, Baseline font theme, fluid layout with a 412 px reference viewport. These are prototype defaults, not fixed dimensions or inferred financial business rules.

### Agent task prompt

```text
Implement the requested feature using design-system.md.
Inspect project instructions, scripts, tokens, components, assets, and data contracts first.
Reuse existing code; map only the Bon foundations and components needed for this task.
Build the smallest complete user flow with explicit state and recovery behavior.
Use verified source values; identify every material approximation or missing asset.
Validate the implementation using §7 and report only checks actually performed.
Deliver working code and a concise summary of changes, assumptions, and remaining gaps.

Feature / user goal:
Screens and entry/completion points:
Business rules and data source:
Reference nodes / screenshots:
Language / currency unit / calendar / timezone:
Required themes and devices:
Prototype or production integration:
```

## 2. Execution workflow and product decisions

1. **Discover.** Read repository instructions and relevant code. Identify framework, package manager, routes, styling system, shared controls, theme mechanism, fonts/assets, and available validation commands. Use the existing architecture; do not install a new UI kit or replace the styling stack merely to match this guide.
2. **Define the flow.** State the user goal, dominant action, completion signal, and likely failure. Map each needed control to an existing implementation and a §4 source family. List only consequential unknowns. Ask when an unknown changes real monetary meaning, eligibility, authorization, or an irreversible action; otherwise continue with labelled mock data and documented assumptions.
3. **Establish foundations.** Add only missing token mappings using §3.5. Preserve semantic roles across themes and keep values in one source. Load supplied fonts and local assets; surface missing ones before claiming fidelity.
4. **Implement a vertical slice.** Build one complete path through data, reusable controls, screen composition, and outcome. Keep transaction/business logic separate from visual components. Add relevant loading, empty, error, pending, and recovery states before decorative polish.
5. **Inspect and refine.** Run the relevant project checks; inspect the actual rendered layout and interaction states. Compare with source screenshots if supplied. Correct concrete failures, then deliver with the concise report in §7.

### Mobile-first fintech design rules

- Give each screen one purpose and one dominant next action. Order content by the user's decision: orientation → amount/status → required input → supporting detail → action. Use lists for repeated records; cards only for meaningful grouping or independent interaction.
- Start with a fluid column. Use a full screen for long forms or consequential review, a sheet for a short contextual choice, and a dialog for an interruptive decision. Persistent bottom actions must reserve content space and remain usable with safe areas and an open keyboard.
- Use calm, specific Persian copy and explicit action labels. Keep field labels visible, preserve safe back-navigation input, and show actionable errors beside their fields. Do not use decorative gradients, glass, large radii, or shadows without a source reason.
- Distinguish available balance, current balance, credit limit, amount due, and transfer amount. Before commitment, show the supplied recipient/destination, amount, fee, total debit, source, and timing. Permit correction without restarting. Do not invent rates, limits, approval guarantees, or fees.
- A money-movement flow may need details → review → authorization → processing → outcome. Add only steps required by the feature. A timeout after submission is an unknown result, not proof of failure; provide status recovery before another attempt.
- Include only relevant exceptional states: insufficient balance, limit reached, expired authorization, session interruption, or pending transaction. Demo data and simulated actions must be identifiable; never request real passwords or OTPs for a prototype.
- Build hierarchy with type roles, spacing, alignment, and restrained emphasis. Review whether the user can identify the amount, destination, next action, and outcome. Keep state, selection, validation, and theme independent.

## 3. Foundations

### 3.1 Color and state

Collections: Color has Light/Dark modes; Font theme has Baseline/Wireframe; Typescale and Corner have Baseline; Primitives and Spacing each have one mode. Resolved semantic colors below are the implementation reference; the raw primitive catalogue is omitted to keep agent context focused.

Recommended usage: Primary for key actions; Secondary for supporting accent; Surface/Container for surfaces; On Surface for main text; On Surface Variant for supporting text; Outline/Outline Variant for borders; Error/Success/Warning for matching feedback. Pair a surface role with its matching `On …` foreground. Keep semantically different tokens separate even when their current values match. No tertiary role was found.

Prefix names below with `Schemes/`, except `Add-ons/Section background`. Hex alpha uses `#RRGGBBAA`; actual values take precedence over an `a95` name.

| Role | Light | Dark |
| --- | --- | --- |
| Primary | #3e69e0 | #8da8ff |
| Surface Tint | #3e69e0 | #b5c4ff |
| On Primary | #ffffff | #00297a |
| Primary Container | #eff0ff | #003cac |
| On Primary Container | #00174d | #dbe1ff |
| Secondary | #d2e92f | #bcd20b |
| On Secondary | #191e00 | #2d3400 |
| Secondary Container | #f7ffbc | #424b00 |
| On Secondary Container | #191e00 | #d2e92f |
| Error | #ba1a1a | #ffb4ab |
| On Error | #ffffff | #690005 |
| Error Container | #ffdad6 | #93000a |
| On Error Container | #410002 | #ffdad6 |
| Background | #faf8ff | #11131a |
| On Background | #1a1b23 | #e2e1ec |
| Surface | #faf8ff | #080b15 |
| On Surface | #1a1b23 | #e2e1ec |
| Surface Variant | #e0e1f2 | #434654 |
| On Surface Variant | #434654 | #c3c6d6 |
| Outline | #747685 | #8d909f |
| Outline Variant | #e0e1f2 | #5b5e6c |
| Shadow | #000000 | #000000 |
| Scrim | #000000 | #000000 |
| Inverse Surface | #2e3038 | #e2e1ec |
| Inverse On Surface | #f0f0fa | #2e3038 |
| Inverse Primary | #b5c4ff | #2555cc |
| Primary Fixed | #dbe1ff | #dbe1ff |
| On Primary Fixed | #00174d | #00174d |
| Primary Fixed Dim | #b5c4ff | #b5c4ff |
| On Primary Fixed Variant | #003cac | #003cac |
| Secondary Fixed | #d2e92f | #d2e92f |
| On Secondary Fixed | #191e00 | #191e00 |
| Secondary Fixed Dim | #bcd20b | #bcd20b |
| On Secondary Fixed Variant | #424b00 | #424b00 |
| Surface Dim | #d9d9e3 | #080b15 |
| Surface Bright | #ffffff | #1e212c |
| Surface Container Lowest | #ffffff | #02030b |
| Surface Container Low | #faf8ff | #141722 |
| Surface Container | #ededf7 | #141722 |
| Surface Container High | #e8e7f2 | #1a1d28 |
| Surface Container Highest | #e2e1ec | #222530 |
| Add-ons/Section background | #f4f6ff | #000000 |
| Success | #006d38 | #71dc92 |
| On Success | #ffffff | #00391a |
| Success Container | #8df9ac | #005229 |
| On Success Container | #00210d | #8df9ac |
| Warning | #825500 | #ffb94f |
| On Warning | #ffffff | #452b00 |
| Warning Container | #ffddb3 | #624000 |
| On Warning Container | #291800 | #ffddb3 |
| Inverse Surface-a95 | #2e3038fa | #e2e1ecf2 |
| Surface Bright-a95 | #fffffff2 | #1e212cfa |
| Surface Container a95 | #fffffff2 | #1e212cfa |
| Success Low | #54c079 | #098949 |
| Error Low | #ff897d | #de3730 |
| Warning Low | #e89c00 | #a36c00 |

#### State layers

Each standard family below has `State Layers/{family}/Opacity-08`, `Opacity-10`, and `Opacity-16`: apply its base RGB at 8%, 10%, or 16%. `= role` means the corresponding scheme value in that mode at this snapshot; state layers remain independent tokens, not live aliases. This avoids duplicating identical hex values while preserving source mismatches.

| Family | Light RGB | Dark RGB |
| --- | --- | --- |
| Primary | = role | #b5c4ff |
| On Primary | = role | = role |
| Primary Container | #dbe1ff | = role |
| On Primary Container | = role | = role |
| Primary Fixed | = role | = role |
| On Primary Fixed | = role | = role |
| Primary Fixed Dim | = role | = role |
| On Primary Fixed Variant | = role | = role |
| Secondary | = role | = role |
| On Secondary | = role | = role |
| Secondary Container | = role | = role |
| On Secondary Container | = role | = role |
| Secondary Fixed | = role | = role |
| On Secondary Fixed | = role | = role |
| Secondary Fixed Dim | = role | = role |
| On Secondary Fixed Variant | = role | = role |
| Error | = role | = role |
| On Error | = role | = role |
| Error Container | = role | = role |
| On Error Container | = role | = role |
| Outline | #767680 | #8f909a |
| Background | #fbf8fd | #131316 |
| On Background | #1b1b1f | #e4e2e6 |
| Surface | #fbf8fd | #131316 |
| On Surface | #1b1b1f | #e4e2e6 |
| Surface Variant | #e2e1ec | #45464f |
| On Surface Variant | #45464f | #c6c6d0 |
| Inverse Surface | #303034 | #e4e2e6 |
| Inverse On Surface | #f2f0f4 | #303034 |
| Inverse Primary | = role | = role |
| Shadow | = role | = role |
| Surface Tint | = role | = role |
| Outline Variant | #c6c6d0 | #45464f |
| Scrim | = role | = role |
| Surface Container Highest | #e4e2e6 | #343438 |
| Surface Container High | #eae7ec | #292a2d |
| Surface Container | #efedf1 | #1f1f23 |
| Surface Container Low | #f5f3f7 | #1b1b1f |
| Surface Container Lowest | = role | #0d0e11 |
| Surface Bright | #fbf8fd | #39393c |
| Surface Dim | #dbd9de | #131316 |

Special values: `State Layers/Scrim/Opacity-20` is black at 20% in both modes. `State Layers/Inverse Surface/Opacity-90` is `#303034` at 90% in Light and opaque white in Dark.

Recommended fallback when a component binding is unavailable: hover 8%, focus/press 10%, dragged 16%. Overlay the state layer rather than lowering whole-component opacity. Disabled opacity and focus-ring appearance remain unverified; the mapping is not a claim about every component.

### 3.2 Typography

Both Brand and Plain use **IRANYekanXFaNum**. Wireframe mode uses **Flow Circular**, which is unsuitable for readable product copy. `Static/Weight/Bold` resolves to **DemiBold**. Recommended CSS weights: Regular 400, Medium 500, DemiBold 600, subject to supplied font files. Do not invent font URLs or silently count a fallback font as a fidelity match.

All 30 retrieved styles have **0 px letter spacing**. The generic `Tracking/Small=0.1` variable does not override them. Each row represents a base style and its `-emphasized` counterpart; prefix the name with `Bon/`.

| Style | Size / line height px | Base / emphasized weight |
| --- | --- | --- |
| display/large | 57 / 64 | Regular / Medium |
| display/medium | 45 / 52 | Regular / Medium |
| display/small | 36 / 44 | Regular / Medium |
| headline/large | 32 / 40 | Regular / Medium |
| headline/medium | 28 / 36 | Regular / Medium |
| headline/small | 24 / 32 | Regular / Medium |
| title/large | 22 / 28 | Regular / Medium |
| title/medium | 16 / 24 | Medium / DemiBold |
| title/small | 14 / 20 | Medium / DemiBold |
| label/large | 14 / 20 | Medium / DemiBold |
| label/medium | 12 / 16 | Medium / DemiBold |
| label/small | 11 / 16 | Medium / DemiBold |
| body/large | 16 / 24 | Regular / Medium |
| body/medium | 14 / 24 | Regular / Medium |
| body/small | 12 / 20 | Regular / Medium |

Recommended selection: Display for large promotional statements; Headline for page/section headings; Title for smaller headings or row titles; Body for prose; Label for controls/metadata. Detailed mobile/web style guidance remains uninspected.

### 3.3 Spacing, corners, and responsive layout

Numeric Figma units map 1:1 to CSS px for prototypes. Token prefixes are `Spacing/` and `Corner/`; these are distinct scales.

| Spacing token | px |
| --- | --- |
| XXS | 2 |
| XS | 4 |
| SM | 6 |
| MD | 8 |
| LG | 12 |
| XL | 16 |
| 2XL | 20 |
| 3XL | 24 |
| 4XL | 32 |
| 5XL | 40 |
| 6XL | 48 |
| 7XL | 64 |
| 8XL | 80 |
| 9XL | 96 |
| 10XL | 128 |
| 11XL | 160 |

| Corner token | Value |
| --- | --- |
| None | 0 |
| Extra-small | 4 |
| Small | 8 |
| Medium | 12 |
| Large | 16 |
| Large-increased | 20 |
| Extra-large | 28 |
| Extra-large-increased | 32 |
| Extra-extra-large | 48 |
| Full | 1000 |

Verified Radius guidance: preserve the component's own radius; otherwise choose the smallest named radius that supports its shape and emphasis. Increase it for larger/more prominent surfaces. Avoid arbitrary 6, 10, 14, or 24 px corners; 6 px remains valid spacing. Full is for circles/pills, not cards/sheets. For a true circle use a square with 50% radius; a large pixel radius makes a capsule without the elliptical distortion of 50% on a long rectangle.

Verified examples: Filter chip and round Button use Full; square Button variants use size-based corners; Text field uses Medium; Bottom sheet exposed corners use Extra-large-increased. These are documented examples, not complete component specifications.

Recommended spacing: 8–12 px within close groups, 16–24 px for padding/section gaps, larger scale steps for major separation; existing component measurements take priority.

#### Responsive grids — verified local styles

The table consolidates all 11 grid styles. Names follow `Bon/{Class}/{Class} ({range}dp) layout regions {off|on|expanded}`; use `Extra-large` for the final class. Values are Figma units, mapped numerically to CSS px for prototypes. `off` has no navigation-region overlay. The source label for Expanded is 840–1199 dp.

| Class / range | Regions | Content columns | Gutter | Content alignment / offset | Region overlays |
| --- | --- | --- | --- | --- | --- |
| Compact / 0–599 | off, on | 4 stretch | 16 | STRETCH; 16 each side | on: top row 56; bottom row 56 |
| Medium / 600–839 | off | 8 stretch | 16 | STRETCH; 32 each side | — |
| Medium / 600–839 | on | 8 × 46 | 16 | MAX; 32 from right | left column 72; top row 56 |
| Expanded / 840–1199 | off | 12 stretch | 24 | STRETCH; 24 each side | — |
| Expanded / 840–1199 | on | 12 × 52 | 12 | MAX; 32 from right | left column 72; top row 56 |
| Large / 1200–1599 | off, on | 12 stretch | 24 | STRETCH; 200 each side | on: left column 72; top row 56 |
| Extra-large / 1600+ | off, on | 12 × 72 | 24 | CENTER | on: left column 80; top row 56 |
| Extra-large / 1600+ | expanded | 12 × 72 | 24 | MIN; 440 from left | left column 360; top row 56 |

`MIN`/`MAX` are physical Figma alignment values: left/right for columns, top/bottom for rows. Region overlays each have one track and offset 0; their gutter is 1 except the Compact bottom row, whose gutter is 20. A one-track gutter does not establish content padding. Colored grid overlays are authoring aids, not rendered UI colors.

The fixed Extra-large content tracks total 1,128 px including gutters (derived). This is a grid width, not a verified universal application max-width. Preserve the unusual Large 200 px margins and Expanded on-state 12 px gutters when matching these source styles. Fixed tracks and physical region placement are specimen definitions; validate fit and intentional RTL adaptation rather than copying them blindly to every viewport.

`Examples/Layout grid` (`56384:120`) exposes None / Navigation region / Navigation expanded. Reference mobile frames are 412 px wide and web examples 905 × 680; do not hardcode those as application dimensions. Grid-region heights do not override component heights such as the app bar in §4.2. Use fluid layout and normal content flow.

### 3.4 Persian and RTL implementation

Use `lang="fa"` and `dir="rtl"` for Persian containers. Prefer logical CSS (`padding-inline`, `inset-inline-end`, `text-align:start`) and meaningful DOM order; avoid reversing it twice with arbitrary `row-reverse`. Preserve half-spaces and allow text expansion. Isolate Latin identifiers, phone numbers, and URLs with `<bdi>` or appropriate LTR direction. Mirror directional navigation cues, not logos, numbers, or every icon.

Format displayed numerals intentionally, e.g. `Intl.NumberFormat('fa-IR')`, while keeping machine values separate. Currency, calendar, and timezone come from the brief. Persian date labels are present in Figma; digit substitution alone does not convert a Gregorian calendar to a Persian one.

### 3.5 Token-to-code contract

The tables in §3 are the canonical values. Reuse the repository's token system when present; otherwise use this Recommended adapter. Keep an explicit source-name-to-code-name mapping. Do not add screen-local copies of token values or merge semantically different tokens because their values match.

Normalize names to lowercase kebab case: split camel case, replace spaces, slashes, and underscores with `-`, and collapse repeated hyphens. Preserve meaningful suffixes such as `a95`; detect collisions instead of silently overwriting them.

| Source | Suggested code identifier |
| --- | --- |
| `Schemes/{role}` | `--bon-{role}`; e.g. `--bon-on-primary-container` |
| `Add-ons/{role}` | `--bon-add-ons-{role}` |
| `Spacing/{name}` | `--bon-space-{name}`; e.g. `--bon-space-2xl` |
| `Corner/{name}` | `--bon-radius-{name}` |
| `Bon/{role}/{size}[-emphasized]` text style | `bon-{role}-{size}[-emphasized]` class or equivalent text recipe |
| `State Layers/{family}/Opacity-{NN}` | `--bon-state-{family}-{NN}`; resolve independently per mode |
| `Bon/Shadows/{name}` | `--bon-{name}`; keep source elevation names in the mapping |

Generate Light and Dark values from their respective columns under one theme root. Do not derive Dark by inversion, or derive state layers from scheme colors when §3.1 records a mismatch. Preserve 8-digit hex alpha and fractional effect values. A source-equal value is not automatically a live alias.

Map layout units to CSS px for web prototypes. For scalable typography, `size/16 rem` is a Recommended conversion at the default 16 px root; use unitless `lineHeight/size` and preserve text enlargement. Do not force a fixed root size to defeat user settings. Native implementations should use the platform's units and font scaling conventions rather than pasting CSS.

Text recipes MUST set family, size, weight, line height, and tracking together. Register only supplied font files with their actual weight metadata. Keep Wireframe mode out of readable product UI. Component recipes consume tokens; pages compose components. Apply verified effects only when a source or brief establishes the assignment.

Example adapter wiring (names only; values remain in the tables):

```css
.bon-primary-action {
  color: var(--bon-on-primary);
  background-color: var(--bon-primary);
}
.bon-field-surface {
  border-radius: var(--bon-radius-medium);
}
```

These snippets are partial adapters, not verified complete component recipes. Follow §4 for component-specific geometry and §8 for unresolved states.

### 3.6 Elevation, blur, and glass — verified local styles

Twenty effect styles were retrieved. The five `Bon/Shadows/` recipes below are numerically identical to `Bon/Elevation Light/{level}` and `Bon/Elevation Dark/{level}` at the same level. These are equivalent stored definitions, not evidence of a live alias or universal component assignment. Preserve the separate source names when mapping existing components.

Each layer is written as **x, y, blur radius, spread / alpha / color**; distances are px. Color **A** is approximately `rgb(10 12.6667 18)`, **B** is `rgb(10 13 18)` (source floats converted to 0–255). Keeping A/B avoids silently flattening the slight channel difference. Layers are listed in source order.

| Shadow style under `Bon/Shadows/` | Equivalent Light/Dark level | Drop-shadow layers |
| --- | --- | --- |
| shadow-md | 1 | 0, 2, 4, -2 / 6% / A; 0, 4, 6, -1 / 10% / A |
| shadow-lg | 2 | 0, 2, 2, -1 / 4% / B; 0, 4, 6, -2 / 3% / A; 0, 12, 16, -4 / 8% / A |
| shadow-xl | 3 | 0, 3, 3, -1.5 / 4% / B; 0, 8, 8, -4 / 3% / A; 0, 20, 24, -4 / 8% / A |
| shadow-2xl | 4 | 0, 4, 4, -2 / 4% / B; 0, 24, 48, -12 / 18% / A |
| shadow-3xl | 5 | 0, 5, 5, -2.5 / 4% / B; 0, 32, 64, -12 / 14% / A |

All listed drop shadows are visible, use NORMAL blend mode, have no variable bindings, and set `showShadowBehindNode=false`. Suggested implementation: translate the layer tuples to comma-separated CSS `box-shadow` entries; e.g. a tuple becomes `xpx ypx blurpx spreadpx rgb(r g b / alpha)`. Preserve fractional spread and validate transparent surfaces against Figma; CSS rendering is not a completed visual match. No `shadow-sm` was returned.

| Backdrop style under `Backdrop blurs/` | Visible BACKGROUND_BLUR radius |
| --- | --- |
| backdrop-blur-sm | 8 |
| backdrop-blur-md | 16 |
| backdrop-blur-lg | 24 |
| backdrop-blur-xl | 40 |

These use NORMAL blur and no variable bindings. `backdrop-blur-sm` also stores a **disabled** drop shadow; do not render that inactive effect. Use background/backdrop blur rather than blurring foreground content. Treat direct CSS radius translation as a starting mapping to check visually.

`Glassy components/glass-shadow` combines a visible white INNER_SHADOW (x=0, y=0, radius=40, spread=0, alpha=16%, NORMAL blend) with a visible GLASS effect: radius=12, refraction=0, depth=100, lightAngle=-45, lightIntensity=0.3, dispersion=0.5, splay=0. It has no variable bindings. These are Figma effect parameters; ordinary CSS backdrop blur is not a verified equivalent. Use this treatment only for a source component that calls for it, and identify any web approximation.

## 4. Components

This section merges usage and variant information. Option lists preserve source spelling and describe supported domains, not every possible combination. String variants such as `Selected=True` differ from Boolean toggles. Observed dimensions are reference samples; content widths should normally grow. Public wrappers take priority over `.Building Blocks` internals. `<Deprecated>` and XR components are not defaults for new mobile/web work.

Property defaults below were recovered from the saved 2026-09-21 extraction, not a fresh inspection. They describe Figma insertion defaults, not recommended product choices. Text and instance-swap property keys have generated `#…` suffixes: resolve the full key from the owning component/set before automation; never construct a suffix. Variant values are case-sensitive strings, including `True`/`False` and `true`/`false`.

### 4.1 Buttons and segmented controls

Partial extraction: label-button building blocks support Elevated / Text / Outline / Tonal / Filled; states Enabled / Hovered / Focused / Pressed / Disabled; Label text, Icon swap, and Show Icon. Their complete public Button API was not recovered. Recommended emphasis: Filled for the main action, Tonal/Outline for secondary, Text for lower emphasis.

| Size | Observed height px: Elevated/Text/Outline/Tonal | Filled |
| --- | --- | --- |
| XSmall | 32 | 32 |
| Small | 40 | 48 |
| Medium | 56 | 56 |
| Large | 96 | 96 |
| XLarge | 136 | 136 |

The samples are disabled/pressed variants. Preserve the Small Filled exception; widths are content-dependent. Source IDs for Filled XSmall→XLarge: `57994:1144`, `57994:1166`, `57994:1188`, `57994:1210`, `57994:1232`. Do not infer loading visuals or every enabled-state measurement from this sample.

`Segmented control` (`68118:5205`): 2/3/4/5 segments; observed 360 × 48. `_Segment` (`68117:5157`): Selected True/False; Enabled/Hover/Pressed/Disabled. Use for related options or views. Avoid older `.<Deprecated> Segmented button`. Split button, FAB menu, Button groups, and Glassy Components sections exist but were not fully specified.

Recovered defaults: the 25 label-button building-block sets above use State=`Enabled`, Boolean `Show icon=true`, editable `Label text=عنوان`, and an `Icon` instance swap. Segmented control defaults to `Segments=2`; `_Segment` defaults to `Selected=False`, `State=Enabled`, Boolean `Show Icon=false`, editable `Label=سگمنت`, and an `Icon` swap. `Hover` is the segment's exact spelling; do not change it to `Hovered` in Figma calls.

### 4.2 App bars

| Component / node | Options | Observed sample |
| --- | --- | --- |
| App bar · 58114:20565 | Configuration: Small-centered, Small-image, Search, Small, Medium, Large; Elevation: Flat, On-scroll; leading icon and three trailing-action toggles; image swap | Small-centered/Flat and Search/Flat: 412 × 64 |
| Bottom app bar · 51159:5105 | 1–4 icons; Show FAB | 412 × 80; source says mobile only |

Public defaults: App bar uses `Configuration=Small-centered`, `Elevation=Flat`; Boolean leading-icon/first-trailing-action toggles are true, second/third are false. `Image` is an instance swap. Bottom app bar uses `Icons=1` and Boolean `Show FAB=true`. Headline/supporting-text properties occur on nested text building blocks; they were not exposed in the retrieved App bar wrapper definition.

Source guidance: describe the current screen with 1–2 essential actions; apply a separating fill on scroll. The July 2026 change log requires title reflow when the leading icon is hidden: Small/Small-centered text sits 4 px from a present icon and 16 px from the edge when absent. Keep title content in normal layout flow; do not reproduce fixed absolute positioning. Medium/Large titles sit below the icon row. Preserve visible behavior rather than the source's negative-spacing workaround.

### 4.3 Badges

| Component / node | Options | Behavior / observed size |
| --- | --- | --- |
| Badges · 51592:4768 | Type: Default, Number, Text; editable count/text | Ending edge of destination icon. Text: 18 px high, content-hugging width, default به‌زودی; Number sample: 16 × 16 |
| Badge - State indicator · 67908:3256 | Default, Current, Done, Success, Error | 24 × 24 |
| Badge - Label · 67908:3271 | Light/Dark; Blue, Red, Green, Yellow, Gray, Glass | 24 px high; variable width |
| Badge - Icon · 67908:3302 | Light/Dark; Gray, Green, Red, Blue, Yellow; icon swap | 24 × 24 |

### 4.4 Checkboxes

`Checkboxes` (`51859:5628`): Type = Selected / Unselected / Indeterminate / Error unselected / Error indeterminate / Error selected; State = Enabled / Hovered / Focused / Pressed / Disabled. Thirty variants; sampled frame 48 × 48, not a 48 px visible square. Source use: multiple selection and parent/sub-selection. Recommended implementation: labelled native input with a true mixed state and associated error text.

Figma insertion defaults are `Type=Selected`, `State=Enabled`; explicitly set the intended initial selection rather than inheriting it accidentally.

### 4.5 Chips

Observed individual chip samples are 32 px high. Suggestion, Filter, and Assistive share Outlined/Elevated styles and Enabled/Hovered/Focused/Pressed/Dragged/Disabled states. Input has only Enabled/Hovered/Focused/Dragged in retrieved options.

| Family / node | Purpose and remaining options |
| --- | --- |
| Suggestion chip · 53923:28679 | Dynamic suggestions; Selected True/False; Show icon True/False; label and leading-icon swap |
| Filter chip · 53923:28270 | Filter content; selected adds a leading checkmark; label-only or label + leading icon; selection and trailing-icon options |
| Assistive chip · 53923:28089 | Contextual actions; label-only, icon, favicon, or brand icon |
| Input chip · 53923:27888 | User-entered items; label-only, leading icon, or avatar; Selected True/False; Show closing icon false/true |
| Chip groups · 57376:5501 | Any of the four families; Single row - scrollable or Multiple rows - overflow |

Recovered defaults: all individual chips use `State=Enabled` and editable `Label text=برچسب`. Suggestion/Filter/Assistive default to `Style=Outlined`; Filter/Assistive/Input default to `Configuration=Label only`. Suggestion/Filter/Input use `Selected=False`. Visibility controls are **VARIANT strings**, not Booleans: Suggestion `Show icon=False`, Filter `Show trailing icon=False`, Input `Show closing icon=false`. Input has no Style property in the retrieved API. Chip groups default to `Type=Input chips`, `Layout=Single row - scrollable`.

### 4.6 Date and time pickers

| Family / node | Options | Observed samples |
| --- | --- | --- |
| .Docked input date picker [desktop] · 51954:18567 | Day/Month/Year; clear toggle | Month/Year: 360 × 519 |
| .Input date picker · 51954:18540 | Single input/Range; text and clear options | 328 × 278 |
| .Modal date picker · 51954:18136 | Day/Year/Full-screen (range); text and clear options | Year: 360 × 516; range: 360 × 696 |
| .Dial picker · 52949:27916 | 12/24 hour; Vertical/Horizontal | 24-hour vertical: 328 × 520; horizontal: 572 × 384 |
| .Keyboard picker · 52949:28053 | 12/24 hour | 12-hour: 328 × 243; 24-hour: 264 × 243 |
| Date Pickers · 68109:10417 | Exp Date/Date; Theme=Light only | 280 × 302 |

Calendar cells (`51954:18817`) have Default/Today/Selected/Selected (Middle)/Null/Prev/Next types, range-start/end toggles, and interaction states; observed 48 × 48. Year cells (`51954:18918`) are sampled at 88 × 52. The source includes the typo `Hovere`; retain it only when mapping Figma properties. Keep parsing, range validation, and calendar conversion separate from appearance. Do not invent a Dark option for the Light-only product picker.

### 4.7 Dialogs

| Family / node | Options | Observed no-icon / with-icon size |
| --- | --- | --- |
| Basic dialog · 50723:10929 | Icon True/False; title/supporting text; Show divider | 312 × 248 / 312 × 288 |
| .List dialog · 52112:28937 | Icon True/False; title/supporting text; editable child list items | 312 × 448 / 312 × 488 |
| .Scrollable list dialog · 52112:29186 | Icon True/False; title/supporting text; editable child list items | 280 × 474 / 280 × 514 |

Basic dialog defaults to variant `Icon=False` and Boolean `Show divider=false`; `Title` and `Supporting text` are TEXT properties. Its retrieved wrapper defines no action-label or action-visibility properties; inspect nested actions before automating them.

Source guidance: use sparingly for critical information or decisions; block underlying interaction. Pin title and actions when internal content scrolls and keep background scrolling separate. Use a menu for non-interruptive options. Actual dialog size must accommodate content and viewport.

### 4.8 Avatars, utilities, and shapes

| Component / node | Options / observed dimensions |
| --- | --- |
| Generic avatar · 50731:13725 | Check/Monogram/Avatar; editable Letter; 40 × 40 samples |
| Avatar · 70973:173 | Female Avatar/Male Avatar/Placeholder; 56 × 56 samples |
| 3D Avatars · page 55595:3788 | Thirty numbered assets; 120 × 120 source size |
| Keyboard · 52515:32926 | Base keyboard/Alphanumeric/Keypad/Numeric only; Portrait/Landscape/Floating. Placement-only, not an accurate Gboard recreation |
| Status bar · 50758:11369 | 412 × 52 |
| Gesture navigation · 50783:11415 | 412 × 24 |
| Device frame · 50770:11451 | 412 × 892 |
| Scrim · 55412:16960 | Overlay utility; opacity depends on the intended composition |
| Shape Set · 58548:7248 | 35 decorative shapes; not a requirement to decorate product screens |

Use supplied profile imagery or a neutral placeholder; do not infer gender to choose an avatar. Working web prototypes should use real inputs and the device keyboard rather than a simulated keyboard decoration.

## 5. Assets

Partial manifest: all 62 recovered icons below have Light/Dark variants and sampled 24 × 24 frames. A `+` marks the four sets that also expose State On/Off. Other asset sections exist: Home Icons, Store logos, Duo Tone Bon Icons, Logos, Bajet Logos, App Icon. Use source components rather than redrawing brand artwork.

The SVG column lists only filenames actually recorded in component descriptions. Resolve them against the [recorded Light SVG directory](https://s3.ir-thr-at1.arvanstorage.ir/simorqtejarat/bajet/icons/default/light/); file availability was not tested. Do not derive unlisted or Dark filenames. For services/gem, `-on.svg` is labelled On and the plain file Off. Bank/cash-stack descriptions label both files On, so their plain-file state needs verification. Other recorded URLs do not establish a selection state. A dash means no URL was recovered, not that an asset does not exist.

| Exact component name | Node | Recorded SVG filename(s) |
| --- | --- | --- |
| services + | 68222:432 | services-on.svg, services.svg |
| check | 69632:125 | — |
| bank + | 68222:453 | bank-on.svg, bank.svg |
| gem + | 68222:482 | gem-on.svg, gem.svg |
| cash-stack + | 68222:519 | cash-stack-on.svg, cash-stack.svg |
| cash_deposit | 68222:544 | — |
| digital_signature | 68222:561 | — |
| cash_stack_heart | 68222:572 | cash-stack-heart.svg |
| cash_stack_history | 68222:585 | cash-stack-history.svg |
| kalano | 68222:604 | kalano.svg |
| sim_card | 68222:615 | — |
| sponsor | 68222:647 | — |
| gauge | 68222:666 | — |
| shopping_cart | 68222:677 | shopping-cart.svg |
| document_add | 68222:698 | — |
| cheque | 68222:713 | — |
| promissory_note | 68222:730 | — |
| receipt_wallet | 68222:743 | — |
| receipt | 68222:768 | — |
| card_lock | 68222:787 | — |
| cards | 68222:808 | — |
| document_judge | 68222:823 | — |
| documents | 68222:854 | — |
| document_swap | 68222:869 | document-swap.svg |
| card_add | 68222:894 | — |
| card_show | 68222:913 | — |
| cash_deposit_history | 68222:930 | — |
| card_refresh | 68222:959 | — |
| password_lock | 68222:982 | — |
| card_block | 68222:1009 | — |
| event_reload | 68222:1026 | — |
| card_two_factor_authetication | 68222:1063 | — |
| car | 68222:1084 | — |
| receipt_barcode | 68222:1103 | — |
| internet | 68222:1134 | — |
| wallet_add | 68222:1145 | — |
| card_double | 68222:1164 | — |
| logout | 68222:1184 | — |
| edit | 68222:1199 | — |
| card_double_history | 68222:1208 | — |
| user_add | 68222:1227 | — |
| calculator | 68222:1248 | — |
| card_smart | 68222:1285 | — |
| lock | 68222:1311 | — |
| biometric | 68222:1322 | — |
| document | 68222:1337 | — |
| safe_box | 68222:1350 | — |
| bar | 68222:1386 | — |
| chart_upward | 68222:1395 | chart-upward.svg |
| silver_and_gold | 68222:1426 | — |
| 3d_gem | 68222:1441 | — |
| location | 68222:1456 | — |
| document_check | 68222:1465 | — |
| folder | 68222:1480 | — |
| card_shopping_cart | 68222:1489 | card-shopping-cart.svg |
| store | 68222:1514 | — |
| cash_stack_deposit | 68222:1529 | — |
| cash_stack_reload | 68222:1550 | — |
| cash_stack_bag | 68222:1575 | — |
| signature | 68222:1592 | — |
| phone_refresh | 68222:1605 | — |
| verify | 68222:1628 | — |

Choose theme/state before export. Prefer SVG for vectors and suitable raster formats for image avatars; preserve viewBox, aspect ratio, original colors, and duotone detail. Do not globally tint multicolor artwork. Use supplied local assets for reproducibility; report missing assets with labelled placeholders. Font/image/SVG binaries are not embedded here. Decorative images need empty alt text; meaningful images and icon-only controls need suitable names.

## 6. Coding contracts

These are Recommended implementation rules. Adapt syntax to the existing framework; no package names or component exports below are asserted to exist.

### Component boundaries

- Reuse an existing mapped component before creating another. Separate reusable controls, domain components (such as an amount or transaction row), and page composition using the repository's conventions.
- Keep public props semantic: appearance/size, value/selection, disabled, pending, and validation are distinct concerns. Let pointer and keyboard interactions drive hover/press/focus; do not require pages to simulate those states with props.
- Normalize Figma string variants to suitable code types at the adapter boundary. A checkbox value should represent checked/unchecked/mixed; do not confuse a Figma `"False"` string with JavaScript `false`. Preserve exact Figma keys only in source mappings.
- Keep field values and callbacks consistent with the project's form model. Associate labels, help, and error text; retain input on recoverable failures. Replace Figma sample labels with meaningful localized copy.
- Use real buttons, links, inputs, and form submission semantics. Icon-only controls need accessible names. Selected chips must communicate selection; removable chips need an explicit remove action. Modals manage focus, dismissal, and focus restoration.
- Keep source visual dimensions separate from hit areas. Target at least 44 × 44 CSS px interaction areas where possible without enlarging a verified glyph or introducing overlapping targets. Preserve visible keyboard focus even when the exact Bon focus recipe is unknown; label that styling as a fallback.

### State and data

| Concern | Required behavior |
| --- | --- |
| Async content | Model idle/loading/success/empty/error explicitly; avoid impossible combinations of unrelated flags |
| Pending action | Prevent repeated activation and expose progress accessibly; keep label/context available |
| Transaction result | Distinguish pending, confirmed success, failure, reversed, and unknown as applicable; never equate an HTTP response or timeout with settlement without the backend contract |
| Retry | Use the backend's documented idempotency/status-check contract; a disabled button alone is not transaction deduplication |
| Money | Store exact values with explicit units using the project's integer/decimal model; do not calculate money with floating-point display values or parse localized labels as machine data |
| Locale | Centralize formatting/parsing; follow §3.4. Keep Persian display numerals separate from API values; require an explicit rial/toman conversion rule |
| Mock data | Use deterministic fixtures and selectable failure/pending scenarios; keep mock adapters separate from live integrations |

Keep business rules authoritative in the relevant service/domain layer. A visual prototype does not establish authorization, eligibility, settlement, or production security behavior. Use existing API contracts and never fabricate successful real transactions.

### Layout and accessibility

Use normal document flow, logical CSS, and content-driven sizing. Allow long Persian labels and mixed-direction identifiers to wrap or isolate correctly. Do not render Figma grid overlays or device mockups as application chrome. Use the verified grid ranges only when the feature needs responsive adaptation; do not create a desktop layout merely because a breakpoint exists.

Support keyboard operation, text enlargement, reduced motion, and status announcements without moving focus unexpectedly. Do not rely on color alone for errors or selection. Measure actual contrast, including state overlays. Treat all accessibility targets as implementation requirements, not proof that source tokens pass them.

## 7. Definition of done

Validate proportionately to the change. Use existing project commands and add focused tests for consequential behavior; avoid tests that only repeat style literals.

- [ ] Build/type/lint checks relevant to changed code pass; report unavailable checks accurately.
- [ ] Required primary flow and recovery states work; no dead controls or duplicate submissions in the tested flow.
- [ ] Components consume shared tokens; source exceptions, prop types, and requested themes are preserved.
- [ ] Actual rendering checked at a narrow viewport and the 412 px reference; inspect relevant larger layouts, long Persian content, RTL identifiers, text enlargement, and keyboard-open forms when applicable.
- [ ] Keyboard focus, labels/errors, modal behavior, hit areas, and contrast checked for affected controls.
- [ ] Assets/fonts resolve; missing assets, approximations, and unverified state recipes are disclosed.
- [ ] Source comparison performed when screenshots are available; do not claim pixel accuracy from code inspection alone.

Final report: **what changed; components reused; checks run and outcomes; material assumptions or remaining gaps.** Include changed files or a runnable preview when available. Do not repeat the entire token catalogue.

## 8. Evidence gaps and fallback decisions

Coverage: six variable collections, 30 text styles, 20 effects, 11 grid styles, and the sampled components/assets in §4–5. Buttons/Icons responses and some page guidance were truncated. Live inspection remained blocked by the connected Figma seat's call limit on 2026-09-29. Previously recovered evidence remains usable; this is not a current full-file audit.

| Missing evidence | Proceeding rule |
| --- | --- |
| Component geometry, API, or binding | Reuse existing project behavior when suitable. Otherwise build the smallest accessible local extension from verified tokens and label it Recommended; do not claim it is an official Bon component |
| Focus/disabled visuals | Preserve usable focus and disabled semantics with an explicit fallback; do not infer exact opacity/stroke from a state name |
| Motion timing/easing | Prefer no nonessential animation; preserve reduced-motion behavior. Any necessary animation is a local approximation |
| Asset/font binary | Use supplied files; otherwise use a labelled placeholder or disclosed font fallback. Never invent a download URL or redraw a logo as verified artwork |
| Financial rule or real-action contract | Ask for the missing rule before implementing live behavior; a clearly labelled mock may proceed for prototype scope |
| Screenshot or code mapping | Report fidelity/mapping as unverified. Do not invent package imports, screenshot comparisons, or test results |

Only inspect targets needed by the current task. Close a gap after reading the evidence and merging it into its canonical section. Keep unresolved questions here rather than duplicating warnings throughout implementation notes.

| Known page; component details uninspected | Page ID |
| --- | --- |
| Dividers | 55141:14177 |
| Lists | 55141:14249 |
| Loading & progress | 55141:14252 |
| Navigation | 55141:14251 |
| Radio button | 55141:14253 |
| Search | 55141:14254 |
| Sheets | 55141:14170 |
| Snackbar | 55141:14256 |
| Sliders | 55141:14255 |
| Switch | 55141:14257 |
| Tabs | 55141:14258 |
| Text areas | 71849:15857 |
| Text fields | 55141:14259 |
| Tooltips | 55141:14261 |
| 🔒 Toolbars | 58295:22726 |
| 🔒  Menu | 55141:14250 |
| 🔒 Cards | 55141:14171 |
| 🔒 Carousel | 55141:14172 |

The lock emoji does not establish deprecation or an access policy. Playground and Bon Website — MVP are not verified system baselines. The Radius-page examples in §3.3 do not substitute for complete Text field or Sheet specifications.

Guidance inspection targets:

| Guidance | Node | Remaining question |
| --- | --- | --- |
| Typography Guidelines — Mobile & Web | 72019:3838 | Role selection and mobile/web usage beyond the extracted type scale |
| Color tokens — Hierarchy & Usage | 68125:312 | Intended role hierarchy and source-specific usage rules |
| Change log — Shadows | 68328:445 | Usage/assignment rationale; numerical effect recipes are now in §3.6 |
| Change log — Button | 68789:23524 | Public API, state behavior, and size exceptions beyond sampled building blocks |

For the remaining technical gaps, use these completion criteria:

| Target | Evidence required to close |
| --- | --- |
| Components on the pages above | Public component/set IDs, property types/defaults/options, nested layout/padding and token bindings; inspect relevant enabled, focused, error, and disabled variants |
| State visuals and motion | Actual layer opacity, stroke/fill/effect bindings, focus treatment, plus prototype transition duration/easing where defined; a state name alone is insufficient |
| Assets and fonts | Exported theme/state-specific SVG or raster files with source IDs; supplied font binaries and confirmed permitted usage. A font family name does not establish file availability or licensing |
| Visual fidelity | Readable source screenshots compared with the implementation in the requested theme, language, and viewport; record discrepancies and checks actually performed |
| Source-to-code mappings | Existing repository/package and exported component path, with verified prop mapping or Code Connect entry; do not invent a package name |

Until those sources are available, use existing verified tokens, keep necessary extensions explicitly labelled Recommended, and report unresolved fidelity limits. A Figma file/export with component properties, variables, and guidance can support further inspection; screenshots alone cannot establish hidden APIs or bindings.
