using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;
using CityThief.CameraSystem;
using CityThief.Controls;
using CityThief.Core;
using CityThief.HUD;
using CityThief.Player;

namespace CityThief.EditorTools
{
    // One-click builder for the Step 1 test scene.
    // Menu: City Thief > Step 1 - Build Movement Test Scene
    // It makes a test yard (ramp, stairs, crouch tunnel, crates, pillars),
    // the player, the camera, and the full touch HUD, then saves the scene.
    // Run it again any time to rebuild from scratch.
    public static class Step1SceneBuilder
    {
        const string Root = "Assets/_CityThief";
        const string ScenePath = Root + "/Scenes/Step1_Movement.unity";
        const string MaterialFolder = Root + "/Art/Materials/Step1";
        const int PlayerLayer = 2;   // Unity's built-in "Ignore Raycast" layer
        const int UILayer = 5;       // Unity's built-in "UI" layer

        [MenuItem("City Thief/Step 1 - Build Movement Test Scene")]
        public static void Build()
        {
            if (!EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) return;

            EnsureFolder(Root + "/Scenes");
            EnsureFolder(MaterialFolder);

            var scene = EditorSceneManager.NewScene(NewSceneSetup.DefaultGameObjects, NewSceneMode.Single);

            var mats = new Materials();
            BuildTestYard(mats);
            PlayerMotor player = BuildPlayer(mats);
            Camera cam = SetupCamera(player);
            SetRef(player, "cameraTransform", cam.transform);
            SetupLight();
            BuildHud();

            new GameObject("Game Bootstrap").AddComponent<GameBootstrap>();

            EditorSceneManager.SaveScene(scene, ScenePath);
            AddSceneToBuildSettings(ScenePath);
            Selection.activeGameObject = player.gameObject;

            Debug.Log("[City Thief] Step 1 scene ready: " + ScenePath + "  Press Play to test.");
        }

        // ------------------------------------------------------------------
        // Materials (simple colours; real art comes later)
        // ------------------------------------------------------------------
        class Materials
        {
            public readonly Material Ground, Wall, Ramp, Crate, Player, Accent;

            public Materials()
            {
                Texture2D checker = CheckerTexture();
                Ground = MakeMaterial("Ground", new Color(0.78f, 0.78f, 0.78f), checker, new Vector2(100f, 100f));
                Wall = MakeMaterial("Wall", new Color(0.55f, 0.56f, 0.6f));
                Ramp = MakeMaterial("Ramp", new Color(0.9f, 0.55f, 0.2f));
                Crate = MakeMaterial("Crate", new Color(0.55f, 0.38f, 0.2f));
                Player = MakeMaterial("Player", new Color(0.15f, 0.35f, 0.85f));
                Accent = MakeMaterial("Accent", new Color(1f, 0.82f, 0.15f));
            }
        }

        static Shader LitShader()
        {
            // URP first (our chosen pipeline), fall back to Built-in if needed.
            Shader shader = Shader.Find("Universal Render Pipeline/Lit");
            if (shader == null) shader = Shader.Find("Standard");
            return shader;
        }

        static Material MakeMaterial(string name, Color color, Texture texture = null, Vector2? tiling = null)
        {
            string path = $"{MaterialFolder}/{name}.mat";
            var mat = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (mat == null)
            {
                mat = new Material(LitShader());
                AssetDatabase.CreateAsset(mat, path);
            }

            mat.color = color;
            if (texture != null)
            {
                mat.mainTexture = texture;
                mat.mainTextureScale = tiling ?? Vector2.one;
            }
            if (mat.HasProperty("_Smoothness")) mat.SetFloat("_Smoothness", 0.15f);
            mat.enableInstancing = true;   // cheaper drawing of many copies (good for phones)
            EditorUtility.SetDirty(mat);
            return mat;
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
            {
                for (int x = 0; x < size; x++)
                {
                    bool light = ((x / 32) + (y / 32)) % 2 == 0;
                    byte v = light ? (byte)210 : (byte)160;
                    pixels[y * size + x] = new Color32(v, v, v, 255);
                }
            }
            tex.SetPixels32(pixels);
            tex.wrapMode = TextureWrapMode.Repeat;
            tex.filterMode = FilterMode.Bilinear;
            tex.anisoLevel = 2;
            tex.Apply(true);
            AssetDatabase.CreateAsset(tex, path);
            return tex;
        }

