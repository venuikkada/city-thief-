using UnityEngine;

namespace CityThief.Traffic
{
    // Places people on the footpaths when the level starts.
    public class PedestrianSpawner : MonoBehaviour
    {
        [SerializeField] PedestrianLoop[] loops;
        [SerializeField] Pedestrian prefab;
        [SerializeField] int count = 28;
        [SerializeField] float minDistanceFromPlayer = 5f;

        void Start()
        {
            if (prefab == null || loops == null || loops.Length == 0) return;

            var playerObj = GameObject.FindWithTag("Player");
            Vector3 playerPos = playerObj != null ? playerObj.transform.position : Vector3.one * 9999f;

            int placed = 0;
            for (int attempt = 0; attempt < count * 5 && placed < count; attempt++)
            {
                PedestrianLoop loop = loops[attempt % loops.Length];
                if (loop == null || loop.Count < 2) continue;

                int index = Random.Range(0, loop.Count);
                Vector3 a = loop.GetPoint(index);
                Vector3 b = loop.GetPoint(index + 1);
                Vector3 pos = Vector3.Lerp(a, b, Random.value);
                if (Vector3.Distance(pos, playerPos) < minDistanceFromPlayer) continue;

                int direction = Random.value < 0.5f ? 1 : -1;
                int target = direction == 1 ? index + 1 : index;   // walk towards b, or back towards a

                Pedestrian ped = Instantiate(prefab, pos, Quaternion.identity, transform);
                ped.Init(loop, target, direction);
                placed++;
            }
        }
    }
}
