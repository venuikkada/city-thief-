using UnityEngine;
using CityThief.Controls;

namespace CityThief.Player
{
    // Moves Vikram on foot: walk, run, sprint, crouch, jump, aim-walk.
    // Uses Unity's CharacterController (cheap, stable, good for phones).
    // Movement is relative to the camera: push the stick up = walk where the camera looks.
    [RequireComponent(typeof(CharacterController))]
    public class PlayerMotor : MonoBehaviour
    {
        [Header("Links")]
        [Tooltip("The game camera. Movement follows its direction.")]
        [SerializeField] Transform cameraTransform;
        [Tooltip("Optional placeholder body. It gets shorter when crouching. Leave empty once a real animated model is used.")]
        [SerializeField] Transform bodyVisual;

        [Header("Speed (metres per second)")]
        [SerializeField] float runSpeed = 4.6f;
        [SerializeField] float sprintSpeed = 6.8f;
        [SerializeField] float crouchSpeed = 1.7f;
        [SerializeField] float aimMoveSpeed = 2.4f;
        [Tooltip("How quickly Vikram reaches full speed.")]
        [SerializeField] float acceleration = 16f;
        [Tooltip("How quickly Vikram stops or changes direction.")]
        [SerializeField] float deceleration = 24f;
        [Tooltip("How much you can steer while in the air (0 = none, 1 = full).")]
        [Range(0f, 1f)] [SerializeField] float airControl = 0.35f;
        [Tooltip("How fast the body turns to face the move direction (degrees per second).")]
        [SerializeField] float turnSpeed = 720f;

        [Header("Jump and gravity")]
        [SerializeField] float jumpHeight = 1.1f;
        [SerializeField] float gravity = -22f;
        [Tooltip("You can still jump this many seconds after walking off an edge. Makes jumps feel fair.")]
        [SerializeField] float coyoteTime = 0.12f;
        [Tooltip("A jump tap this many seconds before landing still counts.")]
        [SerializeField] float jumpBuffer = 0.12f;
        [SerializeField] float maxFallSpeed = -40f;

        [Header("Crouch")]
        [SerializeField] float standHeight = 1.8f;
        [SerializeField] float crouchHeight = 1.15f;
        [Tooltip("How fast the body goes down/up (metres per second).")]
        [SerializeField] float crouchBlendSpeed = 5f;

        [Header("Pushing objects")]
        [SerializeField] float pushStrength = 60f;

        [Header("Safety")]
        [Tooltip("If Vikram falls below this height, he is put back at the start.")]
        [SerializeField] float respawnBelowY = -30f;

        // Read by the camera, animations, and (later) the police AI.
        public bool IsGrounded { get; private set; }
        public bool IsCrouching { get; private set; }
        public bool IsSprinting { get; private set; }
        public bool IsAiming { get; private set; }
        public float HorizontalSpeed { get; private set; }
        public Vector3 Velocity { get; private set; }

        // Other systems (vehicles, cutscenes) can switch movement off.
        public bool ControlsEnabled { get; set; } = true;

        CharacterController controller;
        Vector3 horizontalVelocity;
        float verticalVelocity;
        float lastGroundedTime = -99f;
        float lastJumpPressTime = -99f;
        Vector3 spawnPosition;
        Quaternion spawnRotation;
        Vector3 bodyBaseScale;
        Vector3 bodyBasePosition;

        void Awake()
        {
            controller = GetComponent<CharacterController>();
            spawnPosition = transform.position;
            spawnRotation = transform.rotation;

            if (cameraTransform == null && Camera.main != null) cameraTransform = Camera.main.transform;

            if (bodyVisual != null)
            {
                bodyBaseScale = bodyVisual.localScale;
                bodyBasePosition = bodyVisual.localPosition;
            }

            SetControllerHeight(standHeight);
        }

