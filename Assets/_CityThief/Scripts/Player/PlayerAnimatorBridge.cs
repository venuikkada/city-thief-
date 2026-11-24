using UnityEngine;

namespace CityThief.Player
{
    // Sends movement info to the Animator (when a real character model is added).
    // Animator parameters it looks for (all optional):
    //   Speed (float), Grounded (bool), Crouch (bool), Aim (bool), Sprint (bool)
    // If a parameter is missing, it is simply skipped (no error spam).
    [RequireComponent(typeof(PlayerMotor))]
    public class PlayerAnimatorBridge : MonoBehaviour
    {
        [SerializeField] Animator animator;

        static readonly int SpeedId = Animator.StringToHash("Speed");
        static readonly int GroundedId = Animator.StringToHash("Grounded");
        static readonly int CrouchId = Animator.StringToHash("Crouch");
        static readonly int AimId = Animator.StringToHash("Aim");
        static readonly int SprintId = Animator.StringToHash("Sprint");

        PlayerMotor motor;
        bool hasSpeed, hasGrounded, hasCrouch, hasAim, hasSprint;

        void Awake()
        {
            motor = GetComponent<PlayerMotor>();
            if (animator == null) animator = GetComponentInChildren<Animator>();
            if (animator == null) return;

            foreach (var p in animator.parameters)
            {
                if (p.nameHash == SpeedId) hasSpeed = true;
                else if (p.nameHash == GroundedId) hasGrounded = true;
                else if (p.nameHash == CrouchId) hasCrouch = true;
                else if (p.nameHash == AimId) hasAim = true;
                else if (p.nameHash == SprintId) hasSprint = true;
            }
        }

        void Update()
        {
            if (animator == null) return;

            // Small damping so the walk/run blend does not flicker.
            if (hasSpeed) animator.SetFloat(SpeedId, motor.HorizontalSpeed, 0.1f, Time.deltaTime);
            if (hasGrounded) animator.SetBool(GroundedId, motor.IsGrounded);
            if (hasCrouch) animator.SetBool(CrouchId, motor.IsCrouching);
            if (hasAim) animator.SetBool(AimId, motor.IsAiming);
            if (hasSprint) animator.SetBool(SprintId, motor.IsSprinting);
        }
    }
}
