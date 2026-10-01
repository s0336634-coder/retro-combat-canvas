# Weapon and combat polish

## Changes
- Replace the single box-shaped first-person and bot weapons with recognizable low-poly weapon silhouettes assembled from primitive meshes, selected by each equipped weapon.
- Give level-three sentries visible rocket pods and fire actual travelling rockets toward targets, preserving splash damage and the existing cooldown.
- Add controlled aim variation to sniper bots so some charged shots visibly miss while they remain dangerous.

## Technical details
- Keep the existing Three.js style and weapon definitions; centralize weapon-mesh construction in the game module and rebuild only when a weapon changes.
- Reuse the projectile simulation for sentry rockets, tagging their owner as the engineer for damage credit.
- Apply sniper miss offsets only to NPC aiming, with randomized shot-level accuracy rather than affecting player shots.

## Verification
- Check the game builds cleanly.
- Open the preview and confirm weapon geometry renders correctly at desktop size without blocking the view.
- Exercise or inspect the sentry and sniper flows to confirm rockets travel and sniper misses occur.
