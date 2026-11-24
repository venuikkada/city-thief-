using UnityEngine;
using CityThief.Core;

namespace CityThief.Police
{
    // A police officer on foot.
    // Runs a bit slower than Vikram's SPRINT (5.3 vs 6.8 m/s) but faster than his RUN,
    // so the player must sprint and break line of sight to escape.
    // Goes to where the player was last seen, steps round walls and cars,
    // and catches the player if he stays close for a moment.
    [RequireComponent(typeof(CharacterController))]
    public class PoliceOfficer : MonoBehaviour
    {
        [SerializeField] float runSpeed = 5.3f;
        [SerializeField] float walkSpeed = 2.6f;
        [SerializeField] float turnSpeed = 540f;
        [SerializeField] float catchDistance = 1.5f;
        [Tooltip("How long the player must stay within catch distance to be caught.")]
        [SerializeField] float catchTime = 0.5f;
        [SerializeField] float sightRange = 35f;
        [SerializeField] float gravity = -20f;

        PoliceCar homeCar;
        CharacterController controller;
        bool returning;
        float verticalVelocity;
        float catchTimer;
        float sightTimer;
        float avoidSide = 1f;

        void Awake()
        {
            controller = GetComponent<CharacterController>();
        }

        public void Init(PoliceCar car)
        {
            homeCar = car;
        }

        public void ReturnToCar()
        {
            returning = true;
        }

        void Update()
        {
            var dispatch = PoliceDispatch.Instance;
            if (dispatch == null || dispatch.Player == null) return;
            float dt = Time.deltaTime;
            Transform player = dispatch.Player.transform;

            Vector3 goal;
            float speed;

            if (returning)
            {
                if (homeCar == null) { Destroy(gameObject); return; }
                goal = homeCar.transform.position;
                speed = walkSpeed;
                if (FlatDistance(transform.position, goal) < 3f)
                {
                    homeCar.OfficerReturned(this);
                    Destroy(gameObject);
                    return;
                }
            }
            else
            {
                // ---- Look for the player ----
                sightTimer -= dt;
                if (sightTimer <= 0f)
                {
                    sightTimer = 0.2f;
                    Vector3 eye = transform.position + Vector3.up * 1.6f;
                    if (PoliceVision.CanSee(eye, transform.forward, player, sightRange, 150f))
                        dispatch.ReportSighting(player.position);
                }

                goal = dispatch.LastKnownPosition;
                speed = FlatDistance(transform.position, goal) < 1f ? 0f : runSpeed;

                // ---- Catch ----
                if (FlatDistance(transform.position, player.position) < catchDistance)
                {
                    catchTimer += dt;
                    if (catchTimer >= catchTime)
                    {
                        catchTimer = 0f;
                        dispatch.PlayerCaught();
                    }
                }
                else
                {
                    catchTimer = 0f;
                }
            }

            // ---- Move (go round walls and cars) ----
            Vector3 dir = goal - transform.position;
            dir.y = 0f;
            if (dir.sqrMagnitude > 0.01f) dir = AvoidObstacles(dir.normalized);
            else speed = 0f;

            if (dir.sqrMagnitude > 0.01f)
                transform.rotation = Quaternion.RotateTowards(transform.rotation,
                    Quaternion.LookRotation(dir, Vector3.up), turnSpeed * dt);

            if (controller.isGrounded && verticalVelocity < 0f) verticalVelocity = -2f;
            verticalVelocity += gravity * dt;

            Vector3 move = transform.forward * speed + Vector3.up * verticalVelocity;
            controller.Move(move * dt);
        }

        // If the straight way is blocked, try angles to the side.
        // Remembers which side worked, so he does not wobble left-right.
        Vector3 AvoidObstacles(Vector3 dir)
        {
            if (!Blocked(dir)) return dir;
            for (int i = 1; i <= 3; i++)
            {
                float angle = 35f * i;
                Vector3 preferred = Quaternion.Euler(0f, angle * avoidSide, 0f) * dir;
                if (!Blocked(preferred)) return preferred;
                Vector3 other = Quaternion.Euler(0f, -angle * avoidSide, 0f) * dir;
                if (!Blocked(other))
                {
                    avoidSide = -avoidSide;
                    return other;
                }
            }
            return dir;
        }

        bool Blocked(Vector3 dir)
        {
            return Physics.SphereCast(transform.position + Vector3.up * 0.9f, 0.3f, dir, out _, 1.6f,
                                      ProjectLayers.WalkerObstacleMask, QueryTriggerInteraction.Ignore);
        }

        static float FlatDistance(Vector3 a, Vector3 b)
        {
            a.y = 0f;
            b.y = 0f;
            return Vector3.Distance(a, b);
        }
    }
}
