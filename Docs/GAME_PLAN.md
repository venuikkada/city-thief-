# CITY THIEF - game plan

Short design notes. Details are added as each step is built.

## World (all fictional)

- **Navapur** - City 1. Old town lanes, markets, main roads, the old warehouse.
- **Sagarpet** - City 2. Harbour city with a river and bridges.
- **Navapur Metro Police (NMP)** - city police. Blue-and-white cars, SWAT vans, one helicopter.
- **Coastal Police** - police boats (Chapter 3).
- Weapons have made-up names only (e.g. "Pistol", "SMG", "Rifle", "Shotgun").

## Story

Vikram, a small-time thief, is caught in a failed heist. The police chase him across Navapur.
He steals a car, meets his partner Ravi at the old warehouse, fights off the police,
and escapes by bike, boat and car - then pulls one final heist and escapes a helicopter.
Cutscenes are short, in-engine, with English subtitles.

## Chapters (40 missions)

| Chapter | Missions | Theme | Unlock |
|---|---|---|---|
| 1 Street Escape | 1-10 | On foot, steal a car, meet Ravi, shootout, car escape | Start |
| 2 Bike and Traffic | 11-20 | Bike escapes, traffic chases, breaking roadblocks | Finish Ch 1 |
| 3 Water | 21-30 | Harbour boat escape, river chases, police boat fights | Finish Ch 2 |
| 4 Between Cities | 31-40 | Highway, bridge chases, final heist, helicopter pursuit | Finish Ch 3 |

Each mission: objective, time limit OR wanted-level goal, reward (coins + 1-3 stars), fail condition.

## Wanted system (5 stars)

| Stars | Police response |
|---|---|
| 1-2 | Patrol cars |
| 3 | + SWAT vans and roadblocks |
| 4-5 | + Helicopter and spike strips |

Stars rise when police see you commit a crime or when you shoot.
Lose stars by hiding out of sight, changing vehicle unseen, or leaving the search area.

## Vehicles

- 8 cars (hatchback, sedan, SUV, pickup, police car + variants), 2 bikes, 1 speedboat,
  1 helicopter (final chapter only).
- Each vehicle: speed, handling, damage. Damaged vehicles smoke, then stop.

## Money (no pay-to-win)

- Coins from missions. Optional rewarded ads for bonus coins.
- Coins buy and upgrade cars in the Garage. Nothing sold for real money gives combat power.

## Performance targets

- 30 FPS on 4 GB RAM phones, 60 FPS on mid-range.
- APK under 150 MB. Small textures (512 px max for most props, ASTC compression).
- LOD, occlusion culling, simple box colliders on traffic.
- Fully offline. No login.
