# Add variables wrapped-label regression

These files were copied unchanged on 2026-11-04 from DialogCreator's qualified
`scripts/fixtures/addvariables-anchoring/` fixture, originally copied from
`DialogR/dialogs/r/addvariables/`. They retain the complete authored dialog,
translations and actions, including the Radio → Label → Radio attachment chain.

Source SHA-256:

- `dialog.json`: `b0062d60fb90aa01f58ae447d40a66477992df3c05ec05611eb9cdecfad0fb39`
- `actions.js`: `2d18d7f021c017b40ebbf43473cee1a46450e44579c781d67f582b2011df985f`

The original `~/addvariables.dc.zip` supplied in the report predates attachment
metadata and uses a single-line, 220px label. This snapshot captures the later
reported configuration: `label_bykeys` has a 120px maximum, two lines and Middle
vertical alignment. `by_order` attaches to its right with the default 10px gap,
Middle alignment and an offset of -1px.

DialogCreator qualified this snapshot through its actual editor property
controls and native/browser Preview. DialogForge's rendered acceptance loads
the unchanged document and actions into its real `dialogBuilder.html`, shared
adapter, runtime and CSS. It applies translations with the canonical source
localizer and exercises English, Greek, French and German. Only the host
transport is supplied; no R command or full application shell is executed.

Before the correction, the Greek text wrapped to lines 88.3125px and 42.046875px
wide, while its wrapper stayed 120px wide. The attachment gap was correctly 10px
between wrappers but approximately 40px between painted text and the radio.
`maxWidth` is a cap: the box should fit its visible lines with the existing
horizontal padding and clipping allowance, preserving wrapping and content.

The original macOS Creator widths were English 99px, Greek 95px, French 107px and
German 113px at Inter 12px. Linux font advances can differ by a pixel; acceptance
compares the canonical Creator renderer in the same browser while checking the
original words, wrapping, clipping and attachment geometry independently.
The Radio box gap is 10px; the painted text-to-circle gap is
15px in all four locales because text has its normal internal inset and clipping
allowance. The expected Greek lines remain `Με μεταβλητές` and `κλειδιά`.
