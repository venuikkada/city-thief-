using System;
using System.Collections.Generic;
using UnityEngine;

namespace CityThief.HUD
{
    // Simple map of the city for the mini-map: roads, blocks and buildings as rectangles.
    // Filled by the scene builder. Drawing rectangles is much cheaper on phones
    // than a second camera looking down at the city.
    public class CityMapData : MonoBehaviour
    {
        public enum Kind { Road = 0, Block = 1, Building = 2 }

        [Serializable]
        public struct MapRect
        {
            public Vector2 center;   // world X and Z, in metres
            public Vector2 size;
            public Kind kind;
        }

        [SerializeField] List<MapRect> rects = new List<MapRect>();

        public IReadOnlyList<MapRect> Rects => rects;

        public void Clear() => rects.Clear();

        public void Add(Vector2 center, Vector2 size, Kind kind)
        {
            rects.Add(new MapRect { center = center, size = size, kind = kind });
        }
    }
}
