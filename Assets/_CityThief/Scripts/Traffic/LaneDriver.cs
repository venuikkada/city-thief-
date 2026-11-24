using System.Collections.Generic;
using UnityEngine;
using CityThief.Core;

namespace CityThief.Traffic
{
    // The "AI driver" for traffic cars and police cars.
    // - Follows lanes from node to node, slows down for turns.
    // - Stops at red lights, brakes for cars, people and the player ahead.
    // - Pulls over to the left when a police car with siren comes from behind.
    // - Police can give it a route (path to the player) or a direct target.
    //
    // Traffic uses a kinematic Rigidbody + one box collider:
    // very cheap on phones, and still blocks the player and other cars.
    [RequireComponent(typeof(Rigidbody))]
    public class LaneDriver : MonoBehaviour
    {
        [Header("Driving")]
        [Tooltip("Normal speed in metres per second (11 m/s = about 40 km/h).")]
        public float cruiseSpeed = 11f;
        public float acceleration = 3.5f;
        public float brakeDeceleration = 8f;
        [Tooltip("Speed used when going round a corner.")]
        public float cornerSpeed = 6f;
        public bool obeySignals = true;

        [Header("Sensing")]
        [SerializeField] BoxCollider bodyCollider;

        // Police cars set this while chasing (siren on).
        public bool IsPursuing
        {
            get => isPursuing;
            set
            {
                if (isPursuing == value) return;
                isPursuing = value;
                if (value) Pursuers.Add(this);
                else Pursuers.Remove(this);
            }
        }

        // When true the car stops and waits (for example, officer got out).
        public bool Hold { get; set; }

        public float Speed => speed;
        public TrafficNetwork Network => network;
        public bool IsOffRoad => directTarget.HasValue;

        static readonly List<LaneDriver> Pursuers = new List<LaneDriver>();
        static readonly List<int> PathBuffer = new List<int>();

        TrafficNetwork network;
        Rigidbody body;
        bool isPursuing;

        int prevNode = -1;
        int targetNode = -1;
        Vector3 segmentStart;
        readonly List<int> upcoming = new List<int>();   // planned nodes after the target

        Vector3? directTarget;
        float directStopDistance;

        float speed;
        float lateralOffset;          // + = move left (towards kerb), - = move right (overtake)
        float targetLateral;
        float overtakeTimer;
        float ignoreCarsTimer;        // breaks rare deadlocks at crossings
        float blockedTime;
        float sensorTimer;
        float yieldTimer;
        bool yielding;
        bool obstacleAhead;
        float obstacleDistance;
        Collider obstacle;

        float halfLength = 2.2f;
        float halfWidth = 0.9f;
        float sensorHeight = 0.8f;

        void Awake()
        {
            body = GetComponent<Rigidbody>();
            body.isKinematic = true;
            body.interpolation = RigidbodyInterpolation.Interpolate;

            if (bodyCollider == null) bodyCollider = GetComponent<BoxCollider>();
            if (bodyCollider != null)
            {
                halfLength = bodyCollider.size.z * 0.5f;
                halfWidth = bodyCollider.size.x * 0.5f;
                sensorHeight = bodyCollider.center.y;
            }
        }

        void OnDisable()
        {
            IsPursuing = false;
        }

        // Put the car on the road at a node, facing along the lane.
        public void Init(TrafficNetwork net, int startNode)
        {
            network = net;
            upcoming.Clear();
            prevNode = startNode;
            targetNode = PickNext(startNode);
            Vector3 start = net[startNode].position;
            segmentStart = start;

            Vector3 dir = targetNode >= 0 ? Flat(net[targetNode].position - start) : transform.forward;
            if (dir.sqrMagnitude < 0.001f) dir = transform.forward;
            Quaternion rot = Quaternion.LookRotation(dir, Vector3.up);
            transform.SetPositionAndRotation(start, rot);
            body.position = start;
            body.rotation = rot;
            speed = cruiseSpeed * 0.5f;
        }

        // Drive along the roads to this node (police use this).
        public void RouteTo(int goalNode)
        {
            if (network == null || targetNode < 0 || goalNode < 0) return;
            if (!network.FindPath(targetNode, goalNode, PathBuffer)) return;
            upcoming.Clear();
            for (int i = 1; i < PathBuffer.Count; i++) upcoming.Add(PathBuffer[i]);
        }

