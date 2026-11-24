using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using CityThief.Core;
using static CityThief.EditorTools.BuilderUtils;

namespace CityThief.EditorTools
{
    // One-click builder for the Step 1 test scene.
    // Menu: City Thief > Step 1 - Build Movement Test Scene
    // Makes a test yard (ramp, stairs, crouch tunnel, crates, pillars),
    // the player, the camera and the touch HUD, then saves the scene.
    // Run it again any time to rebuild from scratch.
    public static class Step1SceneBuilder
    {
        const string ScenePath = Root + "/Scenes/Step1_Movement.unity";
        const string MaterialFolder = Root + "/Art/Materials/Step1";

        [MenuItem("City Thief/Step 1 - Build Movement Test Scene")]
        public static void Build()
        {
            if (!EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) return;

            EnsureLayers();
            EnsureFolder(Root + "/Scenes");
            EnsureFolder(MaterialFolder);

            var scene = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);

            Material ground = MakeMaterial(MaterialFolder, "Ground", new Color(0.78f, 0.78f, 0.78f), CheckerTexture(), new Vector2(100f, 100f));
            Material wall = MakeMaterial(MaterialFolder, "Wall", new Color(0.55f, 0.56f, 0.6f));
            Material ramp = MakeMaterial(MaterialFolder, "Ramp", new Color(0.9f, 0.55f, 0.2f));
            Material crate = MakeMaterial(MaterialFolder, "Crate", new Color(0.55f, 0.38f, 0.2f));
            Material playerMat = MakeMaterial(MaterialFolder, "Player", new Color(0.15f, 0.35f, 0.85f));
            Material accent = MakeMaterial(MaterialFolder, "Accent", new Color(1f, 0.82f, 0.15f));

            BuildTestYard(ground, wall, ramp, crate, accent);

            var player = BuildPlayer(new Vector3(0f, 0.05f, 0f), 0f, playerMat, accent);
            SetupCamera(player);
            SetupSun(new Vector3(45f, -35f, 0f));
            BuildOnFootHud("Test the yard - tunnel (crouch), stairs, ramp, crates, pillars", true);
            new GameObject("Game Bootstrap").AddComponent<GameBootstrap>();

            EditorSceneManager.SaveScene(scene, ScenePath);
            AddSceneToBuildSettings(ScenePath);
            Selection.activeGameObject = player.gameObject;
            Debug.Log("[City Thief] Step 1 scene ready: " + ScenePath + "  Press Play to test.");
        }

        static void BuildTestYard(Material groundMat, Material wall, Material rampMat, Material crateMat, Material accent)
        {
            var yard = new GameObject("Test Yard").transform;

            var ground = GameObject.CreatePrimitive(PrimitiveType.Plane);
            ground.name = "Ground (200 x 200 m)";
            ground.transform.SetParent(yard);
            ground.transform.localScale = new Vector3(20f, 1f, 20f);
            ground.GetComponent<Renderer>().sharedMaterial = groundMat;
            ground.isStatic = true;

            // Buildings: camera collision test.
            BoxOn("Building A", yard, wall, 0f, -12f, 16f, 8f, 12f, 10f);
            BoxOn("Building B", yard, wall, 0f, 13f, 20f, 8f, 9f, 14f);
            BoxOn("Building C", yard, wall, 0f, -12f, 34f, 8f, 15f, 10f);

            // Ramp up to a platform (slope test).
            Box("Ramp", yard, rampMat, new Vector3(0f, 1.2f, 25f), new Vector3(4f, 0.4f, 10f), new Vector3(-15f, 0f, 0f));
            BoxOn("Ramp Platform", yard, wall, 0f, 0f, 33f, 4f, 2.6f, 6f);

            // Stairs (each step 0.25 m, below the 0.35 m step limit).
            for (int i = 0; i < 8; i++)
                BoxOn("Step " + (i + 1), yard, wall, 0f, 6f, 8f + i * 0.4f, 2.5f, (i + 1) * 0.25f, 0.4f);
            BoxOn("Stairs Platform", yard, wall, 0f, 6f, 13.2f, 2.5f, 2f, 4f);

            // Crouch tunnel: roof is 1.35 m high, so you MUST crouch to pass.
            BoxOn("Tunnel Wall L", yard, wall, 0f, -6.3f, 11f, 0.4f, 2.4f, 6f);
            BoxOn("Tunnel Wall R", yard, wall, 0f, -3.7f, 11f, 0.4f, 2.4f, 6f);
            Box("Tunnel Roof (1.35 m)", yard, accent, new Vector3(-5f, 1.5f, 11f), new Vector3(3f, 0.3f, 6f));

            // Jump test: 0.6 m (easy) and 1.0 m (needs a full jump).
            BoxOn("Jump Box 0.6m", yard, accent, 0f, 4f, -6f, 1.5f, 0.6f, 1.5f);
            BoxOn("Jump Box 1.0m", yard, accent, 0f, 6.5f, -6f, 1.5f, 1.0f, 1.5f);

            // Pillars: walk between them and watch the camera avoid them.
            for (int i = 0; i < 6; i++)
                BoxOn("Pillar " + (i + 1), yard, wall, 0f, -8f + i * 3.2f, -15f, 0.8f, 4f, 0.8f);

            // Pushable crates.
            for (int i = 0; i < 4; i++)
            {
                var crate = Box("Crate " + (i + 1), yard, crateMat, new Vector3(-3f - i * 1.3f, 0.5f, -4f),
                                Vector3.one, null, false);
                crate.AddComponent<Rigidbody>().mass = 15f;
            }
        }

        // A small grey checker so you can SEE speed and distance while testing.
        static Texture2D CheckerTexture()
        {
            string path = MaterialFolder + "/Checker.asset";
            var tex = AssetDatabase.LoadAssetAtPath<Texture2D>(path);
            if (tex != null) return tex;

            const int size = 64;
            tex = new Texture2D(size, size, TextureFormat.RGBA32, true);
            var pixels = new Color32[size * size];
            for (int y = 0; y < size; y++)
                for (int x = 0; x < size; x++)
                {
                    byte v = ((x / 32) + (y / 32)) % 2 == 0 ? (byte)210 : (byte)160;
                    pixels[y * size + x] = new Color32(v, v, v, 255);
                }
            tex.SetPixels32(pixels);
            tex.wrapMode = TextureWrapMode.Repeat;
            tex.filterMode = FilterMode.Bilinear;
            tex.anisoLevel = 2;
            tex.Apply(true);
            AssetDatabase.CreateAsset(tex, path);
            return tex;
        }
    }
}