        // ------------------------------------------------------------------
        // Test yard
        // ------------------------------------------------------------------
        static void BuildTestYard(Materials m)
        {
            var yard = new GameObject("Test Yard").transform;

            var ground = GameObject.CreatePrimitive(PrimitiveType.Plane);
            ground.name = "Ground (200 x 200 m)";
            ground.transform.SetParent(yard);
            ground.transform.localScale = new Vector3(20f, 1f, 20f);
            ground.GetComponent<Renderer>().sharedMaterial = m.Ground;
            ground.isStatic = true;

            // Buildings: camera collision test.
            BoxOnGround("Building A", yard, m.Wall, -12f, 16f, 8f, 12f, 10f);
            BoxOnGround("Building B", yard, m.Wall, 13f, 20f, 8f, 9f, 14f);
            BoxOnGround("Building C", yard, m.Wall, -12f, 34f, 8f, 15f, 10f);

            // Ramp up to a platform (slope test).
            Box("Ramp", yard, m.Ramp, new Vector3(0f, 1.2f, 25f), new Vector3(4f, 0.4f, 10f), new Vector3(-15f, 0f, 0f));
            BoxOnGround("Ramp Platform", yard, m.Wall, 0f, 33f, 4f, 2.6f, 6f);

            // Stairs (each step 0.25 m, below the 0.35 m step limit).
            for (int i = 0; i < 8; i++)
            {
                float h = (i + 1) * 0.25f;
                BoxOnGround("Step " + (i + 1), yard, m.Wall, 6f, 8f + i * 0.4f, 2.5f, h, 0.4f);
            }
            BoxOnGround("Stairs Platform", yard, m.Wall, 6f, 13.2f, 2.5f, 2f, 4f);

            // Crouch tunnel: roof is 1.35 m high, so you MUST crouch to pass.
            BoxOnGround("Tunnel Wall L", yard, m.Wall, -6.3f, 11f, 0.4f, 2.4f, 6f);
            BoxOnGround("Tunnel Wall R", yard, m.Wall, -3.7f, 11f, 0.4f, 2.4f, 6f);
            Box("Tunnel Roof (1.35 m)", yard, m.Accent, new Vector3(-5f, 1.5f, 11f), new Vector3(3f, 0.3f, 6f));

            // Jump test: 0.6 m (easy) and 1.0 m (needs a full jump).
            BoxOnGround("Jump Box 0.6m", yard, m.Accent, 4f, -6f, 1.5f, 0.6f, 1.5f);
            BoxOnGround("Jump Box 1.0m", yard, m.Accent, 6.5f, -6f, 1.5f, 1.0f, 1.5f);

            // Pillars: walk between them and watch the camera avoid them.
            for (int i = 0; i < 6; i++)
                BoxOnGround("Pillar " + (i + 1), yard, m.Wall, -8f + i * 3.2f, -15f, 0.8f, 4f, 0.8f);

            // Pushable crates.
            for (int i = 0; i < 4; i++)
            {
                var crate = Box("Crate " + (i + 1), yard, m.Crate,
                                new Vector3(-3f - i * 1.3f, 0.5f, -4f), Vector3.one);
                crate.isStatic = false;
                var rb = crate.AddComponent<Rigidbody>();
                rb.mass = 15f;
            }
        }

        static GameObject BoxOnGround(string name, Transform parent, Material mat,
                                      float x, float z, float sizeX, float height, float sizeZ)
        {
            return Box(name, parent, mat, new Vector3(x, height * 0.5f, z), new Vector3(sizeX, height, sizeZ));
        }

        static GameObject Box(string name, Transform parent, Material mat, Vector3 center, Vector3 size,
                              Vector3? euler = null)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            go.name = name;
            go.transform.SetParent(parent);
            go.transform.position = center;
            go.transform.localScale = size;
            if (euler.HasValue) go.transform.rotation = Quaternion.Euler(euler.Value);
            go.GetComponent<Renderer>().sharedMaterial = mat;
            go.isStatic = true;   // static objects are batched together = faster on phones
            return go;
        }

