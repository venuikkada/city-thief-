using UnityEngine;
using CityThief.Core;

namespace CityThief.Police
{
    // "Can this police unit see the player?"
    // Checks distance, view angle, and that no building is in the way.
    public static class PoliceVision
    {
        public static bool CanSee(Vector3 eye, Vector3 forward, Transform target,
                                  float range, float fieldOfView, float closeRange = 8f)
        {
            if (target == null) return false;

            Vector3 chest = target.position + Vector3.up * 1.2f;
            Vector3 toTarget = chest - eye;
            float distance = toTarget.magnitude;
            if (distance > range) return false;

            // Very close = noticed even from behind (they hear you).
            if (distance > closeRange && Vector3.Angle(forward, toTarget) > fieldOfView * 0.5f) return false;

            return !Physics.Linecast(eye, chest, ProjectLayers.SightBlockMask, QueryTriggerInteraction.Ignore);
        }
    }
}
