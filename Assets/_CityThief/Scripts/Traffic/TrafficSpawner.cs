using System.Collections.Generic;
using UnityEngine;
using CityThief.Player;

namespace CityThief.Traffic
{
    // Puts traffic cars and police patrol cars on the roads when the level starts.
    // Cars are spread out and never appear right next to the player.
    public class TrafficSpawner : MonoBehaviour
    {
        [SerializeField] TrafficNetwork network;
        [SerializeField] LaneDriver[] carPrefabs;
        [SerializeField] LaneDriver policePrefab;
        [SerializeField] int carCount = 14;
        [SerializeField] int policeCount = 2;
        [SerializeField] float minSpacing = 14f;
        [SerializeField] float minDistanceFromPlayer = 15f;
        [SerializeField] float policeMinDistanceFromPlayer = 45f;

        readonly List<Vector3> used = new List<Vector3>();

        void Start()
        {
            if (network == null) network = TrafficNetwork.Instance;
            if (network == null) return;

            var player = FindFirstObjectByType<PlayerMotor>();
            Vector3 playerPos = player != null ? player.transform.position : Vector3.one * 9999f;

            var spots = new List<int>();
            for (int i = 0; i < network.Count; i++)
                if (network[i].spawnable) spots.Add(i);
            Shuffle(spots);

            if (policePrefab != null)
                for (int i = 0; i < policeCount; i++)
                    SpawnOne(policePrefab, spots, playerPos, policeMinDistanceFromPlayer);

            if (carPrefabs != null && carPrefabs.Length > 0)
                for (int i = 0; i < carCount; i++)
                    SpawnOne(carPrefabs[Random.Range(0, carPrefabs.Length)], spots, playerPos, minDistanceFromPlayer);
        }

        void SpawnOne(LaneDriver prefab, List<int> spots, Vector3 playerPos, float awayFromPlayer)
        {
            for (int s = 0; s < spots.Count; s++)
            {
                Vector3 p = network[spots[s]].position;
                if (Vector3.Distance(p, playerPos) < awayFromPlayer) continue;
                if (TooClose(p)) continue;

                LaneDriver car = Instantiate(prefab, p, Quaternion.identity, transform);
                car.Init(network, spots[s]);
                used.Add(p);
                spots.RemoveAt(s);
                return;
            }
        }

        bool TooClose(Vector3 p)
        {
            foreach (var u in used)
                if (Vector3.Distance(u, p) < minSpacing) return true;
            return false;
        }

        static void Shuffle(List<int> list)
        {
            for (int i = list.Count - 1; i > 0; i--)
            {
                int j = Random.Range(0, i + 1);
                (list[i], list[j]) = (list[j], list[i]);
            }
        }
    }
}
