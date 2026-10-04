# Finish distinctness audit

Rule: a finish ships in the dropdown only if it differs from every other
finish in **at least 2 of 4 axes**: stroke shape, texture/opacity, palette
transform, underpainting base.

## Method

1. Paint the same photo (`server/test.png`) in each finish, same Detail.
2. Record the likeness score from the status bar.
3. Pairwise check: same shapes + same palette behavior = suspect.
4. Eyeball the suspects side by side, rule hide / keep / differentiate.

## Current roster (14) with signatures

| Finish | Shape | Texture/opacity | Palette | Base |
|---|---|---|---|---|
| impasto | rotated rect | opaque + white ridge | jittered photo color | blurred wash |
| knife | shorter/wider rect, no ridge | opaque | jittered photo color | blurred wash |
| gouache | rounded rect | flat matte opaque | low-jitter photo color | blurred wash |
| poster | rounded rect (same as gouache) | flat matte opaque | 4-level quant + vivid | blurred wash |
| watercolor | soft ellipse wash | ~1/3 alpha, double dab | jittered photo color | wash() tint |
| pastel | soft ellipse wash (same) | 1/2 alpha | whitened +20% | wash() tint |
| charcoal | soft ellipse wash (same) | 0.45 alpha | dark-biased full range (black→black, white→white) | white base, no wash |
| impressionist | short dab + lift dot | opaque | high jitter | blurred wash |
| pointillism | dots | opaque | saturated 1.35× | blurred wash |
| acrylic | short rect + dark dry edge | opaque | vivid 1.5×, no quant | blurred wash |
| sketch | rounded rect (same as gouache) | flat matte | grayscale | paper + cross-hatch |
| inkwash | chunky rect (same as knife) | opaque | grayscale | gray wash |
| mosaic | axis squares | opaque | photo color | blurred wash |
| pixel | axis squares, smaller | opaque | 5-level quant | blurred wash |
| flow | long continuous polylines | thin 0.9-alpha lines | photo color | blurred wash |
| sculpt | chunky rect + light/shadow sides + drop shadow | opaque relief | photo color | blurred wash |
| dagger | thick-to-thin tapered polygon | opaque | photo color | blurred wash |
| stamp | leaf ellipse + stem, random rotation | opaque organic | photo color | blurred wash |

## Open rulings (need eyeball verdicts)

- **knife vs impasto**: same palette, near-identical shape. Hide knife unless
  side-by-side shows clear daylight (chunkiness may still read distinct).
- **watercolor vs pastel vs charcoal**: same wash mechanics; differ only in
  palette/alpha/base. Likely all three survive (color vs white vs dark read
  very differently), confirm visually.
- **gouache vs poster**: same shapes; quantization + vividness is the whole
  difference. Keep both only if poster reads clearly graphic.
- **mosaic vs pixel**: same grid mechanics; keep both only if tile gaps +
  quantization read clearly different.
- **sketch vs inkwash**: different shapes (flat blocks vs chunky) and bases
  (hatch vs gray wash). Expected: both survive.
- **flow / sculpt / dagger / stamp**: clear the 2-of-4 rule by construction
  (polylines / directional relief / tapered polygons / organic stamps share
  no shape with any existing finish). Confirm visually, no hide expected.

## Score sheet (fill per test photo)

| Finish | Likeness % | Looks distinct? | Verdict |
|---|---|---|---|
| impasto | | | |
| knife | | | |
| gouache | | | |
| poster | | | |
| watercolor | | | |
| pastel | | | |
| charcoal | | | |
| impressionist | | | |
| pointillism | | | |
| acrylic | | | |
| sketch | | | |
| inkwash | | | |
| mosaic | | | |
| pixel | | | |
| flow | | | |
| sculpt | | | |
| dagger | | | |
| stamp | | | |
