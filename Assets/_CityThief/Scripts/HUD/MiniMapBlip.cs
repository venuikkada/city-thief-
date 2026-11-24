using System.Collections.Generic;
using UnityEngine;

namespace CityThief.HUD
{
    // Put this on anything that should show as a dot on the mini-map
    // (police cars, officers, later: mission targets, Ravi, the warehouse).
    public class MiniMapBlip : MonoBehaviour
    {
        public static readonly List<MiniMapBlip> All = new List<MiniMapBlip>();

        public Color color = new Color(0.2f, 0.4f, 1f);
        public Color flashColor = new Color(1f, 0.15f, 0.15f);
        public float size = 16f;

        // Police set this during a chase so their dots flash red/blue.
        public bool Flashing { get; set; }

        void OnEnable() => All.Add(this);
        void OnDisable() => All.Remove(this);
    }
}