        void Update()
        {
            float dt = Time.deltaTime;
            if (dt <= 0f) return;

            var input = PlayerInputHub.Instance;
            bool hasInput = input != null && ControlsEnabled;

            Vector2 move = hasInput ? input.Move : Vector2.zero;
            bool wantsSprint = hasInput && input.Sprint;

            // ---- Aim and crouch toggles ----
            if (hasInput && input.AimPressed) IsAiming = !IsAiming;

            if (hasInput && input.CrouchPressed)
            {
                if (IsCrouching) TryStandUp();
                else IsCrouching = true;
            }

            // Sprinting is only for running forward-ish, not while aiming.
            wantsSprint = wantsSprint && move.magnitude > 0.5f && !IsAiming;
            if (wantsSprint && IsCrouching) TryStandUp();   // like PUBG: sprint makes you stand
            IsSprinting = wantsSprint && !IsCrouching;

            // ---- Which way is "forward"? The camera decides. ----
            Vector3 camForward = cameraTransform != null ? cameraTransform.forward : transform.forward;
            camForward.y = 0f;
            if (camForward.sqrMagnitude < 0.0001f) camForward = transform.forward;
            camForward.Normalize();
            Vector3 camRight = new Vector3(camForward.z, 0f, -camForward.x);

            Vector3 wishDirection = camForward * move.y + camRight * move.x;
            float inputStrength = Mathf.Clamp01(wishDirection.magnitude);
            if (inputStrength > 0.001f) wishDirection /= wishDirection.magnitude;

            // ---- Target speed ----
            float maxSpeed = IsCrouching ? crouchSpeed : (IsAiming ? aimMoveSpeed : runSpeed);
            float targetSpeed = IsSprinting ? sprintSpeed : maxSpeed * inputStrength;
            Vector3 targetVelocity = wishDirection * targetSpeed;

            // Speed up and slow down smoothly (feels heavier, more real).
            bool speedingUp = targetVelocity.sqrMagnitude > horizontalVelocity.sqrMagnitude;
            float rate = speedingUp ? acceleration : deceleration;
            if (!IsGrounded) rate *= airControl;
            horizontalVelocity = Vector3.MoveTowards(horizontalVelocity, targetVelocity, rate * dt);

            // ---- Jump ----
            if (IsGrounded) lastGroundedTime = Time.time;
            if (hasInput && input.JumpPressed) lastJumpPressTime = Time.time;

            bool jumpQueued = Time.time - lastJumpPressTime <= jumpBuffer;
            bool canJump = Time.time - lastGroundedTime <= coyoteTime;
            if (jumpQueued && canJump)
            {
                lastJumpPressTime = -99f;
                if (IsCrouching)
                {
                    // First tap while crouched just stands up (like PUBG).
                    TryStandUp();
                }
                else
                {
                    verticalVelocity = Mathf.Sqrt(2f * jumpHeight * -gravity);
                    lastGroundedTime = -99f;
                }
            }

            // ---- Gravity ----
            if (IsGrounded && verticalVelocity < 0f) verticalVelocity = -3f;   // keeps feet on slopes and stairs
            verticalVelocity = Mathf.Max(verticalVelocity + gravity * dt, maxFallSpeed);

            // ---- Move ----
            Vector3 before = transform.position;
            CollisionFlags flags = controller.Move((horizontalVelocity + Vector3.up * verticalVelocity) * dt);
            IsGrounded = controller.isGrounded;

            // Hit the head on a ceiling: stop going up.
            if ((flags & CollisionFlags.Above) != 0 && verticalVelocity > 0f) verticalVelocity = 0f;

            Velocity = (transform.position - before) / dt;
            HorizontalSpeed = new Vector3(Velocity.x, 0f, Velocity.z).magnitude;

            // ---- Turn the body ----
            Vector3 faceDirection;
            float turnRate = turnSpeed;
            if (IsAiming)
            {
                faceDirection = camForward;    // aim = always face where the camera looks
                turnRate *= 1.5f;
            }
            else
            {
                faceDirection = inputStrength > 0.1f ? wishDirection : Vector3.zero;
            }

            if (faceDirection.sqrMagnitude > 0.0001f)
            {
                Quaternion targetRotation = Quaternion.LookRotation(faceDirection, Vector3.up);
                transform.rotation = Quaternion.RotateTowards(transform.rotation, targetRotation, turnRate * dt);
            }

            // ---- Crouch height (smooth) ----
            float targetHeight = IsCrouching ? crouchHeight : standHeight;
            if (!Mathf.Approximately(controller.height, targetHeight))
            {
                SetControllerHeight(Mathf.MoveTowards(controller.height, targetHeight, crouchBlendSpeed * dt));
            }

            // ---- Fell off the world? ----
            if (transform.position.y < respawnBelowY) Respawn();
        }

        // Stand up only if there is room above the head.
        bool TryStandUp()
        {
            float radius = controller.radius * 0.95f;
            Vector3 low = transform.position + Vector3.up * (controller.height * 0.5f);
            Vector3 high = transform.position + Vector3.up * (standHeight - controller.radius);
            int mask = ~(1 << gameObject.layer);   // ignore the player's own layer

            if (high.y > low.y && Physics.CheckCapsule(low, high, radius, mask, QueryTriggerInteraction.Ignore))
                return false;   // something above: stay crouched

            IsCrouching = false;
            return true;
        }

        void SetControllerHeight(float height)
        {
            controller.height = height;
            controller.center = new Vector3(0f, height * 0.5f, 0f);

            if (bodyVisual != null)
            {
                float ratio = height / standHeight;
                bodyVisual.localScale = new Vector3(bodyBaseScale.x, bodyBaseScale.y * ratio, bodyBaseScale.z);
                bodyVisual.localPosition = new Vector3(bodyBasePosition.x, bodyBasePosition.y * ratio, bodyBasePosition.z);
            }
        }

        public void Respawn()
        {
            TeleportTo(spawnPosition, spawnRotation);
        }

        // Safe teleport: the CharacterController must be off while moving it by hand.
        public void TeleportTo(Vector3 position, Quaternion rotation)
        {
            controller.enabled = false;
            transform.SetPositionAndRotation(position, rotation);
            controller.enabled = true;
            horizontalVelocity = Vector3.zero;
            verticalVelocity = 0f;
        }

        // Let Vikram push crates, bins and other loose objects.
        void OnControllerColliderHit(ControllerColliderHit hit)
        {
            Rigidbody body = hit.collider.attachedRigidbody;
            if (body == null || body.isKinematic) return;
            if (hit.moveDirection.y < -0.3f) return;   // standing on top, not pushing

            Vector3 pushDirection = new Vector3(hit.moveDirection.x, 0f, hit.moveDirection.z);
            body.AddForceAtPosition(pushDirection * pushStrength, hit.point, ForceMode.Force);
        }
    }
}
