using System.Collections.Generic;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.UI;
using CityThief.Controls;
using CityThief.Core;
using CityThief.HUD;
using CityThief.Police;
using CityThief.Traffic;
using static CityThief.EditorTools.BuilderUtils;

namespace CityThief.EditorTools
{
    // One-click builder for Step 2: one part of Navapur city with traffic and police.
    // Menu: City Thief > Step 2 - Build City Block (Traffic + Police)
    //
    // Layout: 3 x 3 crossings, 70 m apart, two-lane roads (LEFT-hand traffic, like India),
    // footpaths, 4 inner blocks with buildings round a hidden courtyard (reach it through
    // the narrow gaps = good hiding spots), and a ring of buildings round the outside.
    public static class Step2CityBuilder
    {
        const string ScenePath = Root + "/Scenes/Step2_CityBlock.unity";
        const string MatFolder = Root + "/Art/Materials/Step2";
        const string PrefabFolder = Root + "/Prefabs/Step2";

        // City measurements (metres)
        static readonly float[] Lines = { -70f, 0f, 70f };   // road centre lines (X and Z)
        const float RoadWidth = 8f;
        const float HalfRoad = RoadWidth * 0.5f;
        const float LaneOffset = 2f;            // lane centre from road centre
        const float StopBack = 5.5f;            // stop line distance from crossing centre
        const float FootpathWidth = 3.5f;
        const float RoadTop = 0.02f;
        const float FootpathTop = 0.15f;
        const float BuildingDepth = 16f;
        const float Gap = 2.5f;                 // gaps between buildings (alleys)

        class Mats
        {
            public Material ground, road, footpath, lineYellow, lineWhite, pole, signalHead;
            public Material[] buildings;
            public Material carBody, glass, tyre, policeWhite, policeBlue, lightbar;
            public Material pedBody, skin, uniform, cap, player, accent;
        }

        static System.Random rng;

        [MenuItem("City Thief/Step 2 - Build City Block (Traffic + Police)")]
        public static void Build()
        {
            if (!EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) return;

            rng = new System.Random(2026);   // same city every time
            EnsureLayers();
            EnsureFolder(Root + "/Scenes");
            EnsureFolder(MatFolder);
            EnsureFolder(PrefabFolder);

            var scene = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);
            Mats m = CreateMaterials();

            var mapData = new GameObject("City Map Data").AddComponent<CityMapData>();
            var city = new GameObject("City - Navapur Block").transform;

            BuildGroundAndRoads(city, m, mapData);
            BuildFootpathsAndBuildings(city, m, mapData);
            TrafficNetwork network = BuildTrafficNetwork(city, m);
            PedestrianLoop[] loops = BuildPedestrianLoops();

            // Prefabs (saved as assets so spawners can copy them)
            LaneDriver[] traffic = BuildTrafficPrefabs(m);
            PoliceOfficer officer = BuildOfficerPrefab(m);
            LaneDriver policeCar = BuildPoliceCarPrefab(m, officer);
            Pedestrian pedestrian = BuildPedestrianPrefab(m);

            // Spawners and police control
            var trafficSpawner = new GameObject("Traffic Spawner").AddComponent<TrafficSpawner>();
            SetRef(trafficSpawner, "network", network);
            SetRefArray(trafficSpawner, "carPrefabs", traffic);
            SetRef(trafficSpawner, "policePrefab", policeCar);
            SetNumber(trafficSpawner, "minSpacing", 12f);

            var pedSpawner = new GameObject("Pedestrian Spawner").AddComponent<PedestrianSpawner>();
            SetRefArray(pedSpawner, "loops", loops);
            SetRef(pedSpawner, "prefab", pedestrian);

            new GameObject("Police Dispatch (NMP)").AddComponent<PoliceDispatch>();

            // Player on the footpath near the centre crossing, facing the road.
            var player = BuildPlayer(new Vector3(5.8f, FootpathTop + 0.05f, 14f), -90f, m.player, m.accent);
            SetupCamera(player, 300f);
            SetupSun(new Vector3(50f, -40f, 0f));
            SetupFog();

            BuildHud(mapData);
            new GameObject("Game Bootstrap").AddComponent<GameBootstrap>();

            EditorSceneManager.SaveScene(scene, ScenePath);
            AddSceneToBuildSettings(ScenePath);
            Selection.activeGameObject = player.gameObject;
            Debug.Log("[City Thief] Step 2 scene ready: " + ScenePath + "  Press Play, then tap CALL COPS.");
        }

