using System.Collections.Generic;
using System.IO;
using UnityEditor;
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
    // Shared helpers for all the one-click scene builders.
    public static class BuilderUtils
    {
        public const string Root = "Assets/_CityThief";
        public const int UILayer = 5;   // Unity's built-in "UI" layer

        // ------------------------------------------------------------------
        // Project setup
        // ------------------------------------------------------------------

        // Creates our physics layers (Player, Vehicle, NPC) if they are missing.
        public static void EnsureLayers()
        {
            var assets = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/TagManager.asset");
            if (assets == null || assets.Length == 0) return;
            var tagManager = new SerializedObject(assets[0]);
            var layers = tagManager.FindProperty("layers");
            SetLayerName(layers, ProjectLayers.Player, "Player");
            SetLayerName(layers, ProjectLayers.Vehicle, "Vehicle");
            SetLayerName(layers, ProjectLayers.NPC, "NPC");
            tagManager.ApplyModifiedProperties();
        }

        static void SetLayerName(SerializedProperty layers, int index, string name)
        {
            var p = layers.GetArrayElementAtIndex(index);
            if (string.IsNullOrEmpty(p.stringValue)) p.stringValue = name;
            else if (p.stringValue != name)
                Debug.LogWarning($"[City Thief] Layer {index} is '{p.stringValue}', expected '{name}'. Please rename it.");
        }

        public static void EnsureFolder(string path)
        {
            if (AssetDatabase.IsValidFolder(path)) return;
            string parent = Path.GetDirectoryName(path).Replace('\\', '/');
            EnsureFolder(parent);
            AssetDatabase.CreateFolder(parent, Path.GetFileName(path));
        }

        public static void AddSceneToBuildSettings(string path)
        {
            var scenes = new List<EditorBuildSettingsScene>(EditorBuildSettings.scenes);
            if (!scenes.Exists(s => s.path == path))
            {
                scenes.Insert(0, new EditorBuildSettingsScene(path, true));
                EditorBuildSettings.scenes = scenes.ToArray();
            }
        }

        // ------------------------------------------------------------------
        // Materials and objects
        // ------------------------------------------------------------------

        public static Shader LitShader()
        {
            // URP first (our chosen pipeline), fall back to Built-in if needed.
            Shader shader = Shader.Find("Universal Render Pipeline/Lit");
            if (shader == null) shader = Shader.Find("Standard");
            return shader;
        }

        public static Material MakeMaterial(string folder, string name, Color color,
                                            Texture texture = null, Vector2? tiling = null, float smoothness = 0.15f)
        {
            EnsureFolder(folder);
            string path = $"{folder}/{name}.mat";
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
            if (mat.HasProperty("_Smoothness")) mat.SetFloat("_Smoothness", smoothness);
            if (mat.HasProperty("_Glossiness")) mat.SetFloat("_Glossiness", smoothness);
            mat.enableInstancing = true;   // cheaper drawing of many copies
            EditorUtility.SetDirty(mat);
            return mat;
        }

        // A box (cube) in world space. Static = batched together = faster on phones.
        public static GameObject Box(string name, Transform parent, Material mat, Vector3 center, Vector3 size,
                                     Vector3? euler = null, bool isStatic = true)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            go.name = name;
            go.transform.SetParent(parent);
            go.transform.position = center;
            go.transform.localScale = size;
            if (euler.HasValue) go.transform.rotation = Quaternion.Euler(euler.Value);
            go.GetComponent<Renderer>().sharedMaterial = mat;
            go.isStatic = isStatic;
            return go;
        }

        // A box sitting on a surface at height "baseY".
        public static GameObject BoxOn(string name, Transform parent, Material mat, float baseY,
                                       float x, float z, float sizeX, float height, float sizeZ)
        {
            return Box(name, parent, mat, new Vector3(x, baseY + height * 0.5f, z), new Vector3(sizeX, height, sizeZ));
        }

        // A primitive used only for looks (collider removed).
        public static GameObject VisualPart(PrimitiveType type, string name, Transform parent, Material mat,
                                            Vector3 localPos, Vector3 localScale, Vector3? localEuler = null)
        {
            var go = GameObject.CreatePrimitive(type);
            go.name = name;
            Object.DestroyImmediate(go.GetComponent<Collider>());
            go.layer = parent.gameObject.layer;
            go.transform.SetParent(parent, false);
            go.transform.localPosition = localPos;
            go.transform.localScale = localScale;
            if (localEuler.HasValue) go.transform.localRotation = Quaternion.Euler(localEuler.Value);
            go.GetComponent<Renderer>().sharedMaterial = mat;
            return go;
        }

        // ------------------------------------------------------------------
        // Player and camera
        // ------------------------------------------------------------------

        public static PlayerMotor BuildPlayer(Vector3 position, float yaw, Material bodyMat, Material markerMat)
        {
            var root = new GameObject("Vikram (Player)");
            root.tag = "Player";
            root.layer = ProjectLayers.Player;
            root.transform.SetPositionAndRotation(position, Quaternion.Euler(0f, yaw, 0f));

            var cc = root.AddComponent<CharacterController>();
            cc.height = 1.8f;
            cc.radius = 0.35f;
            cc.center = new Vector3(0f, 0.9f, 0f);
            cc.stepOffset = 0.35f;
            cc.skinWidth = 0.04f;
            cc.slopeLimit = 50f;
            cc.minMoveDistance = 0f;

            var body = VisualPart(PrimitiveType.Capsule, "Body (placeholder)", root.transform, bodyMat,
                                  new Vector3(0f, 0.9f, 0f), new Vector3(0.7f, 0.9f, 0.7f));
            // Yellow "nose" shows which way Vikram faces.
            VisualPart(PrimitiveType.Cube, "Facing Marker", body.transform, markerMat,
                       new Vector3(0f, 0.55f, 0.5f), new Vector3(0.3f, 0.12f, 0.35f));

            var motor = root.AddComponent<PlayerMotor>();
            root.AddComponent<PlayerAnimatorBridge>();
            SetRef(motor, "bodyVisual", body.transform);
            return motor;
        }

        public static Camera SetupCamera(PlayerMotor player, float farClip = 400f)
        {
            Camera cam = Camera.main;
            if (cam == null)
            {
                var go = new GameObject("Main Camera");
                go.tag = "MainCamera";
                cam = go.AddComponent<Camera>();
            }
            cam.nearClipPlane = 0.1f;
            cam.farClipPlane = farClip;
            cam.transform.position = player.transform.position + player.transform.rotation * new Vector3(0.5f, 2f, -3.4f);

            var follow = cam.gameObject.AddComponent<ThirdPersonCamera>();
            SetRef(follow, "target", player);
            SetRef(player, "cameraTransform", cam.transform);
            return cam;
        }

        public static void SetupSun(Vector3 euler)
        {
            var sun = Object.FindFirstObjectByType<Light>();
            if (sun == null) return;
            sun.name = "Sun";
            sun.transform.rotation = Quaternion.Euler(euler);
            sun.shadows = LightShadows.Soft;
        }

        // ------------------------------------------------------------------
        // HUD
        // ------------------------------------------------------------------

        public class HudParts
        {
            public Transform root;
            public Font font;
            public Sprite circle;
            public TouchLookZone look;
            public VirtualJoystick stick;
            public TouchButton jump, crouch, aim;
            public PlayerInputHub hub;
        }

        public static Font DefaultFont() => Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
        public static Sprite CircleSprite() => AssetDatabase.GetBuiltinExtraResource<Sprite>("UI/Skin/Knob.psd");

        public static Canvas NewCanvas(string name, int sortingOrder)
        {
            var go = new GameObject(name, typeof(RectTransform), typeof(Canvas), typeof(CanvasScaler));
            go.layer = UILayer;
            var canvas = go.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = sortingOrder;
            var scaler = go.GetComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1920f, 1080f);
            scaler.screenMatchMode = CanvasScaler.ScreenMatchMode.MatchWidthOrHeight;
            scaler.matchWidthOrHeight = 1f;   // landscape game: size by screen height
            return canvas;
        }

        // The on-foot controls used in every scene: look zone, joystick, JUMP, CROUCH, AIM, FPS.
        public static HudParts BuildOnFootHud(string objective, bool mapAndWantedPlaceholders)
        {
            var parts = new HudParts { font = DefaultFont(), circle = CircleSprite() };

            Canvas canvas = NewCanvas("HUD Canvas", 0);
            canvas.gameObject.AddComponent<GraphicRaycaster>();
            Transform hud = canvas.transform;
            parts.root = hud;

            // 1) Look zone FIRST, so it is behind everything else.
            var lookImage = NewUI<Image>("Look Zone (drag anywhere)", hud);
            lookImage.color = new Color(0f, 0f, 0f, 0f);
            Stretch(lookImage.rectTransform, Vector2.zero, Vector2.one);
            parts.look = lookImage.gameObject.AddComponent<TouchLookZone>();

            // 2) Joystick zone: bottom-left 42% x 75% of the screen.
            var stickZone = NewUI<Image>("Move Joystick Zone", hud);
            stickZone.color = new Color(0f, 0f, 0f, 0f);
            Stretch(stickZone.rectTransform, Vector2.zero, new Vector2(0.42f, 0.75f));

            var stickBg = NewUI<Image>("Joystick Base", stickZone.transform);
            stickBg.sprite = parts.circle;
            stickBg.color = new Color(1f, 1f, 1f, 0.22f);
            stickBg.raycastTarget = false;
            Place(stickBg.rectTransform, Vector2.zero, new Vector2(260f, 300f), new Vector2(260f, 260f));

            var stickKnob = NewUI<Image>("Joystick Knob", stickBg.transform);
            stickKnob.sprite = parts.circle;
            stickKnob.color = new Color(1f, 1f, 1f, 0.85f);
            stickKnob.raycastTarget = false;
            Place(stickKnob.rectTransform, new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(115f, 115f));

            parts.stick = stickZone.gameObject.AddComponent<VirtualJoystick>();
            SetRef(parts.stick, "background", stickBg.rectTransform);
            SetRef(parts.stick, "handle", stickKnob.rectTransform);
            SetRef(parts.stick, "handleImage", stickKnob);

            // 3) Right-bottom buttons. Space is kept for FIRE, RELOAD, SWITCH,
            //    PICK UP and ENTER VEHICLE in later steps.
            parts.crouch = MakeButton("CROUCH", hud, parts, new Vector2(-300f, 120f), 130f, null);
            parts.jump = MakeButton("JUMP", hud, parts, new Vector2(-130f, 250f), 130f, null);
            parts.aim = MakeButton("AIM", hud, parts, new Vector2(-130f, 470f), 120f, parts.look);

            // 4) Placeholders for parts made in later steps.
            if (mapAndWantedPlaceholders)
            {
                Placeholder("MINI-MAP\n(Step 2)", hud, parts.font, new Vector2(0f, 1f), new Vector2(24f, -24f), new Vector2(240f, 240f));
                Placeholder("WANTED: none\n(Step 4)", hud, parts.font, new Vector2(0f, 1f), new Vector2(276f, -24f), new Vector2(220f, 80f));
            }
            Placeholder("II", hud, parts.font, new Vector2(1f, 1f), new Vector2(-24f, -24f), new Vector2(90f, 90f));
            Placeholder("OBJECTIVE: " + objective, hud, parts.font, new Vector2(1f, 1f), new Vector2(-130f, -24f), new Vector2(560f, 90f));

            // 5) FPS counter, top middle.
            var fpsText = NewText("FPS Counter", hud, parts.font, 30, TextAnchor.UpperCenter);
            Place(fpsText.rectTransform, new Vector2(0.5f, 1f), new Vector2(0f, -30f), new Vector2(400f, 50f));
            fpsText.gameObject.AddComponent<FpsCounter>();

            // 6) Input hub: connects all of the above to the game.
            var hubGo = new GameObject("Player Input");
            parts.hub = hubGo.AddComponent<PlayerInputHub>();
            SetRef(parts.hub, "moveStick", parts.stick);
            SetRef(parts.hub, "lookZone", parts.look);
            SetRef(parts.hub, "jumpButton", parts.jump);
            SetRef(parts.hub, "crouchButton", parts.crouch);
            SetRef(parts.hub, "aimButton", parts.aim);

            CreateEventSystem();
            return parts;
        }

        public static TouchButton MakeButton(string label, Transform parent, HudParts parts,
                                             Vector2 posFromBottomRight, float size, TouchLookZone dragToLook)
        {
            var img = NewUI<Image>(label.Replace("\n", " ") + " Button", parent);
            img.sprite = parts.circle;
            img.color = new Color(0.1f, 0.1f, 0.1f, 0.45f);
            Place(img.rectTransform, new Vector2(1f, 0f), posFromBottomRight, new Vector2(size, size));

            var text = NewText("Label", img.transform, parts.font, 26, TextAnchor.MiddleCenter);
            text.text = label;
            text.fontStyle = FontStyle.Bold;
            Stretch(text.rectTransform, Vector2.zero, Vector2.one);

            var button = img.gameObject.AddComponent<TouchButton>();
            if (dragToLook != null) SetRef(button, "passDragToLook", dragToLook);
            return button;
        }

        public static void Placeholder(string label, Transform parent, Font font, Vector2 anchor,
                                       Vector2 position, Vector2 size)
        {
            var img = NewUI<Image>("Panel - " + label.Split('\n')[0], parent);
            img.color = new Color(0f, 0f, 0f, 0.35f);
            img.raycastTarget = false;
            var rt = img.rectTransform;
            rt.anchorMin = rt.anchorMax = anchor;
            rt.pivot = anchor;
            rt.anchoredPosition = position;
            rt.sizeDelta = size;

            var text = NewText("Label", img.transform, font, 22, TextAnchor.MiddleCenter);
            text.text = label;
            text.color = new Color(1f, 1f, 1f, 0.85f);
            Stretch(text.rectTransform, new Vector2(0.03f, 0.03f), new Vector2(0.97f, 0.97f));
        }

        public static Text NewText(string name, Transform parent, Font font, int fontSize, TextAnchor align)
        {
            var text = NewUI<Text>(name, parent);
            text.font = font;
            text.fontSize = fontSize;
            text.alignment = align;
            text.color = Color.white;
            text.raycastTarget = false;
            text.horizontalOverflow = HorizontalWrapMode.Wrap;
            text.verticalOverflow = VerticalWrapMode.Overflow;
            return text;
        }

        public static void CreateEventSystem()
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

        public static T NewUI<T>(string name, Transform parent) where T : Component
        {
            var go = new GameObject(name, typeof(RectTransform));
            go.layer = UILayer;
            go.transform.SetParent(parent, false);
            return go.AddComponent<T>();
        }

        public static void Stretch(RectTransform rt, Vector2 min, Vector2 max)
        {
            rt.anchorMin = min;
            rt.anchorMax = max;
            rt.pivot = new Vector2(0.5f, 0.5f);
            rt.offsetMin = Vector2.zero;
            rt.offsetMax = Vector2.zero;
        }

        public static void Place(RectTransform rt, Vector2 anchor, Vector2 position, Vector2 size)
        {
            rt.anchorMin = anchor;
            rt.anchorMax = anchor;
            rt.pivot = new Vector2(0.5f, 0.5f);
            rt.anchoredPosition = position;
            rt.sizeDelta = size;
        }

        // ------------------------------------------------------------------
        // Inspector wiring
        // ------------------------------------------------------------------

        // Fill a private [SerializeField] (same as dragging it in the Inspector).
        public static void SetRef(Object target, string fieldName, Object value)
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

        // Fill a private [SerializeField] array of objects.
        public static void SetRefArray(Object target, string fieldName, Object[] values)
        {
            var so = new SerializedObject(target);
            var prop = so.FindProperty(fieldName);
            if (prop == null || !prop.isArray)
            {
                Debug.LogError($"[City Thief] Array '{fieldName}' not found on {target.GetType().Name}");
                return;
            }
            prop.arraySize = values.Length;
            for (int i = 0; i < values.Length; i++)
                prop.GetArrayElementAtIndex(i).objectReferenceValue = values[i];
            so.ApplyModifiedPropertiesWithoutUndo();
        }

        // Fill a private [SerializeField] Color array.
        public static void SetColorArray(Object target, string fieldName, Color[] values)
        {
            var so = new SerializedObject(target);
            var prop = so.FindProperty(fieldName);
            if (prop == null || !prop.isArray)
            {
                Debug.LogError($"[City Thief] Array '{fieldName}' not found on {target.GetType().Name}");
                return;
            }
            prop.arraySize = values.Length;
            for (int i = 0; i < values.Length; i++)
                prop.GetArrayElementAtIndex(i).colorValue = values[i];
            so.ApplyModifiedPropertiesWithoutUndo();
        }

        // Change a number field (float or int) on a component.
        public static void SetNumber(Object target, string fieldName, float value)
        {
            var so = new SerializedObject(target);
            var prop = so.FindProperty(fieldName);
            if (prop == null)
            {
                Debug.LogError($"[City Thief] Field '{fieldName}' not found on {target.GetType().Name}");
                return;
            }
            if (prop.propertyType == SerializedPropertyType.Integer) prop.intValue = Mathf.RoundToInt(value);
            else prop.floatValue = value;
            so.ApplyModifiedPropertiesWithoutUndo();
        }
    }
}