        // ------------------------------------------------------------------
        // Player (placeholder capsule; real Vikram model comes later)
        // ------------------------------------------------------------------
        static PlayerMotor BuildPlayer(Materials m)
        {
            var root = new GameObject("Vikram (Player)");
            root.tag = "Player";
            root.layer = PlayerLayer;
            root.transform.position = new Vector3(0f, 0.05f, 0f);

            var cc = root.AddComponent<CharacterController>();
            cc.height = 1.8f;
            cc.radius = 0.35f;
            cc.center = new Vector3(0f, 0.9f, 0f);
            cc.stepOffset = 0.35f;
            cc.skinWidth = 0.04f;
            cc.slopeLimit = 50f;
            cc.minMoveDistance = 0f;

            var body = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            body.name = "Body (placeholder)";
            Object.DestroyImmediate(body.GetComponent<Collider>());
            body.layer = PlayerLayer;
            body.transform.SetParent(root.transform, false);
            body.transform.localPosition = new Vector3(0f, 0.9f, 0f);
            body.transform.localScale = new Vector3(0.7f, 0.9f, 0.7f);
            body.GetComponent<Renderer>().sharedMaterial = m.Player;

            // Yellow "nose" shows which way Vikram faces.
            var nose = GameObject.CreatePrimitive(PrimitiveType.Cube);
            nose.name = "Facing Marker";
            Object.DestroyImmediate(nose.GetComponent<Collider>());
            nose.layer = PlayerLayer;
            nose.transform.SetParent(body.transform, false);
            nose.transform.localPosition = new Vector3(0f, 0.55f, 0.5f);
            nose.transform.localScale = new Vector3(0.3f, 0.12f, 0.35f);
            nose.GetComponent<Renderer>().sharedMaterial = m.Accent;

            var motor = root.AddComponent<PlayerMotor>();
            root.AddComponent<PlayerAnimatorBridge>();
            SetRef(motor, "bodyVisual", body.transform);
            return motor;
        }

        static Camera SetupCamera(PlayerMotor player)
        {
            Camera cam = Camera.main;
            if (cam == null)
            {
                var go = new GameObject("Main Camera");
                go.tag = "MainCamera";
                cam = go.AddComponent<Camera>();
            }
            cam.nearClipPlane = 0.1f;
            cam.farClipPlane = 400f;
            cam.transform.position = player.transform.position + new Vector3(0.5f, 2f, -3.4f);

            var follow = cam.gameObject.AddComponent<ThirdPersonCamera>();
            SetRef(follow, "target", player);
            return cam;
        }

        static void SetupLight()
        {
            var sun = Object.FindFirstObjectByType<Light>();
            if (sun == null) return;
            sun.name = "Sun";
            sun.transform.rotation = Quaternion.Euler(45f, -35f, 0f);
            sun.shadows = LightShadows.Soft;
        }

        // ------------------------------------------------------------------
        // HUD: joystick, look zone, buttons, placeholders
        // ------------------------------------------------------------------
        static void BuildHud()
        {
            Font font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            Sprite circle = AssetDatabase.GetBuiltinExtraResource<Sprite>("UI/Skin/Knob.psd");

            var canvasGo = new GameObject("HUD Canvas", typeof(RectTransform), typeof(Canvas),
                                          typeof(CanvasScaler), typeof(GraphicRaycaster));
            canvasGo.layer = UILayer;
            var canvas = canvasGo.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            var scaler = canvasGo.GetComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1920f, 1080f);
            scaler.screenMatchMode = CanvasScaler.ScreenMatchMode.MatchWidthOrHeight;
            scaler.matchWidthOrHeight = 1f;   // landscape game: keep button size based on height
            Transform hud = canvasGo.transform;

            // 1) Look zone FIRST, so it is behind everything else.
            var lookImage = NewUI<Image>("Look Zone (drag anywhere)", hud);
            lookImage.color = new Color(0f, 0f, 0f, 0f);
            Stretch(lookImage.rectTransform, Vector2.zero, Vector2.one);
            var look = lookImage.gameObject.AddComponent<TouchLookZone>();

