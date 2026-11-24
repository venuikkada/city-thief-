using UnityEngine;
using UnityEngine.UI;

namespace CityThief.HUD
{
    // Shows frames per second on screen. Use it while testing on real phones.
    // Green = at target, yellow = a bit slow, red = too slow.
    [RequireComponent(typeof(Text))]
    public class FpsCounter : MonoBehaviour
    {
        [SerializeField] float refreshSeconds = 0.5f;

        Text label;
        int frames;
        float timer;

        void Awake()
        {
            label = GetComponent<Text>();
        }

        void Update()
        {
            frames++;
            timer += Time.unscaledDeltaTime;
            if (timer < refreshSeconds) return;

            float fps = frames / timer;
            frames = 0;
            timer = 0f;

            int target = Application.targetFrameRate > 0 ? Application.targetFrameRate : 60;
            label.text = $"{fps:0} FPS (target {target})";
            label.color = fps >= target * 0.92f ? Color.green
                        : fps >= target * 0.75f ? Color.yellow
                        : Color.red;
        }
    }
}
