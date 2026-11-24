using UnityEngine;

namespace CityThief.Core
{
    // Change the colour of one object without making a new material.
    // (Saves memory. Works with URP and Built-in shaders.)
    public static class RendererColor
    {
        static readonly int BaseColorId = Shader.PropertyToID("_BaseColor");   // URP
        static readonly int ColorId = Shader.PropertyToID("_Color");           // Built-in
        static MaterialPropertyBlock block;

        public static void Set(Renderer renderer, Color color)
        {
            if (renderer == null) return;
            if (block == null) block = new MaterialPropertyBlock();
            renderer.GetPropertyBlock(block);
            block.SetColor(BaseColorId, color);
            block.SetColor(ColorId, color);
            renderer.SetPropertyBlock(block);
        }
    }
}
