# PALM KEY HEAT

An open-world island crime game in the spirit of GTA 6, built for the
make.fun gta6-01 competition. It runs offline in a desktop browser from
static files — no network, no libraries, no build step.

You are **Jax Marlow**, fresh off the ferry in Palm Key with $50, a borrowed
jacket and a phone full of bad ideas. Rico, the fixer who runs the marina
garage, has six jobs for you — if you can stay out of the Palm Key PD's way
long enough to finish them.

## Play

Serve it locally and open http://localhost:8080/game/ :

```
node serve.ts
```

or open `game/index.html` directly from any static file server.

| Key | Action |
| --- | ------ |
| W A S D / arrows | Move on foot / drive |
| SHIFT | Sprint |
| E | Enter / exit a car (steal traffic cars, or any parked car) |
| SPACE | Handbrake |
| F | Punch |
| Mouse + click | Aim / shoot (with a pistol) |
| 1 / 2 | Fists / pistol |
| R | Pay N Spray — repair + clear wanted ($80) |
| B | Buy pistol ($250) / ammo ($60) at Ironworks |
| H | Full heal at the hospital ($40) |
| P | Pause, M mute, ENTER advance dialogue |

## What's in the game

- **A whole island city**: a road grid of named places — Rico's Garage, the
  Marina, The Sandbar, Palm Key Trust bank, Dockside, Pay N Spray, Ironworks,
  the hospital and the ferry terminal — with parks, beaches, palms and a
  day/night cycle.
- **On foot and by car**: arcade driving with drift and handbrake, seven car
  types, parked cars and live traffic that follows the roads.
- **Stealing cars**: jack a traffic car and its driver flees; steal a cop car
  if you dare.
- **Wanted system**: 0–5 stars, police cruisers that chase and ram, foot
  cops that run you down, busted and wasted respawns with fines.
- **Combat**: fists, a buyable pistol, thugs who fight back.
- **Six story missions**: get wheels, a pickup run, a package run, losing a
  three-star tail, a dockside shakedown, and the big bank job — with phone
  calls, timers, rewards and a story-complete ending.
- **HUD + minimap**: cash, health, wanted stars, clock, speed, mission
  objective with a waypoint arrow and a live minimap.
- **Save**: autosaves as you play; continue from the title screen.
- **Sound**: fully synthesised engine, sirens, gunshots and an island bass
  line — no audio files.

## Hand-in

`main.ts` (Node 22) stages the game for the judge: it copies `game/` and
`screenshots/` to the output directory and writes `dossier.json` with the
vendored make.fun library.

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

Screenshots in `screenshots/` are frames of the real game, posed with
`?shot=start|play|end` (see `game/src/shots.js` and `shots.json`).

## License

MIT — see LICENSE.
