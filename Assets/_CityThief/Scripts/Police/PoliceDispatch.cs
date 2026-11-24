using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using CityThief.Player;

namespace CityThief.Police
{
    // Police radio control room.
    // - Starts and ends a chase, tells every police unit.
    // - Remembers where the player was LAST SEEN (police go there, not to the
    //   player's real position, so hiding really works).
    // - If no unit sees the player for "loseTime" seconds, the chase ends.
    // - When an officer catches the player: BUSTED.
    //
    // Step 4 adds the 5-star wanted system on top of this.
    public class PoliceDispatch : MonoBehaviour
    {
        public static PoliceDispatch Instance { get; private set; }

        // Every police car adds itself here.
        public static readonly List<PoliceCar> Units = new List<PoliceCar>();

        [Tooltip("Seconds out of police sight needed to escape.")]
        [SerializeField] float loseTime = 10f;
        [Tooltip("Seconds the BUSTED screen shows before the player restarts.")]
        [SerializeField] float bustedDelay = 2.5f;

        public PlayerMotor Player { get; private set; }
        public bool PursuitActive { get; private set; }
        public Vector3 LastKnownPosition { get; private set; }
        public float TimeSinceSeen { get; private set; }
        public float LoseTime => loseTime;

        public event Action PursuitStarted;
        public event Action<bool> PursuitEnded;   // true = player escaped, false = caught / reset
        public event Action PlayerBusted;

        bool busting;

        void Awake()
        {
            Instance = this;
            Player = FindFirstObjectByType<PlayerMotor>();
        }

        void OnDestroy()
        {
            if (Instance == this) Instance = null;
        }

        void Update()
        {
            if (!PursuitActive || busting) return;
            TimeSinceSeen += Time.deltaTime;
            if (TimeSinceSeen >= loseTime) EndPursuit(true);
        }

        public void StartPursuit()
        {
            if (PursuitActive || Player == null) return;
            PursuitActive = true;
            TimeSinceSeen = 0f;
            LastKnownPosition = Player.transform.position;
            foreach (var unit in Units) if (unit != null) unit.BeginPursuit();
            PursuitStarted?.Invoke();
        }

        // Any police unit that sees the player calls this.
        public void ReportSighting(Vector3 position)
        {
            if (!PursuitActive) return;
            LastKnownPosition = position;
            TimeSinceSeen = 0f;
        }

        public void EndPursuit(bool escaped)
        {
            if (!PursuitActive) return;
            PursuitActive = false;
            foreach (var unit in Units) if (unit != null) unit.EndPursuit();
            PursuitEnded?.Invoke(escaped);
        }

        // An officer has hold of the player.
        public void PlayerCaught()
        {
            if (busting || !PursuitActive || Player == null) return;
            StartCoroutine(BustedRoutine());
        }

        IEnumerator BustedRoutine()
        {
            busting = true;
            Player.ControlsEnabled = false;
            PlayerBusted?.Invoke();
            yield return new WaitForSeconds(bustedDelay);
            EndPursuit(false);
            Player.Respawn();
            Player.ControlsEnabled = true;
            busting = false;
        }
    }
}