        public void ClearRoute()
        {
            upcoming.Clear();
        }

        // Leave the lanes and drive straight at a point (police final approach).
        public void SetDirectTarget(Vector3 point, float stopDistance)
        {
            directTarget = point;
            directStopDistance = stopDistance;
        }

        public void ClearDirectTarget()
        {
            if (!directTarget.HasValue) return;
            directTarget = null;
            RejoinNetwork();
        }

        void RejoinNetwork()
        {
            if (network == null) return;
            upcoming.Clear();
            prevNode = -1;
            segmentStart = body.position;
            targetNode = network.NearestNode(body.position, Flat(transform.forward));
        }

        void FixedUpdate()
        {
            if (network == null) return;
            float dt = Time.fixedDeltaTime;

            Vector3 pos = body.position;
            Quaternion rot = body.rotation;
            Vector3 forward = rot * Vector3.forward;

            float desired = cruiseSpeed;
            Vector3 aim;

            // ---- Where to drive ----
            if (directTarget.HasValue)
            {
                aim = directTarget.Value;
                float d = FlatDistance(pos, aim);
                desired = Mathf.Min(desired, StopSpeed(d - directStopDistance));
            }
            else
            {
                if (targetNode < 0) RejoinNetwork();
                if (targetNode < 0) return;

                Vector3 segDir = SegmentDirection();
                Vector3 targetPoint = TargetPoint(segDir);
                float dist = FlatDistance(pos, targetPoint);
                bool mustStop = obeySignals && network.MustStopAt(targetNode);

                // Reached (or passed) the target node? Move on to the next one.
                bool passed = Vector3.Dot(Flat(pos - targetPoint), segDir) > 0f;
                if (passed || (dist < 2.5f && !mustStop))
                {
                    Advance();
                    if (targetNode < 0) return;
                    segDir = SegmentDirection();
                    targetPoint = TargetPoint(segDir);
                    dist = FlatDistance(pos, targetPoint);
                    mustStop = obeySignals && network.MustStopAt(targetNode);
                }
                aim = targetPoint;

                // Slow down before a turn.
                int nextNode = PeekNext();
                if (nextNode >= 0)
                {
                    Vector3 nextDir = Flat(network[nextNode].position - network[targetNode].position);
                    if (Vector3.Angle(segDir, nextDir) > 25f)
                        desired = Mathf.Min(desired, Mathf.Lerp(cornerSpeed, cruiseSpeed, Mathf.InverseLerp(6f, 25f, dist)));
                }

                // Red or yellow light: stop at the line if we still can.
                if (mustStop)
                {
                    float stoppingDistance = speed * speed / (2f * brakeDeceleration);
                    if (stoppingDistance < dist + 1f)
                        desired = Mathf.Min(desired, StopSpeed(dist - 0.5f));
                }
            }

            // ---- Look ahead for cars, people, the player ----
            sensorTimer -= dt;
            if (sensorTimer <= 0f)
            {
                sensorTimer = 0.1f;
                obstacleAhead = SenseAhead(pos, rot, forward, out obstacleDistance, out obstacle);
            }
            if (obstacleAhead) desired = Mathf.Min(desired, StopSpeed(obstacleDistance - 2f));

            bool blockedByCar = obstacleAhead && obstacle != null && obstacle.gameObject.layer == ProjectLayers.Vehicle;
            blockedTime = (obstacleAhead && speed < 0.5f) ? blockedTime + dt : 0f;

            // Two cars blocking each other in a crossing for a long time: let this one squeeze through.
            if (blockedByCar && blockedTime > 6f) { ignoreCarsTimer = 1.5f; blockedTime = 0f; }
            if (ignoreCarsTimer > 0f) ignoreCarsTimer -= dt;

            // ---- Police: overtake slow cars by using the other lane ----
            if (IsPursuing)
            {
                if (blockedByCar && speed < 3f) overtakeTimer = 3f;
                overtakeTimer -= dt;
                targetLateral = overtakeTimer > 0f ? -3.8f : 0f;
            }
            else
            {
                // ---- Traffic: pull over for a police chase coming from behind ----
                yieldTimer -= dt;
                if (yieldTimer <= 0f)
                {
                    yieldTimer = 0.3f;
                    yielding = PursuerBehind(pos, forward);
                }
                targetLateral = yielding ? 1.6f : 0f;
                if (yielding) desired = Mathf.Min(desired, 1.5f);
            }
            lateralOffset = Mathf.MoveTowards(lateralOffset, targetLateral, 2.5f * dt);

            if (Hold) desired = 0f;

            // ---- Speed up / brake ----
            float rate = desired > speed ? acceleration : brakeDeceleration;
            if (obstacleAhead && obstacleDistance < 3f) rate = brakeDeceleration * 2f;   // emergency brake
            speed = Mathf.MoveTowards(speed, Mathf.Max(0f, desired), rate * dt);

            // ---- Steer towards the aim point ----
            Vector3 toAim = Flat(aim - pos);
            Quaternion newRot = rot;
            if (toAim.sqrMagnitude > 0.04f && speed > 0.1f)
            {
                // Faster car = turns faster, but a parked car cannot spin on the spot.
                float turnRate = Mathf.Max(25f, speed * 14f);
                newRot = Quaternion.RotateTowards(rot, Quaternion.LookRotation(toAim.normalized, Vector3.up), turnRate * dt);
            }

            body.MoveRotation(newRot);
            body.MovePosition(pos + (newRot * Vector3.forward) * (speed * dt));
        }

