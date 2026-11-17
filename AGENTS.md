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
- Keep bot difficulty tuning in a renderer-independent module shared by AI and match controls; apply presets to both teams without changing player stats or restarting the match.
- Keep match reward thresholds, mutator definitions, and weapon-selection helpers in renderer-independent `extras.ts` with tests so match additions remain verifiable without WebGL.
- Match preferences are session-only and the shared Match Desk reads live game statistics; explicit match restarts reset rewards and temporary combat state to prevent stale results.
- Keep bot navigation and tactical regression tests independent of WebGL; validate real-map routes and class decisions with lightweight game fixtures.
- Keep field-rule defaults and telemetry calculations in renderer-independent operations.ts; session-only controls use Game methods so menus and live play share one state.
