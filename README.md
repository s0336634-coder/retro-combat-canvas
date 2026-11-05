# 2Fort Echo

Role & Tech Stack: Act as a senior 3D web game developer. Build a 3D First-Person Shooter (FPS) TF2 "demake" using HTML5, JavaScript (ES6+), Three.js for 3D rendering, Cannon.js (or Rapier.js) for physics, and the Pointer Lock API for mouse look.

Core Architecture:

FPS Controls: WASD movement, Space to jump, C to crouch, Left Click to fire, Right Click for alt-fire.

3D 2Fort Map Geometry: Low-poly primitive meshes forming: Covered Bridge, Water/Moat, Underground Sewers, Battlements balconies, Courtyard with Grate drop-down, Spiral Ramp, Straight Stairs, and RED/BLU Intel Vaults.

CTF Game Mode Rules: Flag collision pickup, dropped flag 60-second despawn timer, score counter on delivery to friendly flag pedestal, respawn timers (10 seconds).

NPC AI & Bot System:

Implement an automated Bot Controller module supporting autonomous RED and BLU NPCs:

Navigation Graph (Waypoint Pathfinding): Create a 3D node map overlaying 2Fort (SPAWN, BRIDGE, SEWERS, COURTYARD, SPIRAL, BATTLEMENTS, INTEL_ROOM). Use A* pathfinding for bot movement vectors.

Perception System:

Vision: Field-of-view frustum check (120° cone) and raycasting to detect visible targets/obstacles without wall-wall vision.

Hearing: Radius-based sound events (footsteps, gunfire, explosion triggers) that alert bots to nearby threats.

Finite State Machine (FSM): Each bot cycles through states: IDLE $\rightarrow$ PATROL $\rightarrow$ PURSUE_OBJECTIVE $\rightarrow$ ENGAGE_ENEMY $\rightarrow$ RETREAT_FOR_HEALTH.

Utility & Threat Assessment: Bots prioritize actions based on weight scores: (e.g., Flag Carrier visible = +100 priority, Health < 25% = Seek Health Pack).

Class-Specific AI Behaviors: Implement distinct combat routines, weapon usage, and route selection for all 9 classes (detailed below).

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://retro-combat-canvas.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/76d2321a-73b1-4098-a533-f8779e9f26fd).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
