using UnityEngine;

namespace CityThief.Traffic
{
    // A closed walking path on a footpath (sidewalk), for example around one block.
    public class PedestrianLoop : MonoBehaviour
    {
        [SerializeField] Vector3[] points = new Vector3[0];

        public int Count => points.Length;

        public Vector3 GetPoint(int index)
        {
            int n = points.Length;
            return points[((index % n) + n) % n];
        }

        // Called by the scene builder.
        public void SetPoints(Vector3[] newPoints)
        {
            points = newPoints;
        }

        void OnDrawGizmosSelected()
        {
            Gizmos.color = Color.magenta;
            for (int i = 0; i < points.Length; i++)
                Gizmos.DrawLine(points[i] + Vector3.up * 0.1f, GetPoint(i + 1) + Vector3.up * 0.1f);
        }
    }
}
