using System;
using UnityEngine;
using UnityEngine.EventSystems;

namespace CityThief.Controls
{
    // A round on-screen button (JUMP, CROUCH, AIM, FIRE...).
    // Works with many fingers at once. Needs an Image on the same object.
    public class TouchButton : MonoBehaviour, IPointerDownHandler, IPointerUpHandler, IDragHandler
    {
        const int NoPointer = int.MinValue;

        [Tooltip("Optional. Dragging on this button also turns the camera (PUBG-style fire/aim).")]
        [SerializeField] TouchLookZone passDragToLook;

        [Tooltip("Button shrinks a little while pressed, so the player feels the tap.")]
        [Range(0.7f, 1f)] [SerializeField] float pressedScale = 0.9f;

        public event Action Pressed;
        public event Action Released;

        // True while a finger is on the button (good for FIRE and HANDBRAKE).
        public bool IsHeld => pointerId != NoPointer;

        int pointerId = NoPointer;
        bool pressPending;
        Vector3 baseScale = Vector3.one;

        void Awake()
        {
            baseScale = transform.localScale;
        }

        public void OnPointerDown(PointerEventData eventData)
        {
            if (IsHeld) return;
            pointerId = eventData.pointerId;
            pressPending = true;
            transform.localScale = baseScale * pressedScale;
            Pressed?.Invoke();
        }

        public void OnDrag(PointerEventData eventData)
        {
            if (eventData.pointerId != pointerId) return;
            if (passDragToLook != null) passDragToLook.AddDelta(eventData.delta);
        }

        public void OnPointerUp(PointerEventData eventData)
        {
            if (eventData.pointerId != pointerId) return;
            Release();
        }

        void OnDisable()
        {
            if (IsHeld) Release();
            pressPending = false;
        }

        // Returns true once per tap. Safe to call every frame.
        public bool ConsumePress()
        {
            bool pressed = pressPending;
            pressPending = false;
            return pressed;
        }

        void Release()
        {
            pointerId = NoPointer;
            transform.localScale = baseScale;
            Released?.Invoke();
        }
    }
}
