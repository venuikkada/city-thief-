using UnityEngine;

namespace CityThief.Core
{
    // Gives each car or person a random colour from a list when it appears,
    // so 20 copies of the same model still look different.
    public class RandomBodyColor : MonoBehaviour
    {
        [SerializeField] Renderer[] targets;
        [SerializeField] Color[] palette;

        void Awake()
        {
            if (palette == null || palette.Length == 0 || targets == null) return;
            Color color = palette[Random.Range(0, palette.Length)];
            foreach (var r in targets) RendererColor.Set(r, color);
        }
    }
}
