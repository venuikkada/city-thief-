using UnityEngine;
using CityThief.Controls;
using CityThief.Core;
using CityThief.Player;

namespace CityThief.CameraSystem
{
    // Over-the-shoulder camera, like PUBG third-person view.
    // - Drag on screen to turn (no lag on rotation: feels sharp on touch).
    // - AIM moves the camera closer over the right shoulder and zooms in.
    // - Camera never goes through walls (sphere check).
    // Runs after the player has moved (order 100) so there is no jitter.
    [DefaultExecutionOrder(100)]
    [RequireComponent(typeof(Camera))]
    public class ThirdPersonCamera : MonoBehaviour
    {
        [SerializeField] PlayerMotor target;

        [Header("Framing (metres)")]
        [SerializeField] float standPivotHeight = 1.55f;
        [SerializeField] float crouchPivotHeight = 1.05f;
        [SerializeField] float distance = 3.4f;
        [SerializeField] float aimDistance = 1.5f;
        [Tooltip("How far to the right of the head the camera sits.")]
        [SerializeField] float shoulderOffset = 0.5f;
        [SerializeField] float aimShoulderOffset = 0.65f;

        [Header("Look")]
        [Tooltip("Degrees of turn per 1080p-pixel of finger drag, at sensitivity 1.")]
        [SerializeField] float degreesPerPixel = 0.12f;
        [SerializeField] float minPitch = -40f;
        [SerializeField] float maxPitch = 65f;
        [SerializeField] float startPitch = 10f;

        [Header("Lens")]
        [SerializeField] float normalFov = 60f;
        [SerializeField] float sprintFov = 66f;
        [SerializeField] float aimFov = 42f;
        [SerializeField] float fovSpeed = 8f;
        [Tooltip("How fast (per second) the camera blends into and out of aim.")]
        [SerializeField] float aimBlendSpeed = 6f;

        [Header("Wall collision")]
        [SerializeField] float collisionRadius = 0.22f;
        [SerializeField] float minDistance = 0.4f;
        [Tooltip("Layers the camera bumps into. The player is on 'Ignore Raycast' so it is skipped.")]
        [SerializeField] LayerMask collisionMask = ~(1 << 2);

        public float Yaw => yaw;
        public float Pitch => pitch;

        Camera cam;
        float yaw;
        float pitch;
        float currentDistance;
        float currentPivotHeight;
        float aimBlend;

        void Awake()
        {
            cam = GetComponent<Camera>();
        }

        void Start()
        {
            pitch = startPitch;
            currentDistance = distance;
            currentPivotHeight = standPivotHeight;
            if (target != null) yaw = target.transform.eulerAngles.y;
            cam.fieldOfView = normalFov;
        }

        public void SetTarget(PlayerMotor newTarget, bool snapBehind = true)
        {
            target = newTarget;
            if (snapBehind && target != null) yaw = target.transform.eulerAngles.y;
        }

        void LateUpdate()
        {
            if (target == null) return;
            float dt = Time.deltaTime;

            // ---- Aim blend 0..1 ----
            aimBlend = Mathf.MoveTowards(aimBlend, target.IsAiming ? 1f : 0f, aimBlendSpeed * dt);

            // ---- Turn from finger drag ----
            var input = PlayerInputHub.Instance;
            if (input != null)
            {
                float sensitivity = GameSettings.LookSensitivity *
                                    Mathf.Lerp(1f, GameSettings.AimSensitivity, aimBlend);
                Vector2 turn = input.LookDelta * (degreesPerPixel * sensitivity);
                yaw += turn.x;
                pitch += GameSettings.InvertLook ? turn.y : -turn.y;
            }
            pitch = Mathf.Clamp(pitch, minPitch, maxPitch);
            yaw = Mathf.Repeat(yaw, 360f);
            Quaternion rotation = Quaternion.Euler(pitch, yaw, 0f);

            // ---- Pivot point near the head (lower when crouched) ----
            float wantPivotHeight = target.IsCrouching ? crouchPivotHeight : standPivotHeight;
            currentPivotHeight = Mathf.Lerp(currentPivotHeight, wantPivotHeight, 1f - Mathf.Exp(-10f * dt));
            Vector3 pivot = target.transform.position + Vector3.up * currentPivotHeight;

            // ---- Shoulder: stop early if a wall is beside the player ----
            Vector3 right = rotation * Vector3.right;
            float wantShoulder = Mathf.Lerp(shoulderOffset, aimShoulderOffset, aimBlend);
            float shoulder = wantShoulder;
            if (Physics.SphereCast(pivot, collisionRadius, right, out RaycastHit sideHit, wantShoulder,
                                   collisionMask, QueryTriggerInteraction.Ignore))
            {
                shoulder = Mathf.Max(0f, sideHit.distance);
            }
            Vector3 shoulderPoint = pivot + right * shoulder;

            // ---- Distance: pull in if a wall is behind ----
            Vector3 back = rotation * Vector3.back;
            float wantDistance = Mathf.Lerp(distance, aimDistance, aimBlend);
            float allowed = wantDistance;
            if (Physics.SphereCast(shoulderPoint, collisionRadius, back, out RaycastHit backHit, wantDistance,
                                   collisionMask, QueryTriggerInteraction.Ignore))
            {
                allowed = Mathf.Max(minDistance, backHit.distance);
            }

            // Pull in instantly (never see through walls), move out gently.
            if (allowed < currentDistance) currentDistance = allowed;
            else currentDistance = Mathf.Lerp(currentDistance, allowed, 1f - Mathf.Exp(-6f * dt));

            transform.SetPositionAndRotation(shoulderPoint + back * currentDistance, rotation);

            // ---- Field of view: wider when sprinting, narrow when aiming ----
            float baseFov = target.IsSprinting ? sprintFov : normalFov;
            float wantFov = Mathf.Lerp(baseFov, aimFov, aimBlend);
            cam.fieldOfView = Mathf.Lerp(cam.fieldOfView, wantFov, 1f - Mathf.Exp(-fovSpeed * dt));
        }
    }
}
