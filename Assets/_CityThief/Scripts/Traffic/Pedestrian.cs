using UnityEngine;
using CityThief.Core;
using CityThief.Police;

namespace CityThief.Traffic
{
    // A person walking on the footpath.
    // - Walks around the block, keeps to the left.
    // - Waits if someone is in the way.
    // - Runs away in panic when a police chase comes close.
    // Cheap: no physics simulation, just a kinematic body that others can bump into.
    public class Pedestrian : MonoBehaviour
    {
        [SerializeField] float walkSpeedMin = 1.1f;
        [SerializeField] float walkSpeedMax = 1.6f;
        [SerializeField] float runSpeed = 4.2f;
        [SerializeField] float panicDistance = 14f;
        [SerializeField] float panicDuration = 5f;
        [SerializeField] float turnSpeed = 360f;

        PedestrianLoop loop;
        int targetIndex;
        int direction = 1;
        float walkSpeed;
        float sideOffset;
        float panicTimer;
        float waitTimer;
        float senseTimer;
        bool pathBlocked;
        Transform player;

        public void Init(PedestrianLoop walkLoop, int startTarget, int walkDirection)
        {
            loop = walkLoop;
            targetIndex = startTarget;
            direction = walkDirection >= 0 ? 1 : -1;
            walkSpeed = Random.Range(walkSpeedMin, walkSpeedMax);
            sideOffset = Random.Range(0.5f, 0.9f);   // keep left
        }

        void Start()
        {
            var p = GameObject.FindWithTag("Player");
            if (p != null) player = p.transform;
        }

        void Update()
        {
            if (loop == null || loop.Count < 2) return;
            float dt = Time.deltaTime;
            Vector3 pos = transform.position;

            // ---- Panic when a police chase is close ----
            var dispatch = PoliceDispatch.Instance;
            if (dispatch != null && dispatch.PursuitActive && player != null &&
                FlatDistance(pos, player.position) < panicDistance)
            {
                if (panicTimer <= 0f) FleeFrom(player.position);
                panicTimer = panicDuration;
            }
            panicTimer -= dt;
            bool panicking = panicTimer > 0f;

            // ---- Next point on the loop (shifted to the walker's left) ----
            Vector3 from = loop.GetPoint(targetIndex - direction);
            Vector3 to = loop.GetPoint(targetIndex);
            Vector3 segDir = to - from;
            segDir.y = 0f;
            segDir = segDir.sqrMagnitude > 0.001f ? segDir.normalized : transform.forward;
            Vector3 left = new Vector3(-segDir.z, 0f, segDir.x);
            Vector3 target = to + left * sideOffset;

            if (FlatDistance(pos, target) < 0.6f)
            {
                targetIndex += direction;
                return;
            }

            // ---- Someone in the way? Wait a moment, then step aside. ----
            senseTimer -= dt;
            if (senseTimer <= 0f)
            {
                senseTimer = 0.2f;
                int mask = (1 << ProjectLayers.Player) | (1 << ProjectLayers.NPC) | (1 << ProjectLayers.Vehicle);
                pathBlocked = Physics.SphereCast(pos + Vector3.up * 0.9f, 0.3f, transform.forward, out _, 1.0f,
                                                 mask, QueryTriggerInteraction.Ignore);
            }

            float speed = panicking ? runSpeed : walkSpeed;
            if (pathBlocked && !panicking)
            {
                speed = 0f;
                waitTimer += dt;
                if (waitTimer > 1.5f)
                {
                    sideOffset = sideOffset > 0f ? -0.4f : 0.8f;   // try the other side
                    waitTimer = 0f;
                }
            }
            else
            {
                waitTimer = 0f;
            }

            // ---- Turn and walk ----
            Vector3 moveDir = target - pos;
            moveDir.y = 0f;
            moveDir.Normalize();
            if (moveDir.sqrMagnitude > 0.001f)
                transform.rotation = Quaternion.RotateTowards(transform.rotation,
                    Quaternion.LookRotation(moveDir, Vector3.up), turnSpeed * dt);

            transform.position = pos + transform.forward * (speed * dt);
        }

        // Run the way that leads away from the danger.
        void FleeFrom(Vector3 danger)
        {
            Vector3 ahead = loop.GetPoint(targetIndex);
            Vector3 behind = loop.GetPoint(targetIndex - direction);
            if (FlatDistance(behind, danger) > FlatDistance(ahead, danger))
            {
                // Turn round: the point we came from becomes the new target.
                // (GetPoint wraps any number, so the index can go below 0.)
                int oldDirection = direction;
                direction = -direction;
                targetIndex -= oldDirection;
            }
        }

        static float FlatDistance(Vector3 a, Vector3 b)
        {
            a.y = 0f;
            b.y = 0f;
            return Vector3.Distance(a, b);
        }
    }
}
