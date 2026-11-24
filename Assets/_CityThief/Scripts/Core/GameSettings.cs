using System;
using UnityEngine;

namespace CityThief.Core
{
    // Player settings, saved on the phone with PlayerPrefs.
    // Works fully offline. No login needed.
    // The Settings screen (Step 7) will change these values.
    public static class GameSettings
    {
        const string KeyLookSensitivity = "ct_look_sens";
        const string KeyAimSensitivity = "ct_aim_sens";
        const string KeyInvertLook = "ct_invert_look";
        const string KeyGyroAim = "ct_gyro_aim";
        const string KeyLeftHanded = "ct_left_handed";
        const string KeyFireButtonScale = "ct_fire_scale";

        // Fired when any setting changes, so screens can refresh.
        public static event Action Changed;

        static bool loaded;
        static float lookSensitivity;
        static float aimSensitivity;
        static bool invertLook;
        static bool gyroAim;
        static bool leftHanded;
        static float fireButtonScale;

        // How fast the camera turns when you drag. 1 = normal.
        public static float LookSensitivity
        {
            get { Load(); return lookSensitivity; }
            set { lookSensitivity = Mathf.Clamp(value, 0.1f, 3f); SaveFloat(KeyLookSensitivity, lookSensitivity); }
        }

        // Extra multiplier while aiming (scope). Lower = steadier aim.
        public static float AimSensitivity
        {
            get { Load(); return aimSensitivity; }
            set { aimSensitivity = Mathf.Clamp(value, 0.1f, 2f); SaveFloat(KeyAimSensitivity, aimSensitivity); }
        }

        // Drag up = look down (for players who like aircraft-style controls).
        public static bool InvertLook
        {
            get { Load(); return invertLook; }
            set { invertLook = value; SaveBool(KeyInvertLook, value); }
        }

        // Tilt the phone to fine-tune aim (added in Step 7).
        public static bool GyroAim
        {
            get { Load(); return gyroAim; }
            set { gyroAim = value; SaveBool(KeyGyroAim, value); }
        }

        // Swap the joystick and buttons for left-handed players (Step 7).
        public static bool LeftHanded
        {
            get { Load(); return leftHanded; }
            set { leftHanded = value; SaveBool(KeyLeftHanded, value); }
        }

        // Size of the FIRE button. 1 = normal.
        public static float FireButtonScale
        {
            get { Load(); return fireButtonScale; }
            set { fireButtonScale = Mathf.Clamp(value, 0.6f, 1.6f); SaveFloat(KeyFireButtonScale, fireButtonScale); }
        }

        static void Load()
        {
            if (loaded) return;
            loaded = true;
            lookSensitivity = PlayerPrefs.GetFloat(KeyLookSensitivity, 1f);
            aimSensitivity = PlayerPrefs.GetFloat(KeyAimSensitivity, 0.6f);
            invertLook = PlayerPrefs.GetInt(KeyInvertLook, 0) == 1;
            gyroAim = PlayerPrefs.GetInt(KeyGyroAim, 0) == 1;
            leftHanded = PlayerPrefs.GetInt(KeyLeftHanded, 0) == 1;
            fireButtonScale = PlayerPrefs.GetFloat(KeyFireButtonScale, 1f);
        }

        static void SaveFloat(string key, float value)
        {
            PlayerPrefs.SetFloat(key, value);
            PlayerPrefs.Save();
            Changed?.Invoke();
        }

        static void SaveBool(string key, bool value)
        {
            PlayerPrefs.SetInt(key, value ? 1 : 0);
            PlayerPrefs.Save();
            Changed?.Invoke();
        }
    }
}