            // 2) Joystick zone: bottom-left 42% x 75% of the screen.
            var stickZone = NewUI<Image>("Move Joystick Zone", hud);
            stickZone.color = new Color(0f, 0f, 0f, 0f);
            Stretch(stickZone.rectTransform, Vector2.zero, new Vector2(0.42f, 0.75f));

            var stickBg = NewUI<Image>("Joystick Base", stickZone.transform);
            stickBg.sprite = circle;
            stickBg.color = new Color(1f, 1f, 1f, 0.22f);
            stickBg.raycastTarget = false;
            Place(stickBg.rectTransform, Vector2.zero, new Vector2(260f, 300f), new Vector2(260f, 260f));

            var stickKnob = NewUI<Image>("Joystick Knob", stickBg.transform);
            stickKnob.sprite = circle;
            stickKnob.color = new Color(1f, 1f, 1f, 0.85f);
            stickKnob.raycastTarget = false;
            Place(stickKnob.rectTransform, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(115f, 115f));

            var stick = stickZone.gameObject.AddComponent<VirtualJoystick>();
            SetRef(stick, "background", stickBg.rectTransform);
            SetRef(stick, "handle", stickKnob.rectTransform);
            SetRef(stick, "handleImage", stickKnob);

            // 3) Right-bottom buttons. Space is kept free for FIRE, RELOAD,
            //    SWITCH WEAPON, PICK UP and ENTER VEHICLE in later steps.
            var crouch = MakeButton("CROUCH", hud, circle, font, new Vector2(-300f, 120f), 130f, null);
            var jump = MakeButton("JUMP", hud, circle, font, new Vector2(-130f, 250f), 130f, null);
            var aim = MakeButton("AIM", hud, circle, font, new Vector2(-130f, 470f), 120f, look);

            // 4) Placeholders for the final layout (made in later steps).
            Placeholder("MINI-MAP\n(Step 2)", hud, font, new Vector2(0f, 1f), new Vector2(24f, -24f), new Vector2(240f, 240f));
            Placeholder("WANTED: none\n(Step 4)", hud, font, new Vector2(0f, 1f), new Vector2(276f, -24f), new Vector2(220f, 80f));
            Placeholder("II", hud, font, new Vector2(1f, 1f), new Vector2(-24f, -24f), new Vector2(90f, 90f));
            Placeholder("OBJECTIVE: Test the yard - tunnel (crouch), stairs, ramp, crates, pillars",
                        hud, font, new Vector2(1f, 1f), new Vector2(-130f, -24f), new Vector2(560f, 90f));

            // 5) FPS counter, top middle.
            var fpsText = NewUI<Text>("FPS Counter", hud);
            fpsText.font = font;
            fpsText.fontSize = 30;
            fpsText.alignment = TextAnchor.UpperCenter;
            fpsText.raycastTarget = false;
            Place(fpsText.rectTransform, new Vector2(0.5f, 1f), new Vector2(0f, -10f), new Vector2(400f, 50f));
            fpsText.gameObject.AddComponent<FpsCounter>();

            // 6) Input hub: connects all of the above to the game.
            var hubGo = new GameObject("Player Input");
            var hub = hubGo.AddComponent<PlayerInputHub>();
            SetRef(hub, "moveStick", stick);
            SetRef(hub, "lookZone", look);
            SetRef(hub, "jumpButton", jump);
            SetRef(hub, "crouchButton", crouch);
            SetRef(hub, "aimButton", aim);

