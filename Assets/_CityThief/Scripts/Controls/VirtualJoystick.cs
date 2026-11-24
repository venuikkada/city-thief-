using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace CityThief.Controls
{
    // Left-side movement joystick.
    // - "Floating": it appears wherever your thumb first touches inside its zone.
    // - Push the knob all the way to the edge to SPRINT.
    // Put this script on a big invisible Image that covers the left part of the screen.
    public class VirtualJoystick : MonoBehaviour, IPointerDownHandler, IDragHandler, IPointerUpHandler
    {
        const int NoPointer = int.MinValue;

        [Header("Parts")]
        [Tooltip("The round base of the joystick (child of this zone).")]
        [SerializeField] RectTransform background;
        [Tooltip("The small knob that moves (child of the background).")]
        [SerializeField] RectTransform handle;
        [Tooltip("Optional. The knob turns this colour while sprinting.")]
        [SerializeField] Image handleImage;

        [Header("Feel")]
        [Tooltip("Joystick jumps to where the thumb lands.")]
        [SerializeField] bool floating = true;
        [Tooltip("Small movements near the centre are ignored.")]
        [Range(0f, 0.3f)] [SerializeField] float deadZone = 0.08f;
        [Tooltip("How far (0-1) the knob must be pushed to start sprinting.")]
        [Range(0.7f, 1f)] [SerializeField] float sprintEdge = 0.97f;
        [SerializeField] Color normalColor = new Color(1f, 1f, 1f, 0.85f);
        [SerializeField] Color sprintColor = new Color(1f, 0.8f, 0.2f, 0.95f);

        // Direction and strength of the push. Length is between 0 and 1.
        public Vector2 Value { get; private set; }

        // True when the knob is pushed to the edge (sprint).
        public bool AtEdge { get; private set; }

        public bool IsHeld => pointerId != NoPointer;

        int pointerId = NoPointer;
        Vector2 restAnchoredPosition;

        void Awake()
        {
            // Remember where the joystick sits when nobody touches it.
            if (background != null) restAnchoredPosition = background.anchoredPosition;
        }

        public void OnPointerDown(PointerEventData eventData)
        {
            // Only one finger controls the joystick.
            if (IsHeld || background == null) return;
            pointerId = eventData.pointerId;

            if (floating)
            {
                // Move the joystick base under the thumb.
                var zone = (RectTransform)transform;
                if (RectTransformUtility.ScreenPointToWorldPointInRectangle(
                        zone, eventData.position, eventData.pressEventCamera, out Vector3 worldPoint))
                {
                    background.position = worldPoint;
                }
            }

            UpdateKnob(eventData);
        }

        public void OnDrag(PointerEventData eventData)
        {
            if (eventData.pointerId != pointerId) return;
            UpdateKnob(eventData);
        }

        public void OnPointerUp(PointerEventData eventData)
        {
            if (eventData.pointerId != pointerId) return;
            ResetStick();
        }

        void OnDisable()
        {
            ResetStick();
        }

        void UpdateKnob(PointerEventData eventData)
        {
            // Where is the finger, measured from the joystick centre?
            if (!RectTransformUtility.ScreenPointToLocalPointInRectangle(
                    background, eventData.position, eventData.pressEventCamera, out Vector2 local))
                return;

            float radius = background.rect.width * 0.5f;
            if (radius <= 0f) return;

            Vector2 raw = local / radius;           // 1.0 = finger exactly on the edge
            float rawLength = raw.magnitude;
            Vector2 clamped = Vector2.ClampMagnitude(raw, 1f);

            // Knob follows the finger, but stays inside the circle.
            if (handle != null) handle.anchoredPosition = clamped * radius;

            // Remove the dead zone and rescale so movement starts smoothly.
            float length = clamped.magnitude;
            if (length < deadZone)
            {
                Value = Vector2.zero;
            }
            else
            {
                float scaled = Mathf.InverseLerp(deadZone, 1f, length);
                Value = clamped / length * scaled;
            }

            AtEdge = rawLength >= sprintEdge;
            if (handleImage != null) handleImage.color = AtEdge ? sprintColor : normalColor;
        }

        void ResetStick()
        {
            pointerId = NoPointer;
            Value = Vector2.zero;
            AtEdge = false;
            if (handle != null) handle.anchoredPosition = Vector2.zero;
            if (handleImage != null) handleImage.color = normalColor;
            if (floating && background != null) background.anchoredPosition = restAnchoredPosition;
        }
    }
}