        // ------------------------------------------------------------------
        // Materials
        // ------------------------------------------------------------------
        static Mats CreateMaterials()
        {
            string f = MatFolder;
            return new Mats
            {
                ground = MakeMaterial(f, "Ground", new Color(0.33f, 0.34f, 0.29f)),
                road = MakeMaterial(f, "Road", new Color(0.21f, 0.21f, 0.23f), null, null, 0.25f),
                footpath = MakeMaterial(f, "Footpath", new Color(0.63f, 0.6f, 0.55f)),
                lineYellow = MakeMaterial(f, "LineYellow", new Color(0.95f, 0.78f, 0.15f)),
                lineWhite = MakeMaterial(f, "LineWhite", new Color(0.92f, 0.92f, 0.92f)),
                pole = MakeMaterial(f, "Pole", new Color(0.18f, 0.18f, 0.2f)),
                signalHead = MakeMaterial(f, "SignalHead", new Color(0.3f, 0.3f, 0.3f)),
                buildings = new[]
                {
                    MakeMaterial(f, "Building_Beige", new Color(0.8f, 0.68f, 0.52f)),
                    MakeMaterial(f, "Building_Brick", new Color(0.64f, 0.45f, 0.38f)),
                    MakeMaterial(f, "Building_Grey", new Color(0.66f, 0.68f, 0.71f)),
                    MakeMaterial(f, "Building_Cream", new Color(0.88f, 0.84f, 0.66f)),
                    MakeMaterial(f, "Building_Teal", new Color(0.45f, 0.62f, 0.6f)),
                },
                carBody = MakeMaterial(f, "CarBody", Color.white, null, null, 0.55f),
                glass = MakeMaterial(f, "CarGlass", new Color(0.12f, 0.16f, 0.2f), null, null, 0.85f),
                tyre = MakeMaterial(f, "Tyre", new Color(0.05f, 0.05f, 0.05f)),
                policeWhite = MakeMaterial(f, "PoliceWhite", new Color(0.93f, 0.93f, 0.95f), null, null, 0.55f),
                policeBlue = MakeMaterial(f, "PoliceBlue", new Color(0.08f, 0.18f, 0.55f), null, null, 0.55f),
                lightbar = MakeMaterial(f, "Lightbar", new Color(0.25f, 0.25f, 0.28f)),
                pedBody = MakeMaterial(f, "PedestrianClothes", Color.white),
                skin = MakeMaterial(f, "Skin", new Color(0.55f, 0.38f, 0.27f)),
                uniform = MakeMaterial(f, "PoliceUniform", new Color(0.62f, 0.53f, 0.36f)),
                cap = MakeMaterial(f, "PoliceCap", new Color(0.12f, 0.14f, 0.22f)),
                player = MakeMaterial(f, "Player", new Color(0.15f, 0.35f, 0.85f)),
                accent = MakeMaterial(f, "Accent", new Color(1f, 0.82f, 0.15f)),
            };
        }

        // ------------------------------------------------------------------
        // Ground, roads, markings
        // ------------------------------------------------------------------
        static void BuildGroundAndRoads(Transform city, Mats m, CityMapData map)
        {
            var ground = GameObject.CreatePrimitive(PrimitiveType.Plane);
            ground.name = "Ground (400 x 400 m)";
            ground.transform.SetParent(city);
            ground.transform.localScale = new Vector3(40f, 1f, 40f);
            ground.GetComponent<Renderer>().sharedMaterial = m.ground;
            ground.isStatic = true;

            var roads = new GameObject("Roads").transform;
            roads.SetParent(city);
            float min = Lines[0] - HalfRoad;
            float max = Lines[Lines.Length - 1] + HalfRoad;

            // East-west roads: full length (they include the crossing squares).
            foreach (float z in Lines)
            {
                Box("Road EW z" + z, roads, m.road, new Vector3(0f, RoadTop - 0.02f, z), new Vector3(max - min, 0.04f, RoadWidth));
                map.Add(new Vector2(0f, z), new Vector2(max - min, RoadWidth), CityMapData.Kind.Road);
            }

            // North-south roads: only between crossings (so surfaces never overlap and flicker).
            foreach (float x in Lines)
                for (int j = 0; j < Lines.Length - 1; j++)
                {
                    float z0 = Lines[j] + HalfRoad, z1 = Lines[j + 1] - HalfRoad;
                    Vector3 c = new Vector3(x, RoadTop - 0.02f, (z0 + z1) * 0.5f);
                    Box("Road NS x" + x, roads, m.road, c, new Vector3(RoadWidth, 0.04f, z1 - z0));
                    map.Add(new Vector2(c.x, c.z), new Vector2(RoadWidth, z1 - z0), CityMapData.Kind.Road);
                }

            // Yellow centre lines between crossings.
            for (int k = 0; k < Lines.Length; k++)
                for (int j = 0; j < Lines.Length - 1; j++)
                {
                    float a = Lines[j] + HalfRoad, b = Lines[j + 1] - HalfRoad;
                    Marking("Centre Line", roads, m.lineYellow, new Vector3((a + b) * 0.5f, RoadTop + 0.005f, Lines[k]), new Vector3(b - a, 0.01f, 0.15f));
                    Marking("Centre Line", roads, m.lineYellow, new Vector3(Lines[k], RoadTop + 0.005f, (a + b) * 0.5f), new Vector3(0.15f, 0.01f, b - a));
                }
        }

