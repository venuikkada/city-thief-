# Step 2 review: one city block with traffic and police

## How to test

1. In Unity: **City Thief -> Step 2 - Build City Block (Traffic + Police)**.
   (It also creates the layers Player, Vehicle and NPC. If Unity warns that a layer
   slot is already used, rename that slot as the message says.)
2. Press **Play**. Watch traffic for a minute, then tap the red **CALL COPS** button.
3. Escape: **sprint** (push the joystick past the edge), turn corners, and get into a
   **courtyard** through the narrow gaps between buildings. Stay out of sight
   until the counter reaches 0.
4. Test on a real phone and check the FPS counter (top middle).

Tip: select **Traffic Network** in the Hierarchy to see every lane, turn and stop line
drawn in the Scene view.

## What is in Step 2

| Part | What it does |
|---|---|
| **City** (fictional Navapur) | 3 x 3 crossings, 70 m apart, two-lane roads, raised footpaths, about 58 buildings, 4 hidden courtyards, light haze. Same layout every time. |
| **Left-hand traffic** | Like Indian roads: cars keep left; left turns are tight, right turns go wide. |
| **Traffic lights** | At crossings with 3+ roads. Green -> yellow -> red. Cars stop at the white line unless too close to stop safely. |
| **Traffic cars** (`LaneDriver`) | 14 cars (hatchback, sedan, SUV, pickup) in random colours. Slow for turns, brake for cars/people/you, and pull over to the left when a police car with siren comes from behind. |
| **Pedestrians** | 28 people walk round the blocks and keep left. They wait if blocked and run away when a chase comes near. |
| **Police patrol cars** | 2 cars patrol and obey lights. In a chase: lights flash, they ignore signals, take the shortest route to where they **last saw** you, overtake traffic, and drive straight at you when the way is clear. |
| **Police officers** | Jump out when the car is close. They run at 5.3 m/s: faster than your run (4.6), slower than your sprint (6.8). If one stays next to you for half a second: **BUSTED**. |
| **Police vision** | Range + view angle + "no wall in between". Hiding behind buildings really works. |
| **Escape** | Out of sight for 10 seconds = "YOU LOST THE POLICE". The officer walks back to his car and patrol starts again. |
| **Mini-map** | Round, top-left. Turns with the camera. Shows roads, blocks, buildings, police dots (flashing in a chase) and officers. Drawn with simple shapes, so it is cheap on phones. |

## Checklist (tell me what feels wrong)

| Test | Expected |
|---|---|
| Traffic | Drives on the left, turns smoothly, no cars stuck for long |
| Red light | Cars stop at the white line; go on green |
| Walk in front of a car | It brakes and waits |
| Pedestrians | Walk on footpaths, keep left, do not walk through you |
| CALL COPS | "COPS ARE COMING!", police lights flash, cars pull over |
| Police route | Police find you through the streets, not through buildings |
| Officer | Gets out near you and runs after you |
| Only running (not sprinting) | Officer catches you -> BUSTED -> restart at the start point |
| Sprint + hide in a courtyard | "OUT OF SIGHT - stay hidden 10s", then "YOU LOST THE POLICE" |
| Mini-map | Matches the streets; arrow points where Vikram faces |
| FPS | Green on your phone (30 on 4 GB phones, 60 on mid-range) |

## Things you can tune (no coding)

- **Police Dispatch (NMP)** -> `Lose Time`: seconds of hiding needed to escape.
- **Traffic Spawner** -> number of cars and police cars.
- **Pedestrian Spawner** -> number of people.
- Police car prefab (`Prefabs/Step2/Police_Car_NMP`) -> pursuit speed, how close before the officer gets out.
- Officer prefab -> run speed (make it 5.8 for a harder game, 4.8 for easier).
- Any traffic light (under **Traffic Signals**) -> green / yellow / red times.

## Known limits (on purpose for Step 2)

- Cars, people and police are simple shapes. Real low-poly models come in Step 8.
- Cars do not hit or hurt you yet; they stop for you. Crashes and damage come with driving (Step 3).
- The red CALL COPS button is only for testing. In Step 4, crimes and shooting start chases and
  the 5-star wanted levels decide how many police come (SWAT, roadblocks, helicopter).
- Police cars can drive over the footpath edge when going straight at you.
- No sounds yet (siren, horn, engines are Step 7).
- Path finding is the simple version: fine for this block; the full city in Step 6 gets the faster version.

## Change from Step 1

Vikram now uses a proper **Player** layer (was "Ignore Raycast"), and the camera only bumps
into buildings and ground, not people or cars. Run the Step 1 builder again if you want to
use the old test yard.
