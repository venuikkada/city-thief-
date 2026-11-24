using UnityEngine;
#if (UNITY_EDITOR || UNITY_STANDALONE) && ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace CityThief.Controls
{
    // One place that collects ALL player input for this frame.
    // Game scripts read from here and never talk to buttons directly.
    // This makes it easy to add a keyboard, gamepad, or a new button layout later.
    //
    // Runs before other scripts (-50) so input is ready when the player moves.
    [DefaultExecutionOrder(-50)]
    public class PlayerInputHub : MonoBehaviour
    {
        public static PlayerInputHub Instance { get; private set; }

        [Header("On-foot touch controls")]
        [SerializeField] VirtualJoystick moveStick;
        [SerializeField] TouchLookZone lookZone;
        [SerializeField] TouchButton jumpButton;
        [SerializeField] TouchButton crouchButton;
        [SerializeField] TouchButton aimButton;

        // Movement: x = left/right, y = forward/back. Length 0 to 1.
        public Vector2 Move { get; private set; }

        // Camera turn this frame (in "1080p screen pixels").
        public Vector2 LookDelta { get; private set; }

        public bool Sprint { get; private set; }
        public bool JumpPressed { get; private set; }
        public bool CrouchPressed { get; private set; }
        public bool AimPressed { get; private set; }

        void Awake()
        {
            Instance = this;
        }

        void OnDestroy()
        {
            if (Instance == this) Instance = null;
        }

        void Update()
        {
            Vector2 move = moveStick != null ? moveStick.Value : Vector2.zero;
            bool sprint = moveStick != null && moveStick.AtEdge;
            Vector2 look = lookZone != null ? lookZone.ConsumeDelta() : Vector2.zero;
            bool jump = Consume(jumpButton);
            bool crouch = Consume(crouchButton);
            bool aim = Consume(aimButton);

#if UNITY_EDITOR || UNITY_STANDALONE
            // Keyboard helps when testing on a computer.
            // Mouse drag already works through the touch zones.
            ReadKeyboard(ref move, ref sprint, ref jump, ref crouch, ref aim);
#endif

            Move = Vector2.ClampMagnitude(move, 1f);
            Sprint = sprint;
            LookDelta = look;
            JumpPressed = jump;
            CrouchPressed = crouch;
            AimPressed = aim;
        }

        static bool Consume(TouchButton button)
        {
            return button != null && button.ConsumePress();
        }

#if UNITY_EDITOR || UNITY_STANDALONE
        // W A S D = move, Shift = sprint, Space = jump, C = crouch, Q = aim.
        static void ReadKeyboard(ref Vector2 move, ref bool sprint, ref bool jump, ref bool crouch, ref bool aim)
        {
#if ENABLE_INPUT_SYSTEM
            var kb = Keyboard.current;
            if (kb == null) return;
            Vector2 keys = Vector2.zero;
            if (kb.wKey.isPressed) keys.y += 1f;
            if (kb.sKey.isPressed) keys.y -= 1f;
            if (kb.dKey.isPressed) keys.x += 1f;
            if (kb.aKey.isPressed) keys.x -= 1f;
            if (keys != Vector2.zero) move = keys.normalized;
            sprint |= kb.leftShiftKey.isPressed;
            jump |= kb.spaceKey.wasPressedThisFrame;
            crouch |= kb.cKey.wasPressedThisFrame;
            aim |= kb.qKey.wasPressedThisFrame;
#elif ENABLE_LEGACY_INPUT_MANAGER
            Vector2 keys = Vector2.zero;
            if (Input.GetKey(KeyCode.W)) keys.y += 1f;
            if (Input.GetKey(KeyCode.S)) keys.y -= 1f;
            if (Input.GetKey(KeyCode.D)) keys.x += 1f;
            if (Input.GetKey(KeyCode.A)) keys.x -= 1f;
            if (keys != Vector2.zero) move = keys.normalized;
            sprint |= Input.GetKey(KeyCode.LeftShift);
            jump |= Input.GetKeyDown(KeyCode.Space);
            crouch |= Input.GetKeyDown(KeyCode.C);
            aim |= Input.GetKeyDown(KeyCode.Q);
#endif
        }
#endif
    }
}