            CreateEventSystem();
        }

        static TouchButton MakeButton(string label, Transform parent, Sprite circle, Font font,
                                      Vector2 posFromBottomRight, float size, TouchLookZone dragToLook)
        {
            var img = NewUI<Image>(label + " Button", parent);
            img.sprite = circle;
            img.color = new Color(0.1f, 0.1f, 0.1f, 0.45f);
            Place(img.rectTransform, new Vector2(1f, 0f), posFromBottomRight, new Vector2(size, size));

            var text = NewUI<Text>("Label", img.transform);
            text.text = label;
            text.font = font;
            text.fontSize = 26;
            text.fontStyle = FontStyle.Bold;
            text.color = Color.white;
            text.alignment = TextAnchor.MiddleCenter;
            text.raycastTarget = false;
            Stretch(text.rectTransform, Vector2.zero, Vector2.one);

            var button = img.gameObject.AddComponent<TouchButton>();
            if (dragToLook != null) SetRef(button, "passDragToLook", dragToLook);
            return button;
        }

        static void Placeholder(string label, Transform parent, Font font, Vector2 anchor,
                                Vector2 position, Vector2 size)
        {
            var img = NewUI<Image>("Placeholder - " + label.Split('\n')[0], parent);
            img.color = new Color(0f, 0f, 0f, 0.35f);
            img.raycastTarget = false;
            var rt = img.rectTransform;
            rt.anchorMin = rt.anchorMax = anchor;
            rt.pivot = anchor;
            rt.anchoredPosition = position;
            rt.sizeDelta = size;

            var text = NewUI<Text>("Label", img.transform);
            text.text = label;
            text.font = font;
            text.fontSize = 22;
            text.color = new Color(1f, 1f, 1f, 0.8f);
            text.alignment = TextAnchor.MiddleCenter;
            text.raycastTarget = false;
            Stretch(text.rectTransform, new Vector2(0.03f, 0.03f), new Vector2(0.97f, 0.97f));
        }

        static void CreateEventSystem()
        {
            var go = new GameObject("EventSystem", typeof(EventSystem));
            go.GetComponent<EventSystem>().pixelDragThreshold = 3;   // small = camera reacts at once

            // Use the new Input System UI module if this project uses it, else the old one.
#if ENABLE_INPUT_SYSTEM
            var newModule = System.Type.GetType("UnityEngine.InputSystem.UI.InputSystemUIInputModule, Unity.InputSystem");
            if (newModule != null)
            {
                go.AddComponent(newModule);
                return;
            }
#endif
            go.AddComponent<StandaloneInputModule>();
        }

        // ------------------------------------------------------------------
        // Small helpers
        // ------------------------------------------------------------------
        static T NewUI<T>(string name, Transform parent) where T : Component
        {
            var go = new GameObject(name, typeof(RectTransform));
            go.layer = UILayer;
            go.transform.SetParent(parent, false);
            return go.AddComponent<T>();
        }

        static void Stretch(RectTransform rt, Vector2 min, Vector2 max)
        {
            rt.anchorMin = min;
            rt.anchorMax = max;
            rt.pivot = new Vector2(0.5f, 0.5f);
            rt.offsetMin = Vector2.zero;
            rt.offsetMax = Vector2.zero;
        }

        static void Place(RectTransform rt, Vector2 anchor, Vector2 position, Vector2 size)
        {
            rt.anchorMin = anchor;
            rt.anchorMax = anchor;
            rt.pivot = new Vector2(0.5f, 0.5f);
            rt.anchoredPosition = position;
            rt.sizeDelta = size;
        }

        // Fill a private [SerializeField] on a component (same as dragging it in the Inspector).
        static void SetRef(Object target, string fieldName, Object value)
        {
            var so = new SerializedObject(target);
            var prop = so.FindProperty(fieldName);
            if (prop == null)
            {
                Debug.LogError($"[City Thief] Field '{fieldName}' not found on {target.GetType().Name}");
                return;
            }
            prop.objectReferenceValue = value;
            so.ApplyModifiedPropertiesWithoutUndo();
        }

        static void EnsureFolder(string path)
        {
            if (AssetDatabase.IsValidFolder(path)) return;
            string parent = Path.GetDirectoryName(path).Replace('\\', '/');
            EnsureFolder(parent);
            AssetDatabase.CreateFolder(parent, Path.GetFileName(path));
        }

        static void AddSceneToBuildSettings(string path)
        {
            var scenes = new List<EditorBuildSettingsScene>(EditorBuildSettings.scenes);
            if (!scenes.Exists(s => s.path == path))
            {
                scenes.Insert(0, new EditorBuildSettingsScene(path, true));
                EditorBuildSettings.scenes = scenes.ToArray();
            }
        }
    }
}