        bool SenseAhead(Vector3 pos, Quaternion rot, Vector3 forward, out float distance, out Collider hitCollider)
        {
            float range = 3f + speed * 1.1f;   // look further when driving fast
            Vector3 center = pos + Vector3.up * sensorHeight;
            Vector3 halfSize = new Vector3(halfWidth * 0.85f, 0.35f, 0.25f);
            int mask = ProjectLayers.TrafficObstacleMask;
            if (ignoreCarsTimer > 0f) mask &= ~(1 << ProjectLayers.Vehicle);

            // The box starts inside our own collider, which casts ignore.
            if (Physics.BoxCast(center, halfSize, forward, out RaycastHit hit, rot, halfLength + range,
                                mask, QueryTriggerInteraction.Ignore))
            {
                distance = hit.distance - halfLength;
                hitCollider = hit.collider;
                return true;
            }

            distance = float.MaxValue;
            hitCollider = null;
            return false;
        }

        static bool PursuerBehind(Vector3 pos, Vector3 forward)
        {
            foreach (var p in Pursuers)
            {
                if (p == null) continue;
                Vector3 offset = p.body.position - pos;
                if (offset.sqrMagnitude < 25f * 25f && Vector3.Dot(forward, offset) < 0f) return true;
            }
            return false;
        }

        void Advance()
        {
            prevNode = targetNode;
            segmentStart = network[prevNode].position;
            if (upcoming.Count > 0)
            {
                targetNode = upcoming[0];
                upcoming.RemoveAt(0);
            }
            else
            {
                targetNode = PickNext(prevNode);
            }
        }

        int PeekNext()
        {
            if (upcoming.Count == 0 && targetNode >= 0)
            {
                int n = PickNext(targetNode);
                if (n >= 0) upcoming.Add(n);
            }
            return upcoming.Count > 0 ? upcoming[0] : -1;
        }

        int PickNext(int node)
        {
            var options = network[node].next;
            if (options.Count == 0) return -1;
            return options[Random.Range(0, options.Count)];
        }

        Vector3 SegmentDirection()
        {
            Vector3 dir = Flat(network[targetNode].position - segmentStart);
            return dir.sqrMagnitude > 0.0001f ? dir.normalized : Flat(transform.forward).normalized;
        }

        // The target node, shifted sideways when pulling over or overtaking.
        Vector3 TargetPoint(Vector3 segDir)
        {
            Vector3 left = new Vector3(-segDir.z, 0f, segDir.x);
            return network[targetNode].position + left * lateralOffset;
        }

        // Highest speed from which we can still stop within this distance.
        float StopSpeed(float distance)
        {
            if (distance <= 0f) return 0f;
            return Mathf.Sqrt(2f * brakeDeceleration * 0.7f * distance);
        }

        static Vector3 Flat(Vector3 v)
        {
            v.y = 0f;
            return v;
        }

        static float FlatDistance(Vector3 a, Vector3 b)
        {
            a.y = 0f;
            b.y = 0f;
            return Vector3.Distance(a, b);
        }
    }
}