        // Thin painted line: no collider (saves physics time).
        static void Marking(string name, Transform parent, Material mat, Vector3 center, Vector3 size, float yaw = 0f)
        {
            var go = Box(name, parent, mat, center, size, new Vector3(0f, yaw, 0f));
            Object.DestroyImmediate(go.GetComponent<Collider>());
        }

        // ------------------------------------------------------------------
        // Footpaths and buildings
        // ------------------------------------------------------------------
        static void BuildFootpathsAndBuildings(Transform city, Mats m, CityMapData map)
        {
            var blocks = new GameObject("Blocks and Footpaths").transform;
            blocks.SetParent(city);
            var buildings = new GameObject("Buildings").transform;
            buildings.SetParent(city);

            // Inner blocks: raised footpath slab, buildings round a courtyard.
            for (int i = 0; i < Lines.Length - 1; i++)
                for (int j = 0; j < Lines.Length - 1; j++)
                {
                    float x0 = Lines[i] + HalfRoad, x1 = Lines[i + 1] - HalfRoad;
                    float z0 = Lines[j] + HalfRoad, z1 = Lines[j + 1] - HalfRoad;
                    Slab("Block " + i + "-" + j, blocks, m.footpath, x0, z0, x1, z1, map);

                    // Building zone = block minus the footpath.
                    float bx0 = x0 + FootpathWidth, bx1 = x1 - FootpathWidth;
                    float bz0 = z0 + FootpathWidth, bz1 = z1 - FootpathWidth;
                    SplitX(buildings, m, map, bx0, bx1, bz0, bz0 + BuildingDepth, 3);                       // south row
                    SplitX(buildings, m, map, bx0, bx1, bz1 - BuildingDepth, bz1, 3);                       // north row
                    SplitZ(buildings, m, map, bx0, bx0 + BuildingDepth, bz0 + BuildingDepth + Gap, bz1 - BuildingDepth - Gap, 1); // west
                    SplitZ(buildings, m, map, bx1 - BuildingDepth, bx1, bz0 + BuildingDepth + Gap, bz1 - BuildingDepth - Gap, 1); // east
                }

            // Outer footpath ring (outside the ring road).
            float rMin = Lines[0] - HalfRoad, rMax = Lines[Lines.Length - 1] + HalfRoad;
            float e = rMax + FootpathWidth;
            Slab("Footpath South", blocks, m.footpath, -e, -e, e, rMin, map);
            Slab("Footpath North", blocks, m.footpath, -e, rMax, e, e, map);
            Slab("Footpath West", blocks, m.footpath, -e, rMin, rMin, rMax, map);
            Slab("Footpath East", blocks, m.footpath, rMax, rMin, e, rMax, map);

            // Ring of buildings round the outside (the "edge" of this test city).
            SplitX(buildings, m, map, -e - BuildingDepth, e + BuildingDepth, -e - BuildingDepth, -e, 7);
            SplitX(buildings, m, map, -e - BuildingDepth, e + BuildingDepth, e, e + BuildingDepth, 7);
            SplitZ(buildings, m, map, -e - BuildingDepth, -e, -e, e, 6);
            SplitZ(buildings, m, map, e, e + BuildingDepth, -e, e, 6);
        }

        static void Slab(string name, Transform parent, Material mat, float x0, float z0, float x1, float z1, CityMapData map)
        {
            float h = FootpathTop + 0.05f;
            BoxOn(name, parent, mat, -0.05f, (x0 + x1) * 0.5f, (z0 + z1) * 0.5f, x1 - x0, h, z1 - z0);
            map.Add(new Vector2((x0 + x1) * 0.5f, (z0 + z1) * 0.5f), new Vector2(x1 - x0, z1 - z0), CityMapData.Kind.Block);
        }

