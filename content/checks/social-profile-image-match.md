---
channelCategory: Social Media
points:
  food: 2
  retail: 2
  services: 1
  other: 1
---

# Social profile images match

The same logo should appear across your public profiles. We compare profile photos on the networks we can read.

::tech-detail{summary="How we compare profile images"} We load the avatar from each readable profile. Identical image URLs or identical files match. Different PNG images are compared with an average hash. When that hash is inconclusive and a TypeSafe key is configured, we ask whether the two images are the same mark. We do not invent a match when fewer than two images can be loaded. ::

## What we're checking

At least two readable profile photos should show the same logo.

::impact{type="customers" severity="medium"} Mismatched avatars make it harder for customers to recognise the same business ::

## How can I fix it?

Set the same logo file as the profile photo on each social profile.

::time-estimate{minutes="20" difficulty="easy"}::
