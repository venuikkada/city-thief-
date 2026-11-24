using UnityEngine;
using CityThief.Core;

namespace CityThief.Traffic
{
    // Traffic light for one crossing.
    // North-south roads (axis 0) and east-west roads (axis 1) take turns:
    // green -> yellow -> short all-red -> other road's turn.
    public class TrafficSignal : MonoBehaviour
    {
        public enum LightColor { Green, Yellow, Red }

        [SerializeField] float greenTime = 10f;
        [SerializeField] float yellowTime = 2.5f;
        [SerializeField] float allRedTime = 1.5f;
        [Tooltip("Shifts the timing so all crossings do not change together.")]
        [SerializeField] float timeOffset;

        [Tooltip("Light boxes facing cars on the north-south road.")]
        [SerializeField] Renderer[] axis0Heads;
        [Tooltip("Light boxes facing cars on the east-west road.")]
        [SerializeField] Renderer[] axis1Heads;

        static readonly Color Green = new Color(0.1f, 1f, 0.25f);
        static readonly Color Yellow = new Color(1f, 0.8f, 0.1f);
        static readonly Color Red = new Color(1f, 0.1f, 0.1f);

        LightColor shown0 = (LightColor)(-1);
        LightColor shown1 = (LightColor)(-1);

        float HalfCycle => greenTime + yellowTime + allRedTime;

        // Called by the scene builder.
        public void Configure(Renderer[] northSouthHeads, Renderer[] eastWestHeads, float offset)
        {
            axis0Heads = northSouthHeads;
            axis1Heads = eastWestHeads;
            timeOffset = offset;
        }

        public LightColor GetLight(int axis)
        {
            float t = Mathf.Repeat(Time.time + timeOffset + (axis == 1 ? HalfCycle : 0f), HalfCycle * 2f);
            if (t < greenTime) return LightColor.Green;
            if (t < greenTime + yellowTime) return LightColor.Yellow;
            return LightColor.Red;
        }

        public bool IsGreen(int axis) => GetLight(axis) == LightColor.Green;

        void Update()
        {
            // Only repaint when the colour changes (cheap).
            LightColor l0 = GetLight(0);
            LightColor l1 = GetLight(1);
            if (l0 != shown0) { Paint(axis0Heads, l0); shown0 = l0; }
            if (l1 != shown1) { Paint(axis1Heads, l1); shown1 = l1; }
        }

        static void Paint(Renderer[] heads, LightColor light)
        {
            if (heads == null) return;
            Color c = light == LightColor.Green ? Green : light == LightColor.Yellow ? Yellow : Red;
            foreach (var h in heads) RendererColor.Set(h, c);
        }
    }
}
