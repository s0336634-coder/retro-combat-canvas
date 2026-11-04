<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Build low-poly weapons from shared Three.js primitives in `Game.makeWeaponModel` so first-person and bot silhouettes stay consistent.
- Store NPC limb pivots in actor mesh userData so movement animation stays lightweight and class-independent.
- Keep rendering-only animation curves in a renderer-independent module so recoil and reload motion can be tested without WebGL.
- Use shared class-selection UI for initial deployment and in-match switching so previews and loadouts remain consistent.
- Dev builds expose `window.__game` (live Game instance) and `sim(seconds)` for fixed-step checks; the game canvas sets `data-scene-ready` after rendering.
