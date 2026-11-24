using UnityEngine;
using UnityEngine.EventSystems;

namespace CityThief.Controls
{
    // Drag anywhere on this zone to turn the camera (like PUBG).
    // Put it on a full-screen invisible Image that sits BEHIND all buttons,
    // so buttons and the joystick get their touches first.
    public class TouchLookZone : MonoBehaviour, IPointerDownHandler, IDragHandler, IPointerUpHandler
    {
        const int NoPointer = int.MinValue;

        // Screen heights differ a lot between phones.
        // We convert finger movement to a 1080p screen so the feel is the same everywhere.
        const float ReferenceScreenHeight = 1080f;

        int pointerId = NoPointer;
        Vector2 pendingDelta;

        public bool IsHeld => pointerId != NoPointer;

        public void OnPointerDown(PointerEventData eventData)
        {
            if (pointerId == NoPointer) pointerId = eventData.pointerId;
        }

        public void OnDrag(PointerEventData eventData)
        {
            if (eventData.pointerId != pointerId) return;
            AddDelta(eventData.delta);
        }

        public void OnPointerUp(PointerEventData eventData)
        {
            if (eventData.pointerId == pointerId) pointerId = NoPointer;
        }

        void OnDisable()
        {
            pointerId = NoPointer;
            pendingDelta = Vector2.zero;
        }

        // Other controls (for example the FIRE or AIM button) can also send drag
        // movement here, so you can shoot and turn with the same thumb.
        public void AddDelta(Vector2 screenPixels)
        {
            float scale = ReferenceScreenHeight / Mathf.Max(1, Screen.height);
            pendingDelta += screenPixels * scale;
        }

        // Returns all finger movement since the last call, then clears it.
        public Vector2 ConsumeDelta()
        {
            Vector2 d = pendingDelta;
            pendingDelta = Vector2.zero;
            return d;
        }
    }
}
