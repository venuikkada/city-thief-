using UnityEngine;
using CityThief.Core;
using CityThief.HUD;
using CityThief.Traffic;

namespace CityThief.Police
{
    // A Navapur Metro Police patrol car.
    // PATROL: drives around like normal traffic, obeys lights, keeps an eye out.
    // PURSUIT: siren on, ignores lights, finds the shortest road route to where the
    //          player was last seen, overtakes traffic, drives straight at the player
    //          when there is a clear line, then an officer jumps out and chases on foot.
    [RequireComponent(typeof(LaneDriver))]
    public class PoliceCar : MonoBehaviour
    {
        public enum State { Patrol, Pursuit, WaitingForOfficer }

        [Header("Officer")]
        [SerializeField] PoliceOfficer officerPrefab;
        [SerializeField] Transform officerExitPoint;

        [Header("Lightbar")]
        [SerializeField] Renderer redLight;
        [SerializeField] Renderer blueLight;
        [SerializeField] float flashInterval = 0.25f;

        [Header("Driving")]
        [SerializeField] float patrolSpeed = 9f;
        [SerializeField] float pursuitSpeed = 16f;
        [SerializeField] float pursuitAcceleration = 5.5f;

        [Header("Chase")]
        [Tooltip("Drive straight at the target (off the lanes) when closer than this and nothing blocks the way.")]
        [SerializeField] float directChaseRange = 30f;
        [SerializeField] float directStopDistance = 7f;
        [Tooltip("Officer gets out when the car is this close to the player.")]
        [SerializeField] float deployRange = 12f;
        [SerializeField] float sightRange = 50f;
        [SerializeField] float repathInterval = 1f;
        [Tooltip("If the officer does not come back in time after a chase, he is removed.")]
        [SerializeField] float officerReturnTimeout = 20f;

        public State CurrentState { get; private set; }

        static readonly Color RedOn = new Color(1f, 0.1f, 0.1f);
        static readonly Color BlueOn = new Color(0.15f, 0.35f, 1f);
        static readonly Color LightOff = new Color(0.25f, 0.25f, 0.28f);

        LaneDriver driver;
        MiniMapBlip blip;
        PoliceOfficer officer;
        float defaultAcceleration;
        float repathTimer;
        float sightTimer;
        float flashTimer;
        float waitTimer;
        bool flashPhase;

        void Awake()
        {
            driver = GetComponent<LaneDriver>();
            blip = GetComponent<MiniMapBlip>();
            defaultAcceleration = driver.acceleration;
            driver.cruiseSpeed = patrolSpeed;
        }

        void OnEnable()
        {
            PoliceDispatch.Units.Add(this);
        }

        void OnDisable()
        {
            PoliceDispatch.Units.Remove(this);
        }

        void Start()
        {
            SetLights(false, false);
            var dispatch = PoliceDispatch.Instance;
            if (dispatch != null && dispatch.PursuitActive) BeginPursuit();
        }

        public void BeginPursuit()
        {
            CurrentState = State.Pursuit;
            driver.cruiseSpeed = pursuitSpeed;
            driver.acceleration = pursuitAcceleration;
            driver.obeySignals = false;
            driver.IsPursuing = true;
            driver.Hold = false;
            repathTimer = 0f;
            if (blip != null) blip.Flashing = true;
        }

        public void EndPursuit()
        {
            driver.IsPursuing = false;
            driver.obeySignals = true;
            driver.cruiseSpeed = patrolSpeed;
            driver.acceleration = defaultAcceleration;
            driver.ClearDirectTarget();
            driver.ClearRoute();
            SetLights(false, false);
            if (blip != null) blip.Flashing = false;

            if (officer != null)
            {
                // Wait for the officer to walk back and get in.
                officer.ReturnToCar();
                CurrentState = State.WaitingForOfficer;
                driver.Hold = true;
                waitTimer = officerReturnTimeout;
            }
            else
            {
                CurrentState = State.Patrol;
            }
        }

        // Called by the officer when he is back at the car.
        public void OfficerReturned(PoliceOfficer who)
        {
            if (who == officer) officer = null;
            if (CurrentState == State.WaitingForOfficer)
            {
                CurrentState = State.Patrol;
                driver.Hold = false;
            }
        }

        void Update()
        {
            var dispatch = PoliceDispatch.Instance;
            if (dispatch == null || dispatch.Player == null) return;
            Transform player = dispatch.Player.transform;
            float dt = Time.deltaTime;

            // ---- Eyes (5 times a second is enough) ----
            sightTimer -= dt;
            if (sightTimer <= 0f)
            {
                sightTimer = 0.2f;
                Vector3 eye = transform.position + Vector3.up * 1.4f;
                if (PoliceVision.CanSee(eye, transform.forward, player, sightRange, 160f))
                    dispatch.ReportSighting(player.position);
            }

            switch (CurrentState)
            {
                case State.Pursuit:
                    UpdatePursuit(dispatch, dt);
                    FlashLights(dt);
                    break;

                case State.WaitingForOfficer:
                    waitTimer -= dt;
                    if (waitTimer <= 0f)
                    {
                        if (officer != null) Destroy(officer.gameObject);
                        officer = null;
                        driver.Hold = false;
                        CurrentState = State.Patrol;
                    }
                    break;
            }
        }

        void UpdatePursuit(PoliceDispatch dispatch, float dt)
        {
            Vector3 goal = dispatch.LastKnownPosition;
            Vector3 flatOffset = goal - transform.position;
            flatOffset.y = 0f;
            float distance = flatOffset.magnitude;

            // Close and nothing in the way: leave the lane and go straight there.
            bool clearLine = distance < directChaseRange &&
                             !Physics.Linecast(transform.position + Vector3.up, goal + Vector3.up,
                                               ProjectLayers.SightBlockMask, QueryTriggerInteraction.Ignore);
            if (clearLine)
            {
                driver.SetDirectTarget(goal, directStopDistance);
            }
            else
            {
                driver.ClearDirectTarget();
                repathTimer -= dt;
                if (repathTimer <= 0f && driver.Network != null)
                {
                    repathTimer = repathInterval;
                    driver.RouteTo(driver.Network.NearestNode(goal));
                }
            }

            // Close enough and (almost) stopped: officer jumps out.
            bool playerFresh = dispatch.TimeSinceSeen < 1f;
            if (officer == null && officerPrefab != null && playerFresh &&
                distance < deployRange && driver.Speed < 1.5f)
            {
                DeployOfficer();
            }
        }

        void DeployOfficer()
        {
            Vector3 spot = officerExitPoint != null
                ? officerExitPoint.position
                : transform.position + transform.right * 1.6f;
            officer = Instantiate(officerPrefab, spot, transform.rotation);
            officer.Init(this);
        }

        void FlashLights(float dt)
        {
            flashTimer -= dt;
            if (flashTimer > 0f) return;
            flashTimer = flashInterval;
            flashPhase = !flashPhase;
            SetLights(flashPhase, !flashPhase);
        }

        void SetLights(bool redOn, bool blueOn)
        {
            RendererColor.Set(redLight, redOn ? RedOn : LightOff);
            RendererColor.Set(blueLight, blueOn ? BlueOn : LightOff);
        }
    }
}
