using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

namespace CityThief.HUD
{
    // Round mini-map, top-left.
    // - Map turns with the camera, so "up" on the map = where you are looking.
    // - Arrow in the middle = Vikram. Dots = police (flash red/blue in a chase).
    // Keep it on its own Canvas: moving it every frame then does not
    // force the rest of the HUD to redraw.
    public class MiniMap : MonoBehaviour
    {
        [SerializeField] CityMapData mapData;
        [SerializeField] RectTransform content;
        [SerializeField] RectTransform playerArrow;
        [SerializeField] Sprite blipSprite;
        [Tooltip("Zoom: map pixels per metre.")]
        [SerializeField] float pixelsPerMetre = 1.3f;
        [SerializeField] float flashInterval = 0.3f;

        [Header("Colours")]
        [SerializeField] Color roadColor = new Color(0.55f, 0.56f, 0.6f, 1f);
        [SerializeField] Color blockColor = new Color(0.2f, 0.23f, 0.2f, 1f);
        [SerializeField] Color buildingColor = new Color(0.1f, 0.11f, 0.13f, 1f);

        readonly List<Image> blipPool = new List<Image>();
        Transform player;
        Transform cameraTransform;
        float flashTimer;
        bool flashOn;

        void Start()
        {
            var p = GameObject.FindWithTag("Player");
            if (p != null) player = p.transform;
            if (Camera.main != null) cameraTransform = Camera.main.transform;
            BuildMap();
        }

        void BuildMap()
        {
            if (mapData == null || content == null) return;

            // Draw blocks first, then buildings, then roads on top.
            DrawKind(CityMapData.Kind.Block, blockColor);
            DrawKind(CityMapData.Kind.Building, buildingColor);
            DrawKind(CityMapData.Kind.Road, roadColor);
        }

        void DrawKind(CityMapData.Kind kind, Color color)
        {
            foreach (var r in mapData.Rects)
            {
                if (r.kind != kind) continue;
                Image img = NewImage(kind.ToString(), null, color);
                img.rectTransform.anchoredPosition = r.center * pixelsPerMetre;
                img.rectTransform.sizeDelta = r.size * pixelsPerMetre;
            }
        }

        void LateUpdate()
        {
            if (player == null || content == null) return;

            // ---- Turn and slide the map so the player is in the middle ----
            float yaw = cameraTransform != null ? cameraTransform.eulerAngles.y : player.eulerAngles.y;
            Quaternion rot = Quaternion.Euler(0f, 0f, yaw);
            Vector2 playerOnMap = new Vector2(player.position.x, player.position.z) * pixelsPerMetre;
            content.localRotation = rot;
            content.anchoredPosition = -(Vector2)(rot * playerOnMap);

            if (playerArrow != null)
                playerArrow.localRotation = Quaternion.Euler(0f, 0f, yaw - player.eulerAngles.y);

            // ---- Dots ----
            flashTimer -= Time.deltaTime;
            if (flashTimer <= 0f)
            {
                flashTimer = flashInterval;
                flashOn = !flashOn;
            }

            var blips = MiniMapBlip.All;
            while (blipPool.Count < blips.Count)
                blipPool.Add(NewImage("Blip", blipSprite, Color.white));

            for (int i = 0; i < blipPool.Count; i++)
            {
                Image img = blipPool[i];
                if (i >= blips.Count || blips[i] == null)
                {
                    img.enabled = false;
                    continue;
                }

                MiniMapBlip b = blips[i];
                Vector3 wp = b.transform.position;
                img.enabled = true;
                img.rectTransform.anchoredPosition = new Vector2(wp.x, wp.z) * pixelsPerMetre;
                img.rectTransform.sizeDelta = Vector2.one * b.size;
                img.color = b.Flashing && flashOn ? b.flashColor : b.color;
            }
        }

        Image NewImage(string name, Sprite sprite, Color color)
        {
            var go = new GameObject(name, typeof(RectTransform), typeof(Image));
            go.transform.SetParent(content, false);
            var img = go.GetComponent<Image>();
            img.sprite = sprite;
            img.color = color;
            img.raycastTarget = false;
            var rt = img.rectTransform;
            rt.anchorMin = rt.anchorMax = new Vector2(0.5f, 0.5f);
            rt.pivot = new Vector2(0.5f, 0.5f);
            return img;
        }
    }
}
