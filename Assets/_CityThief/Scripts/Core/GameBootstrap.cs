using UnityEngine;

namespace CityThief.Core
{
    // Runs once when the game starts.
    // Sets the frame rate based on how strong the phone is.
    public class GameBootstrap : MonoBehaviour
    {
        [Tooltip("Frame rate for low-end phones (about 4 GB RAM or less).")]
        [SerializeField] int lowEndFps = 30;

        [Tooltip("Frame rate for mid-range and better phones.")]
        [SerializeField] int normalFps = 60;

        [Tooltip("Phones with this much RAM (in MB) or less count as low-end.")]
        [SerializeField] int lowEndRamMb = 4500;

        public static bool IsLowEndDevice { get; private set; }

        void Awake()
        {
            // Phone reports RAM in MB. A "4 GB" phone usually reports about 3600-3900.
            IsLowEndDevice = SystemInfo.systemMemorySize <= lowEndRamMb;

            // On phones, vSync is ignored, so targetFrameRate decides the FPS.
            QualitySettings.vSyncCount = 0;
            Application.targetFrameRate = IsLowEndDevice ? lowEndFps : normalFps;

            // Do not let the screen turn off while playing.
            Screen.sleepTimeout = SleepTimeout.NeverSleep;

            // Landscape only (both sides allowed).
            Screen.autorotateToPortrait = false;
            Screen.autorotateToPortraitUpsideDown = false;
            Screen.autorotateToLandscapeLeft = true;
            Screen.autorotateToLandscapeRight = true;
            Screen.orientation = ScreenOrientation.AutoRotation;
        }
    }
}