        static void SplitX(Transform parent, Mats m, CityMapData map, float x0, float x1, float z0, float z1, int count)
        {
            float w = (x1 - x0 - Gap * (count - 1)) / count;
            for (int k = 0; k < count; k++)
            {
                float a = x0 + k * (w + Gap);
                AddBuilding(parent, m, map, a, z0, a + w, z1);
            }
        }

        static void SplitZ(Transform parent, Mats m, CityMapData map, float x0, float x1, float z0, float z1, int count)
        {
            float w = (z1 - z0 - Gap * (count - 1)) / count;
            for (int k = 0; k < count; k++)
            {
                float a = z0 + k * (w + Gap);
                AddBuilding(parent, m, map, x0, a, x1, a + w);
            }
        }

        static void AddBuilding(Transform parent, Mats m, CityMapData map, float x0, float z0, float x1, float z1)
        {
            float height = 8f + (float)rng.NextDouble() * 18f;   // 8 to 26 m (3 to 8 floors)
            Material mat = m.buildings[rng.Next(m.buildings.Length)];
            BoxOn("Building", parent, mat, FootpathTop, (x0 + x1) * 0.5f, (z0 + z1) * 0.5f, x1 - x0, height, z1 - z0);
            map.Add(new Vector2((x0 + x1) * 0.5f, (z0 + z1) * 0.5f), new Vector2(x1 - x0, z1 - z0), CityMapData.Kind.Building);
        }

        // ------------------------------------------------------------------
        // Traffic lanes, turns and signals
        // ------------------------------------------------------------------
        static TrafficNetwork BuildTrafficNetwork(Transform city, Mats m)
        {
            int n = Lines.Length;
            var net = new GameObject("Traffic Network").AddComponent<TrafficNetwork>();
            net.ClearAll();
            var signalsParent = new GameObject("Traffic Signals").transform;
            signalsParent.SetParent(city);

            var incoming = new List<(int node, Vector3 dir)>[n, n];
            var outgoing = new List<(int node, Vector3 dir)>[n, n];
            for (int i = 0; i < n; i++)
                for (int j = 0; j < n; j++)
                {
                    incoming[i, j] = new List<(int, Vector3)>();
                    outgoing[i, j] = new List<(int, Vector3)>();
                }

            // 1) One lane per direction on every road piece.
            int[] di = { 1, -1, 0, 0 };
            int[] dj = { 0, 0, 1, -1 };
            for (int i = 0; i < n; i++)
                for (int j = 0; j < n; j++)
                    for (int k = 0; k < 4; k++)
                    {
                        int ni = i + di[k], nj = j + dj[k];
                        if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue;

                        Vector3 a = Crossing(i, j), b = Crossing(ni, nj);
                        Vector3 d = (b - a).normalized;
                        Vector3 left = new Vector3(-d.z, 0f, d.x);   // drive on the LEFT
                        Vector3 start = a + d * StopBack + left * LaneOffset;
                        Vector3 end = b - d * StopBack + left * LaneOffset;

                        int s = net.AddNode(start, false);
                        int m1 = net.AddNode(Vector3.Lerp(start, end, 1f / 3f), true);
                        int m2 = net.AddNode(Vector3.Lerp(start, end, 2f / 3f), true);
                        int en = net.AddNode(end, false);
                        net.Link(s, m1);
                        net.Link(m1, m2);
                        net.Link(m2, en);
                        outgoing[i, j].Add((s, d));
                        incoming[ni, nj].Add((en, d));
                    }

            // 2) Turns inside every crossing, plus traffic lights where 3+ roads meet.
            for (int i = 0; i < n; i++)
                for (int j = 0; j < n; j++)
                {
                    int signalIndex = -1;
                    var heads0 = new List<Renderer>();
                    var heads1 = new List<Renderer>();
                    TrafficSignal signal = null;

                    if (incoming[i, j].Count >= 3)
                    {
                        var sgo = new GameObject($"Signal {i}-{j}");
                        sgo.transform.SetParent(signalsParent);
                        sgo.transform.position = Crossing(i, j);
                        signal = sgo.AddComponent<TrafficSignal>();
                        signalIndex = net.AddSignal(signal);
                    }

                    foreach (var inLane in incoming[i, j])
                    {
                        int inNode = inLane.node;
                        Vector3 inDir = inLane.dir;
                        foreach (var outLane in outgoing[i, j])
                        {
                            int outNode = outLane.node;
                            Vector3 outDir = outLane.dir;
                            float dot = Vector3.Dot(inDir, outDir);
                            if (dot < -0.9f) continue;                  // no U-turns
                            if (dot > 0.9f) { net.Link(inNode, outNode); continue; }   // straight on

                            // Curve: one extra node on a smooth arc between the two lanes.
                            Vector3 e = net[inNode].position, s = net[outNode].position;
                            Vector3 corner = e + inDir * Vector3.Dot(s - e, inDir);
                            Vector3 mid = 0.25f * e + 0.5f * corner + 0.25f * s;
                            int midNode = net.AddNode(mid, false);
                            net.Link(inNode, midNode);
                            net.Link(midNode, outNode);
                        }

                        if (signal != null)
                        {
                            int axis = Mathf.Abs(inDir.x) > 0.5f ? 1 : 0;   // 1 = east-west road
                            net.SetSignal(inNode, signalIndex, axis);
                            Renderer head = BuildSignalPole(signal.transform, m, net[inNode].position, inDir);
                            (axis == 0 ? heads0 : heads1).Add(head);

                            // White stop line across the lane.
                            Marking("Stop Line", signal.transform, m.lineWhite,
                                    net[inNode].position + Vector3.up * 0.005f + inDir * 0.3f,
                                    new Vector3(RoadWidth * 0.45f, 0.01f, 0.4f),
                                    Quaternion.LookRotation(inDir).eulerAngles.y);
                        }
                    }

                    if (signal != null)
                        signal.Configure(heads0.ToArray(), heads1.ToArray(), (i * 3 + j) * 3.7f);
                }

            return net;
        }

