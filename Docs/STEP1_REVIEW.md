# Step 1 review: on-foot movement and camera

## What is in Step 1

| File | What it does |
|---|---|
| `Scripts/Controls/VirtualJoystick.cs` | Left-side floating joystick. Appears under your thumb. Push to the edge = sprint (knob turns yellow). |
| `Scripts/Controls/TouchLookZone.cs` | Drag anywhere on the screen to turn the camera. Same feel on every screen size. |
| `Scripts/Controls/TouchButton.cs` | Round multi-touch buttons. AIM button also lets you drag to look (PUBG-style). |
| `Scripts/Controls/PlayerInputHub.cs` | Collects all input in one place. Keyboard works too when testing on a computer. |
| `Scripts/Player/PlayerMotor.cs` | Walk, run, sprint, crouch, jump, aim-walk, push crates. Smooth speed-up and slow-down. |
| `Scripts/Player/PlayerAnimatorBridge.cs` | Ready for the real Vikram model and animations later. |
| `Scripts/CameraSystem/ThirdPersonCamera.cs` | Over-the-shoulder camera. Zooms in on AIM, wider when sprinting, never goes through walls. |
| `Scripts/Core/GameSettings.cs` | Sensitivity, aim sensitivity, invert-look, gyro, left-hand layout, fire button size (saved on phone). |
| `Scripts/Core/GameBootstrap.cs` | 30 FPS on phones with 4 GB RAM or less, 60 FPS on better phones. Landscape only. Screen stays on. |
| `Scripts/HUD/FpsCounter.cs` | FPS on screen (green / yellow / red). |
| `Editor/Step1SceneBuilder.cs` | One click builds the whole test scene. |

## How to test (5 minutes)

1. Open the project in Unity (see README setup).
2. Top menu: **City Thief -> Step 1 - Build Movement Test Scene**.
3. Press **Play**.
   - **Mouse**: click-drag in the bottom-left to use the joystick; drag anywhere else to look.
   - **Keyboard**: W A S D move, Shift sprint, Space jump, C crouch, Q aim.
   - Best: switch the Game tab to **Simulator** and pick a phone to see the real screen layout.
4. **On a real phone** (most important):
   - On the phone: Settings -> About phone -> tap "Build number" 7 times -> Developer options -> turn on **USB debugging**.
   - Plug in with USB. In Unity: **File -> Build And Run**.
   - Or build an APK and share it on WhatsApp to your own phone to install.

## Checklist (please tell me what feels wrong)

| Test | Expected |
|---|---|
| Thumb on left side | Joystick appears under the thumb |
| Small push | Slow walk |
| Full push | Run |
| Push past the edge | Sprint, knob turns yellow, camera widens a little |
| Drag on right side | Camera turns at once, no lag |
| Move + look together (two thumbs) | Both work at the same time |
| JUMP | Jumps about 1.1 m. Can climb the 1.0 m yellow box |
| CROUCH | Goes low. Can walk through the yellow-roof tunnel |
| Stand up inside tunnel | Not allowed (no room), stays crouched |
| Sprint while crouched | Stands up and sprints (when there is room) |
| AIM | Camera moves close over the right shoulder and zooms in; Vikram faces where you look; slower walk |
| Drag on AIM button | Also turns the camera |
| Walk to a wall / pillars | Camera slides in front of the wall, never shows inside it |
| Push crates | Crates slide |
| Stairs and ramp | Walk up smoothly without jumping |
| FPS text | Green on your phone |

## Things you can tune in the Inspector (no coding)

Select **Vikram (Player)** -> `PlayerMotor`: run/sprint speed, jump height, turn speed, crouch height.
Select **Main Camera** -> `ThirdPersonCamera`: distance, shoulder offset, look speed (`Degrees Per Pixel`), field of view.
Joystick zone -> `VirtualJoystick`: dead zone and how far to push for sprint.

## Known limits (on purpose for Step 1)

- Vikram is a blue capsule. Real model + animations come later (free option: Mixamo animations on an original model).
- FIRE, RELOAD, SWITCH WEAPON, PICK UP, ENTER VEHICLE buttons come in Steps 3-4. Space on the right is kept for them.
- Mini-map, wanted stars, pause and objective are placeholders.
- Settings screen (sliders, gyro, left-hand layout) is Step 7. The saved values already exist in `GameSettings`.
