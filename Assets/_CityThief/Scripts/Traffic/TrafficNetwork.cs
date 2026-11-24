using System;
using System.Collections.Generic;
using UnityEngine;

namespace CityThief.Traffic
{
    // One point on a driving lane. Cars drive from node to node.
    [Serializable]
    public class LaneNode
    {
        public Vector3 position;
        public List<int> next = new List<int>();   // nodes you can drive to from here
        public int signal = -1;                    // traffic light at this stop line (-1 = none)
        public int axis;                           // 0 = north-south road, 1 = east-west road
        public bool spawnable;                     // good place to put a new car
    }

    // The road map for AI cars: all lanes, turns and traffic lights.
    // Made by the scene builder. Cars (traffic and police) read it.
    // India drives on the LEFT, so lanes are on the left side of each road.
    public class TrafficNetwork : MonoBehaviour
    {
        public static TrafficNetwork Instance { get; private set; }

        [SerializeField] List<LaneNode> nodes = new List<LaneNode>();
        [SerializeField] List<TrafficSignal> signals = new List<TrafficSignal>();

        public int Count => nodes.Count;
        public LaneNode this[int index] => nodes[index];

        // Re-used memory for path finding (no garbage every search).
        float[] costSoFar;
        int[] cameFrom;
        bool[] isOpen;
        bool[] isClosed;

        void Awake()
        {
            Instance = this;
        }

        void OnDestroy()
        {
            if (Instance == this) Instance = null;
        }

        // ---------- Used by the scene builder ----------

        public void ClearAll()
        {
            nodes.Clear();
            signals.Clear();
        }

        public int AddNode(Vector3 position, bool spawnable)
        {
            nodes.Add(new LaneNode { position = position, spawnable = spawnable });
            return nodes.Count - 1;
        }

        public void Link(int from, int to)
        {
            if (!nodes[from].next.Contains(to)) nodes[from].next.Add(to);
        }

        public int AddSignal(TrafficSignal signal)
        {
            signals.Add(signal);
            return signals.Count - 1;
        }

        public void SetSignal(int node, int signalIndex, int axis)
        {
            nodes[node].signal = signalIndex;
            nodes[node].axis = axis;
        }

        // ---------- Used by cars ----------

        // True if a car must stop at this node (red or yellow light).
        public bool MustStopAt(int node)
        {
            if (node < 0 || node >= nodes.Count) return false;
            LaneNode n = nodes[node];
            if (n.signal < 0 || n.signal >= signals.Count || signals[n.signal] == null) return false;
            return !signals[n.signal].IsGreen(n.axis);
        }

        // Closest node to a point. If a heading is given, only nodes whose lane
        // goes roughly the same way (and are ahead) are used, so cars do not
        // rejoin the road going the wrong way.
        public int NearestNode(Vector3 point, Vector3? heading = null)
        {
            int best = -1;
            float bestDist = float.MaxValue;

            for (int i = 0; i < nodes.Count; i++)
            {
                LaneNode n = nodes[i];
                if (heading.HasValue)
                {
                    if (n.next.Count == 0) continue;
                    Vector3 laneDir = nodes[n.next[0]].position - n.position;
                    laneDir.y = 0f;
                    Vector3 toNode = n.position - point;
                    toNode.y = 0f;
                    if (Vector3.Dot(laneDir.normalized, heading.Value) < 0.3f) continue;
                    if (Vector3.Dot(toNode, heading.Value) < 0f) continue;
                }

                float d = (n.position - point).sqrMagnitude;
                if (d < bestDist)
                {
                    bestDist = d;
                    best = i;
                }
            }

            // Nothing matched the heading: just use the closest node.
            if (best < 0 && heading.HasValue) return NearestNode(point);
            return best;
        }

        // Shortest drive from start to goal (A* search). Result includes start and goal.
        // Simple version: fine for a few hundred nodes. A bigger city (Step 6)
        // will switch the "find best open node" loop to a heap.
        public bool FindPath(int start, int goal, List<int> result)
        {
            result.Clear();
            int count = nodes.Count;
            if (start < 0 || goal < 0 || start >= count || goal >= count) return false;

            if (costSoFar == null || costSoFar.Length < count)
            {
                costSoFar = new float[count];
                cameFrom = new int[count];
                isOpen = new bool[count];
                isClosed = new bool[count];
            }

            for (int i = 0; i < count; i++)
            {
                costSoFar[i] = float.MaxValue;
                cameFrom[i] = -1;
                isOpen[i] = false;
                isClosed[i] = false;
            }

            Vector3 goalPos = nodes[goal].position;
            costSoFar[start] = 0f;
            isOpen[start] = true;
            int openCount = 1;
            bool found = false;

            while (openCount > 0)
            {
                // Pick the open node that looks best (cost so far + straight-line guess).
                int current = -1;
                float bestScore = float.MaxValue;
                for (int i = 0; i < count; i++)
                {
                    if (!isOpen[i]) continue;
                    float score = costSoFar[i] + Vector3.Distance(nodes[i].position, goalPos);
                    if (score < bestScore)
                    {
                        bestScore = score;
                        current = i;
                    }
                }

                if (current == goal)
                {
                    found = true;
                    break;
                }

                isOpen[current] = false;
                isClosed[current] = true;
                openCount--;

                foreach (int nb in nodes[current].next)
                {
                    if (isClosed[nb]) continue;
                    float cost = costSoFar[current] + Vector3.Distance(nodes[current].position, nodes[nb].position);
                    if (cost < costSoFar[nb])
                    {
                        costSoFar[nb] = cost;
                        cameFrom[nb] = current;
                        if (!isOpen[nb])
                        {
                            isOpen[nb] = true;
                            openCount++;
                        }
                    }
                }
            }

            if (!found) return false;

            for (int c = goal; c != -1; c = cameFrom[c]) result.Add(c);
            result.Reverse();
            return true;
        }

        // Shows the lanes in the Scene view when this object is selected.
        void OnDrawGizmosSelected()
        {
            for (int i = 0; i < nodes.Count; i++)
            {
                LaneNode n = nodes[i];
                Gizmos.color = n.signal >= 0 ? Color.red : (n.spawnable ? Color.green : Color.cyan);
                Gizmos.DrawSphere(n.position + Vector3.up * 0.2f, 0.35f);
                Gizmos.color = Color.yellow;
                foreach (int nb in n.next)
                    Gizmos.DrawLine(n.position + Vector3.up * 0.2f, nodes[nb].position + Vector3.up * 0.2f);
            }
        }
    }
}