        static Vector3 Crossing(int i, int j) => new Vector3(Lines[i], RoadTop, Lines[j]);

        // Pole on the footpath at the left kerb, light box on top facing the cars.
        static Renderer BuildSignalPole(Transform parent, Mats m, Vector3 stopPoint, Vector3 dir)
        {
            Vector3 left = new Vector3(-dir.z, 0f, dir.x);
            Vector3 basePos = stopPoint + left * (HalfRoad - LaneOffset + 0.7f) - dir * 0.5f;
            float yaw = Quaternion.LookRotation(-dir).eulerAngles.y;   // light faces the cars
            Box("Signal Pole", parent, m.pole, new Vector3(basePos.x, FootpathTop + 1.6f, basePos.z),
                new Vector3(0.15f, 3.2f, 0.15f), new Vector3(0f, yaw, 0f));
            var head = Box("Signal Light", parent, m.signalHead, new Vector3(basePos.x, FootpathTop + 3.5f, basePos.z),
                           new Vector3(0.45f, 0.7f, 0.3f), new Vector3(0f, yaw, 0f), false);
            Object.DestroyImmediate(head.GetComponent<Collider>());
            return head.GetComponent<Renderer>();
        }

        // ------------------------------------------------------------------
        // Footpath walking loops
        // ------------------------------------------------------------------
        static PedestrianLoop[] BuildPedestrianLoops()
        {
            var parent = new GameObject("Pedestrian Loops").transform;
            var loops = new List<PedestrianLoop>();
            float mid = FootpathWidth * 0.5f;
            float y = FootpathTop;

            for (int i = 0; i < Lines.Length - 1; i++)
                for (int j = 0; j < Lines.Length - 1; j++)
                {
                    float x0 = Lines[i] + HalfRoad + mid, x1 = Lines[i + 1] - HalfRoad - mid;
                    float z0 = Lines[j] + HalfRoad + mid, z1 = Lines[j + 1] - HalfRoad - mid;
                    loops.Add(MakeLoop(parent, $"Loop Block {i}-{j}", x0, z0, x1, z1, y));
                }

            float r = Lines[Lines.Length - 1] + HalfRoad + mid;
            loops.Add(MakeLoop(parent, "Loop Outer Ring", -r, -r, r, r, y));
            return loops.ToArray();
        }

