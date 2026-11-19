# SUNFIRE // SECTOR 07 Tactical FPS

A 3D browser-based tactical FPS built with **Three.js**, **TypeScript**, and **Vite**, featuring a moody wet-surface industrial combat arena, selective HDR bloom, dynamic combat lighting, 3v5 squad gameplay, and a minimal frosted-glass tactical HUD.

## Quick Start

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
npm run preview
```

## Features

- **Dark Industrial Foundry Arena**: Wet puddle-reflective asphalt/concrete PBR surfaces (`MeshPhysicalMaterial` + `PMREMGenerator` environment reflections), steel-flanged columns, chamfered blast bulkhead with elevated catwalks, overhead steel trusses & sagging catenary cables, burning fire barrels with flickering dynamic point lights, spinning cyan-backlit exhaust turbine, and rising embers.
- **3v5 Squad & Tactical Modes**:
  - **Foundry Breach (3v5)**: First to 5 rounds alongside 2 Blue-Team AI teammates (**EMBER** & **PULSE**) against 5 hostile insurgents.
  - **Solo Clutch (1v5)**: Pure solo round-based survival.
  - **Endless Skirmish**: Continuous waves with shield & ammo rewards on elimination.
- **Custom Characters & First-Person Loadout**:
  - Blue-Team tactical allies (cobalt-blue uniform, cargo pants, helmet with dark visor, black rig, wood-stock AK) vs. rugged insurgent enemies (olive/grey helmet, goggles, olive lower gaiter, brown/charcoal vest, denim jeans, AK rifle).
  - First-person `M41-TAC` rifle viewmodel with two-tone black/forest-green receiver, chunky Picatinny rail, green anodized rotary knob, `GAME OVER, MAN.` stencil decal, and metallic gold combat sleeves & gloves, plus silenced **Ghost** sidearm and **Tactical Knife**.
- **Tactical Ordnance**: `Q` Flashbang, `E` LOS-blocking Smoke, `C` Stim Surge.
- **Procedural Web Audio Engine**: Synthesized gunshots, reloads, headshot chimes, footsteps, and ability effects with zero external audio assets.

## Controls

| Key | Action |
| --- | --- |
| `W A S D` | Move |
| `Mouse` | Aim |
| `Left Click` | Fire / Slash |
| `Right Click` | Aim Down Sights (ADS) |
| `Shift` | Silent Walk |
| `Ctrl` | Crouch |
| `Space` | Jump |
| `R` | Reload |
| `1 / 2 / 3` or `Scroll` | Switch Weapons |
| `Q / E / C` | Flash / Smoke / Stim |
| `Esc` | Pause / Settings |