        static PedestrianLoop MakeLoop(Transform parent, string name, float x0, float z0, float x1, float z1, float y)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent);
            var loop = go.AddComponent<PedestrianLoop>();
            loop.SetPoints(new[]
            {
                new Vector3(x0, y, z0), new Vector3(x1, y, z0),
                new Vector3(x1, y, z1), new Vector3(x0, y, z1),
            });
            return loop;
        }

        // ------------------------------------------------------------------
        // Vehicle, pedestrian and officer prefabs (placeholder shapes)
        // ------------------------------------------------------------------
        struct CarSpec
        {
            public string name;
            public float length, width, bodyHeight, cabinHeight, cabinLength, cabinShift;
            public CarSpec(string n, float l, float w, float bh, float ch, float cl, float cs)
            {
                name = n; length = l; width = w; bodyHeight = bh; cabinHeight = ch; cabinLength = cl; cabinShift = cs;
            }
        }

        static readonly Color[] CarColors =
        {
            new Color(0.95f, 0.95f, 0.95f), new Color(0.75f, 0.76f, 0.78f), new Color(0.12f, 0.12f, 0.13f),
            new Color(0.7f, 0.1f, 0.1f), new Color(0.15f, 0.3f, 0.65f), new Color(0.95f, 0.75f, 0.1f),
            new Color(0.2f, 0.45f, 0.3f), new Color(0.5f, 0.3f, 0.2f),
        };

        static readonly Color[] ClothesColors =
        {
            new Color(0.9f, 0.9f, 0.85f), new Color(0.8f, 0.25f, 0.2f), new Color(0.2f, 0.35f, 0.7f),
            new Color(0.95f, 0.7f, 0.15f), new Color(0.35f, 0.6f, 0.35f), new Color(0.55f, 0.2f, 0.5f),
            new Color(0.3f, 0.3f, 0.32f), new Color(0.95f, 0.5f, 0.6f),
        };

        static LaneDriver[] BuildTrafficPrefabs(Mats m)
        {
            var specs = new[]
            {
                new CarSpec("Traffic_Hatchback", 3.8f, 1.7f, 0.72f, 0.66f, 0.55f, -0.2f),
                new CarSpec("Traffic_Sedan",     4.5f, 1.78f, 0.68f, 0.6f, 0.45f, -0.15f),
                new CarSpec("Traffic_SUV",       4.6f, 1.9f, 0.88f, 0.75f, 0.62f, -0.3f),
                new CarSpec("Traffic_Pickup",    5.2f, 1.9f, 0.85f, 0.72f, 0.3f, 0.9f),
            };

            var result = new List<LaneDriver>();
            foreach (var spec in specs)
            {
                GameObject car = BuildCarObject(spec, m.carBody, m, out Renderer[] paintParts);
                var paint = car.AddComponent<RandomBodyColor>();
                SetRefArray(paint, "targets", paintParts);
                SetColorArray(paint, "palette", CarColors);
                car.AddComponent<LaneDriver>();
                result.Add(SavePrefab(car, spec.name).GetComponent<LaneDriver>());
            }
            return result.ToArray();
        }

        static LaneDriver BuildPoliceCarPrefab(Mats m, PoliceOfficer officerPrefab)
        {
            var spec = new CarSpec("Police_Car_NMP", 4.7f, 1.8f, 0.72f, 0.6f, 0.45f, -0.1f);
            GameObject car = BuildCarObject(spec, m.policeWhite, m, out _);
            Transform t = car.transform;
            float clearance = 0.28f;
            float roofY = clearance + spec.bodyHeight + spec.cabinHeight;

            // Blue stripe along the sides, lightbar on the roof.
            VisualPart(PrimitiveType.Cube, "Stripe", t, m.policeBlue,
                       new Vector3(0f, clearance + spec.bodyHeight * 0.5f, 0f), new Vector3(spec.width + 0.02f, 0.2f, spec.length * 0.98f));
            VisualPart(PrimitiveType.Cube, "Lightbar Base", t, m.lightbar,
                       new Vector3(0f, roofY + 0.08f, spec.cabinShift), new Vector3(1.1f, 0.08f, 0.3f));
            var red = VisualPart(PrimitiveType.Cube, "Light Red", t, m.lightbar,
                                 new Vector3(-0.3f, roofY + 0.17f, spec.cabinShift), new Vector3(0.45f, 0.12f, 0.25f));
            var blue = VisualPart(PrimitiveType.Cube, "Light Blue", t, m.lightbar,
                                  new Vector3(0.3f, roofY + 0.17f, spec.cabinShift), new Vector3(0.45f, 0.12f, 0.25f));

            var exit = new GameObject("Officer Exit Point").transform;
            exit.SetParent(t, false);
            exit.localPosition = new Vector3(spec.width * 0.5f + 0.9f, 0.05f, 0.3f);

            car.AddComponent<LaneDriver>();
            var blip = car.AddComponent<MiniMapBlip>();
            blip.color = new Color(0.25f, 0.45f, 1f);
            blip.size = 18f;

            var police = car.AddComponent<PoliceCar>();
            SetRef(police, "officerPrefab", officerPrefab);
            SetRef(police, "officerExitPoint", exit);
            SetRef(police, "redLight", red.GetComponent<Renderer>());
            SetRef(police, "blueLight", blue.GetComponent<Renderer>());

            return SavePrefab(car, spec.name).GetComponent<LaneDriver>();
        }

        // Body + glass cabin + roof + 4 wheels. One box collider for the whole car (cheap).
        static GameObject BuildCarObject(CarSpec c, Material bodyMat, Mats m, out Renderer[] paintParts)
        {
            var root = new GameObject(c.name);
            root.layer = ProjectLayers.Vehicle;

            var rb = root.AddComponent<Rigidbody>();
            rb.isKinematic = true;
            rb.useGravity = false;
            rb.interpolation = RigidbodyInterpolation.Interpolate;

            const float clearance = 0.28f;
            float totalHeight = clearance + c.bodyHeight + c.cabinHeight;
            var box = root.AddComponent<BoxCollider>();
            box.center = new Vector3(0f, totalHeight * 0.5f, 0f);
            box.size = new Vector3(c.width, totalHeight, c.length);

            Transform t = root.transform;
            var body = VisualPart(PrimitiveType.Cube, "Body", t, bodyMat,
                                  new Vector3(0f, clearance + c.bodyHeight * 0.5f, 0f), new Vector3(c.width, c.bodyHeight, c.length));
            VisualPart(PrimitiveType.Cube, "Cabin Glass", t, m.glass,
                       new Vector3(0f, clearance + c.bodyHeight + c.cabinHeight * 0.5f, c.cabinShift),
                       new Vector3(c.width * 0.86f, c.cabinHeight, c.length * c.cabinLength));
            var roof = VisualPart(PrimitiveType.Cube, "Roof", t, bodyMat,
                                  new Vector3(0f, clearance + c.bodyHeight + c.cabinHeight + 0.03f, c.cabinShift),
                                  new Vector3(c.width * 0.88f, 0.06f, c.length * c.cabinLength * 0.92f));

            const float r = 0.33f;
            for (int sx = -1; sx <= 1; sx += 2)
                for (int sz = -1; sz <= 1; sz += 2)
                    VisualPart(PrimitiveType.Cylinder, "Wheel", t, m.tyre,
                               new Vector3(sx * (c.width * 0.5f - 0.12f), r, sz * (c.length * 0.5f - 0.8f)),
                               new Vector3(r * 2f, 0.12f, r * 2f), new Vector3(0f, 0f, 90f));

            paintParts = new[] { body.GetComponent<Renderer>(), roof.GetComponent<Renderer>() };
            return root;
        }

        static Pedestrian BuildPedestrianPrefab(Mats m)
        {
            var root = new GameObject("Pedestrian");
            root.layer = ProjectLayers.NPC;

            var col = root.AddComponent<CapsuleCollider>();
            col.center = new Vector3(0f, 0.875f, 0f);
            col.height = 1.75f;
            col.radius = 0.28f;
            var rb = root.AddComponent<Rigidbody>();
            rb.isKinematic = true;
            rb.useGravity = false;

            var body = VisualPart(PrimitiveType.Capsule, "Body", root.transform, m.pedBody,
                                  new Vector3(0f, 0.8f, 0f), new Vector3(0.5f, 0.8f, 0.5f));
            VisualPart(PrimitiveType.Sphere, "Head", root.transform, m.skin,
                       new Vector3(0f, 1.66f, 0f), new Vector3(0.26f, 0.26f, 0.26f));

            var paint = root.AddComponent<RandomBodyColor>();
            SetRefArray(paint, "targets", new Object[] { body.GetComponent<Renderer>() });
            SetColorArray(paint, "palette", ClothesColors);

            root.AddComponent<Pedestrian>();
            return SavePrefab(root, "Pedestrian").GetComponent<Pedestrian>();
        }

        static PoliceOfficer BuildOfficerPrefab(Mats m)
        {
            var root = new GameObject("Police_Officer_NMP");
            root.layer = ProjectLayers.NPC;

            var cc = root.AddComponent<CharacterController>();
            cc.height = 1.8f;
            cc.radius = 0.33f;
            cc.center = new Vector3(0f, 0.9f, 0f);
            cc.stepOffset = 0.35f;
            cc.skinWidth = 0.04f;
            cc.slopeLimit = 50f;

            VisualPart(PrimitiveType.Capsule, "Uniform", root.transform, m.uniform,
                       new Vector3(0f, 0.82f, 0f), new Vector3(0.55f, 0.82f, 0.55f));
            VisualPart(PrimitiveType.Sphere, "Head", root.transform, m.skin,
                       new Vector3(0f, 1.7f, 0f), new Vector3(0.26f, 0.26f, 0.26f));
            VisualPart(PrimitiveType.Cube, "Cap", root.transform, m.cap,
                       new Vector3(0f, 1.83f, 0.03f), new Vector3(0.3f, 0.08f, 0.34f));

            var blip = root.AddComponent<MiniMapBlip>();
            blip.color = new Color(1f, 0.35f, 0.3f);
            blip.size = 12f;

            root.AddComponent<PoliceOfficer>();
            return SavePrefab(root, "Police_Officer_NMP").GetComponent<PoliceOfficer>();
        }

        static GameObject SavePrefab(GameObject go, string name)
        {
            string path = $"{PrefabFolder}/{name}.prefab";
            PrefabUtility.SaveAsPrefabAsset(go, path);
            Object.DestroyImmediate(go);
            return AssetDatabase.LoadAssetAtPath<GameObject>(path);
        }

        // ------------------------------------------------------------------
        // Look and HUD
        // ------------------------------------------------------------------
        static void SetupFog()
        {
            // Light haze: looks like a real Indian city afternoon and hides the far edge.
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.Linear;
            RenderSettings.fogStartDistance = 90f;
            RenderSettings.fogEndDistance = 280f;
            RenderSettings.fogColor = new Color(0.74f, 0.76f, 0.78f);
        }

        static void BuildHud(CityMapData mapData)
        {
            HudParts parts = BuildOnFootHud("Tap CALL COPS, then escape on foot. Hide in the courtyards behind the buildings.", false);

            // ---- Mini-map (own canvas so it does not slow down the rest of the HUD) ----
            Canvas mapCanvas = NewCanvas("MiniMap Canvas", 1);
            var mapRoot = NewUI<Image>("MiniMap", mapCanvas.transform);
            mapRoot.sprite = parts.circle;
            mapRoot.color = new Color(0f, 0f, 0f, 0.6f);
            mapRoot.raycastTarget = false;
            var rt = mapRoot.rectTransform;
            rt.anchorMin = rt.anchorMax = rt.pivot = new Vector2(0f, 1f);
            rt.anchoredPosition = new Vector2(24f, -24f);
            rt.sizeDelta = new Vector2(250f, 250f);
            mapRoot.gameObject.AddComponent<Mask>().showMaskGraphic = true;

            var content = new GameObject("Map Content", typeof(RectTransform)).GetComponent<RectTransform>();
            content.gameObject.layer = UILayer;
            content.SetParent(mapRoot.transform, false);
            Place(content, new Vector2(0.5f, 0.5f), Vector2.zero, Vector2.zero);

            var arrow = NewUI<Image>("Player Arrow", mapRoot.transform);
            arrow.sprite = parts.circle;
            arrow.color = new Color(1f, 0.85f, 0.2f);
            arrow.raycastTarget = false;
            Place(arrow.rectTransform, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(18f, 18f));
            var nose = NewUI<Image>("Nose", arrow.transform);
            nose.color = new Color(1f, 0.85f, 0.2f);
            nose.raycastTarget = false;
            Place(nose.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0f, 12f), new Vector2(7f, 12f));

            var miniMap = mapRoot.gameObject.AddComponent<MiniMap>();
            SetRef(miniMap, "mapData", mapData);
            SetRef(miniMap, "content", content);
            SetRef(miniMap, "playerArrow", arrow.rectTransform);
            SetRef(miniMap, "blipSprite", parts.circle);

            // ---- Chase status line + big centre message ----
            var status = NewText("Chase Status", parts.root, parts.font, 34, TextAnchor.UpperCenter);
            status.fontStyle = FontStyle.Bold;
            Place(status.rectTransform, new Vector2(0.5f, 1f), new Vector2(0f, -90f), new Vector2(1100f, 60f));
            status.gameObject.AddComponent<Outline>().effectColor = Color.black;

            var big = NewText("Big Message", parts.root, parts.font, 90, TextAnchor.MiddleCenter);
            big.fontStyle = FontStyle.Bold;
            Place(big.rectTransform, new Vector2(0.5f, 0.5f), new Vector2(0f, 140f), new Vector2(1500f, 150f));
            big.gameObject.AddComponent<Outline>().effectColor = Color.black;

            var pursuitHud = status.gameObject.AddComponent<PursuitHud>();
            SetRef(pursuitHud, "statusText", status);
            SetRef(pursuitHud, "bigText", big);

            // ---- TEST button: start a chase (removed in Step 4) ----
            TouchButton callCops = MakeButton("CALL\nCOPS", parts.root, parts, new Vector2(-130f, 690f), 120f, null);
            callCops.GetComponent<Image>().color = new Color(0.6f, 0.05f, 0.05f, 0.6f);
            var tester = callCops.gameObject.AddComponent<CallCopsTestButton>();
            SetRef(tester, "button", callCops);
        }
    }
}
